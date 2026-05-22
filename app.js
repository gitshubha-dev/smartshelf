/* ─────────────────────────────────────────────
   SMARTSHELF — app.js
   All application logic: data, rendering, AI.
───────────────────────────────────────────── */

// ── Config ────────────────────────────────────
// Your API Gateway base URL. All Lambda routes hang off this.
const API_URL = 'https://1pggtbw2x6.execute-api.us-west-2.amazonaws.com';


// ── State ─────────────────────────────────────
// items is loaded from DynamoDB on boot, not localStorage.
let items        = [];
let activeFilter = 'all';


// ── Date helpers ──────────────────────────────

function today() {
  return new Date().toISOString().split('T')[0];
}

function daysUntil(dateStr) {
  return Math.ceil((new Date(dateStr) - new Date(today())) / 86400000);
}

function getStatus(dateStr) {
  const d = daysUntil(dateStr);
  if (d < 0)   return 'expired';
  if (d === 0) return 'today';
  if (d <= 3)  return 'soon';
  return 'ok';
}


// ── Badge helpers ─────────────────────────────

function statusBadge(dateStr) {
  const d = daysUntil(dateStr);
  const s = getStatus(dateStr);
  const labels = { expired: 'Expired', today: 'Today!', soon: `${d}d left`, ok: `${d}d left` };
  const cls    = { expired: 'badge-expired', today: 'badge-today', soon: 'badge-soon', ok: 'badge-ok' };
  return `<span class="badge ${cls[s]}">${labels[s]}</span>`;
}

function catBadge(cat) {
  const labels = { dairy: 'Dairy', produce: 'Produce', meat: 'Meat/Fish', frozen: 'Frozen', pantry: 'Pantry', other: 'Other' };
  return `<span class="item-cat cat-${cat}">${labels[cat] || cat}</span>`;
}


// ── Loading state helpers ─────────────────────

function setLoading(on) {
  // Dim the shelf card while waiting for API
  document.getElementById('table-wrap').style.opacity = on ? '0.4' : '1';
}


// ── API: Load all items from DynamoDB ─────────
// Called once on boot. Replaces the old localStorage read.
// GET /items → smartshelf-get-items Lambda → DynamoDB scan

