# SmartShelf — Serverless Food Expiry Tracker

A fully serverless web application built on AWS that helps households track food expiry dates and reduce waste. Built as a cloud engineering portfolio project.

## Live Demo

 **Live App → https://dr7rtsdccpi05.cloudfront.net**

## Architecture

```
Browser
  │
  ▼
Amazon S3 ──► CloudFront (HTTPS + CDN)
                    │
                    ▼
              API Gateway (REST)
                    │
          ┌─────────┼──────────┐
          ▼         ▼          ▼
     add-item   get-items  delete-item
     (Lambda)   (Lambda)   (Lambda)
          │         │          │
          └─────────┼──────────┘
                    ▼
               DynamoDB
             (SmartShelfItems)

EventBridge (cron: 8am daily)
     │
     ▼
expiry-checker (Lambda)
     │
     ▼
    SNS ──► Email Alert
```

## AWS Services Used

| Service | Purpose |
|---------|---------|
| S3 | Hosts the static frontend HTML/CSS/JS |
| CloudFront | CDN for HTTPS delivery and global low-latency access |
| API Gateway | REST API endpoint — routes requests to Lambda |
| Lambda (Python) | Serverless backend — add, get, delete items + expiry checker |
| DynamoDB | NoSQL database storing food items |
| SNS | Sends expiry alert emails to subscribed users |
| EventBridge | Cron schedule triggering the daily expiry check at 8am |
| CloudWatch | Monitoring dashboard — invocations, errors, duration |
| CloudFormation | Infrastructure as code — entire stack in one YAML template |
| IAM | Roles and policies controlling Lambda permissions |

## Features

- Add food items with name, category, and expiry date
- Filter by status: All / Expiring Soon / Expired / Good
- Color-coded status badges (green / amber / red)
- Automated daily email alerts for items expiring within 3 days
- Serverless — scales to zero when not in use, near-zero cost

## Deploy from Scratch

The entire infrastructure is defined in `smartshelf-stack.yaml`.

```bash
aws cloudformation deploy \
  --template-file smartshelf-stack.yaml \
  --stack-name smartshelf \
  --parameter-overrides AlertEmail=your@email.com \
  --capabilities CAPABILITY_NAMED_IAM
```

Then upload the frontend to S3:

```bash
aws s3 sync . s3://your-bucket-name --exclude "*.yaml" --exclude "*.md"
```

## Project Structure

```
smartshelf/
├── index.html              # Frontend — single page app
├── smartshelf-stack.yaml   # CloudFormation — full infrastructure as code
└── README.md
```

## What I Learned

- Serverless architecture patterns on AWS
- API Gateway CORS configuration for cross-origin requests
- DynamoDB single-table design with partition keys
- EventBridge cron expressions for scheduled Lambda triggers
- CloudFormation YAML for infrastructure as code
- CloudWatch dashboards for Lambda monitoring

## Tech Stack

**Frontend:** HTML, CSS, JavaScript  
**Backend:** Python (AWS Lambda)  
**Database:** Amazon DynamoDB  
**Infrastructure:** AWS CloudFormation  
**Language:** Python 3.12