async function loadItems() {
  setLoading(true);
  try {
    const res = await fetch(`${API_URL}/items`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // Lambda returns { items: [...] }
    // DynamoDB field names from the original build: name, expiryDate, category
    // We map them to match our frontend field names: name, date, cat
    items = (data.items || []).map(i => ({
      id:   i.id,
      name: i.name,
      date: i.expiryDate,
      cat:  i.category || 'other'
    }));
  } catch (err) {
    console.error('Failed to load items:', err);
    showError('Could not load items from server. Check your connection.');
  } finally {
    setLoading(false);
    render();
  }
}


// ── API: Add item to DynamoDB ─────────────────
// POST /items → smartshelf-add-item Lambda → DynamoDB put
// The Lambda expects: { name, expiryDate, category }

async function addItem() {
  const name = document.getElementById('item-name').value.trim();
  const date = document.getElementById('item-date').value;
  const cat  = document.getElementById('item-cat').value;

  if (!name || !date) {
    alert('Please enter both a name and expiry date.');
    return;
  }

  // Optimistically add to local state so the UI feels instant
  const tempId = 'temp-' + Date.now();
  items.push({ id: tempId, name, date, cat });
  render();

  document.getElementById('item-name').value = '';
  document.getElementById('item-date').value = '';

  try {
    const res = await fetch(`${API_URL}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Map back to the field names the Lambda expects
      body: JSON.stringify({ name, expiryDate: date, category: cat })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Replace the temp item with the real one returned by Lambda (which has the real DynamoDB id)
    items = items.map(i => i.id === tempId
      ? { id: data.id || data.item?.id || tempId, name, date, cat }
      : i
    );
    render();

  } catch (err) {
    console.error('Failed to add item:', err);
    // Rollback the optimistic update
    items = items.filter(i => i.id !== tempId);
    render();
    showError('Could not save item. Please try again.');
  }
}


// ── API: Delete item from DynamoDB ────────────
// DELETE /items/{id} → smartshelf-delete-item Lambda → DynamoDB delete

async function deleteItem(id) {
  // Optimistically remove from local state
  const removed = items.find(i => i.id === id);
  items = items.filter(i => i.id !== id);
  render();

  try {
    const res = await fetch(`${API_URL}/items/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.error('Failed to delete item:', err);
    // Rollback — put the item back
    if (removed) items.push(removed);
    render();
    showError('Could not delete item. Please try again.');
  }
}


// ── Error display ─────────────────────────────

function showError(msg) {
  const wrap = document.getElementById('table-wrap');
  const notice = document.createElement('div');
  notice.style.cssText = 'background:#FDECEA;color:#C1121F;padding:10px 12px;border-radius:6px;font-size:13px;margin-bottom:10px;';
  notice.textContent = msg;
  wrap.prepend(notice);
  setTimeout(() => notice.remove(), 4000);
}


// ── Filter ────────────────────────────────────

function setFilter(f, btn) {
  activeFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  render();
}


// ── Render ────────────────────────────────────

function render() {
  const expired = items.filter(i => getStatus(i.date) === 'expired').length;
  const soon    = items.filter(i => ['soon', 'today'].includes(getStatus(i.date))).length;
  document.getElementById('stat-total').textContent   = items.length;
  document.getElementById('stat-soon').textContent    = soon;
  document.getElementById('stat-expired').textContent = expired;

  let filtered = items;
  if (activeFilter === 'soon')    filtered = items.filter(i => ['soon', 'today'].includes(getStatus(i.date)));
  if (activeFilter === 'expired') filtered = items.filter(i => getStatus(i.date) === 'expired');
  if (activeFilter === 'ok')      filtered = items.filter(i => getStatus(i.date) === 'ok');

  filtered = [...filtered].sort((a, b) => new Date(a.date) - new Date(b.date));

  const wrap = document.getElementById('table-wrap');

  if (filtered.length === 0) {
    const msg = activeFilter === 'all'
      ? 'Add your first item above to get started.'
      : 'No items in this category.';
    wrap.innerHTML = `<div class="empty-state"><div class="icon">✅</div>${msg}</div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th class="col-cat">Category</th>
            <th>Expiry</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(i => `
            <tr>
              <td class="item-name">${i.name}</td>
              <td class="col-cat">${catBadge(i.cat)}</td>
              <td class="days-text">${i.date}</td>
              <td>${statusBadge(i.date)}</td>
              <td><button class="del-btn" onclick="deleteItem('${i.id}')">Remove</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}


// ── Recipe panel toggle ───────────────────────

function toggleRecipePanel() {
  const body    = document.getElementById('recipe-body');
  const chevron = document.getElementById('recipe-chevron');
  const isOpen  = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  chevron.classList.toggle('open', !isOpen);
}


// ── Parse Claude's response into recipe objects ──
//
// Claude returns plain text. We look for ### headings
// and split the response into one recipe object each.
// Each object has: { title, uses[], steps[] }

function parseRecipes(text) {
  const recipes = [];
  const blocks  = text.split(/\n(?=###\s)/);

  for (const block of blocks) {
    const lines = block.trim().split('\n').filter(Boolean);
    if (!lines.length) continue;

    const title = lines[0]
      .replace(/^###\s*/, '')
      .replace(/\*\*/g, '')
      .trim();
    if (!title || title.length < 3) continue;

    let uses = [];
    const usesLine = lines.find(l => /uses?:/i.test(l));
    if (usesLine) {
      uses = usesLine
        .replace(/uses?:\s*/i, '')
        .split(',')
        .map(s => s.replace(/\**/g, '').trim())
        .filter(Boolean);
    }

    const steps = lines
      .filter(l => /^\d+[\.\)]/.test(l.trim()) || /^[-•]\s/.test(l.trim()))
      .map(l => l
        .replace(/^\d+[\.\)]\s*/, '')
        .replace(/^[-•]\s*/, '')
        .replace(/\*\*/g, '')
        .trim()
      )
      .filter(Boolean);

    if (steps.length > 0) {
      recipes.push({ title, uses, steps });
    }
  }

  return recipes;
}


// ── Render parsed recipes as tabs ────────────

function renderTabs(recipes, inputTokens, outputTokens, itemCount) {
  const tabsEl   = document.getElementById('recipe-tabs');
  const streamEl = document.getElementById('recipe-stream');
  const metaEl   = document.getElementById('recipe-meta');

  const tabBar = recipes
    .map((r, i) => `<button class="tab-btn ${i === 0 ? 'active' : ''}" onclick="switchTab(${i})">${r.title}</button>`)
    .join('');

  const panes = recipes.map((r, i) => `
    <div class="tab-pane ${i === 0 ? 'active' : ''}" id="tab-pane-${i}">
      <div class="recipe-name">${r.title}</div>
      ${r.uses.length ? `<div class="recipe-uses">${r.uses.map(u => `<span>${u}</span>`).join('')}</div>` : ''}
      <ol class="recipe-steps">
        ${r.steps.map((s, si) => `
          <li>
            <span class="step-num">${si + 1}</span>
            <span>${s}</span>
          </li>`).join('')}
      </ol>
    </div>`).join('');

  tabsEl.innerHTML = `<div class="tab-bar">${tabBar}</div>${panes}`;
  tabsEl.classList.add('ready');
  streamEl.style.display = 'none';

  const n = itemCount;
  metaEl.innerHTML = `
    <span>Based on ${n} expiring item${n > 1 ? 's' : ''}</span>
    <span>${inputTokens} + ${outputTokens} tokens</span>`;
  metaEl.style.display = 'flex';

  document.getElementById('recipe-summary-title').textContent = `✦ ${recipes.length} recipe${recipes.length > 1 ? 's' : ''} suggested`;
  document.getElementById('recipe-summary-sub').textContent   = `Based on ${n} expiring item${n > 1 ? 's' : ''}`;
}

function switchTab(idx) {
  document.querySelectorAll('.tab-btn').forEach((b, i)  => b.classList.toggle('active', i === idx));
  document.querySelectorAll('.tab-pane').forEach((p, i) => p.classList.toggle('active', i === idx));
}


// ── AI: Suggest recipes via Anthropic API ─────
//
// The AI call still goes directly to Anthropic from the browser.
// In Phase 5 this would move to a Lambda function so the API
// key stays server-side. For now it needs a key in the headers.

async function suggestRecipes() {
  const btn      = document.getElementById('suggest-btn');
  const panel    = document.getElementById('recipe-panel');
  const streamEl = document.getElementById('recipe-stream');
  const tabsEl   = document.getElementById('recipe-tabs');
  const metaEl   = document.getElementById('recipe-meta');
  const body     = document.getElementById('recipe-body');
  const chevron  = document.getElementById('recipe-chevron');

  const expiringItems = items.filter(i => {
    const d = daysUntil(i.date);
    return d >= 0 && d <= 3;
  });

  if (expiringItems.length === 0) {
    alert('No items expiring in the next 3 days — nothing urgent to cook!');
    return;
  }

  btn.disabled = true;
  btn.textContent = '…';
  streamEl.innerHTML = '';
  streamEl.style.display = 'block';
  tabsEl.innerHTML = '';
  tabsEl.classList.remove('ready');
  metaEl.style.display = 'none';
  panel.style.display = 'block';
  body.classList.add('open');
  chevron.classList.add('open');
  document.getElementById('recipe-summary-title').textContent = '✦ Finding recipes…';
  document.getElementById('recipe-summary-sub').textContent   = '';

  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  const itemList = expiringItems
    .map(i => `- ${i.name} (${i.cat}, expires in ${daysUntil(i.date)} day${daysUntil(i.date) === 1 ? '' : 's'})`)
    .join('\n');

  const prompt = `You are a helpful home chef. I have these food items expiring very soon:\n\n${itemList}\n\nSuggest exactly 2-3 simple recipes using as many of these as possible.\nFor each recipe use this exact format:\n\n### Recipe Name\nUses: ingredient1, ingredient2\n1. Step one\n2. Step two\n3. Step three\n\nBe concise. No intro text, just the recipes.`;

  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'YOUR_ANTHROPIC_KEY_HERE',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 800,
        stream:     true,
        messages:   [{ role: 'user', content: prompt }]
      })
    });
  } catch (err) {
    streamEl.textContent = `Network error: ${err.message}`;
    resetBtn();
    return;
  }

  if (!response.ok) {
    const e = await response.json().catch(() => ({}));
    streamEl.textContent = `API error ${response.status}: ${e?.error?.message || 'unknown'}`;
    resetBtn();
    return;
  }

  const cursor = document.createElement('span');
  cursor.className = 'cursor-blink';
  streamEl.appendChild(cursor);

  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText     = '';
  let inputTokens  = 0;
  let outputTokens = 0;
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;

      let evt;
      try { evt = JSON.parse(data); } catch { continue; }

      if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
        fullText += evt.delta.text;
        streamEl.textContent = fullText;
        streamEl.appendChild(cursor);
      }

      if (evt.type === 'message_start' && evt.message?.usage) inputTokens  = evt.message.usage.input_tokens;
      if (evt.type === 'message_delta' && evt.usage)          outputTokens = evt.usage.output_tokens;
    }
  }

  cursor.remove();

  const recipes = parseRecipes(fullText);
  if (recipes.length > 0) {
    renderTabs(recipes, inputTokens, outputTokens, expiringItems.length);
  } else {
    streamEl.textContent = fullText;
    document.getElementById('recipe-summary-title').textContent = '✦ Recipes suggested';
    document.getElementById('recipe-summary-sub').textContent   = `Based on ${expiringItems.length} expiring item${expiringItems.length > 1 ? 's' : ''}`;
  }

  resetBtn();
}

function resetBtn() {
  const btn = document.getElementById('suggest-btn');
  btn.disabled    = false;
  btn.textContent = 'Suggest recipes';
}


// ── Boot ──────────────────────────────────────
// Load items from DynamoDB, then render.
// This replaces the old: items = JSON.parse(localStorage...)
loadItems();
