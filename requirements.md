# Requirements

## Architecture

- **Frontend**: React app hosted on S3 (static site)
- **Storage**: DynamoDB
- **Backend**: TBD (Lambda? API Gateway?)

## Pages

### Hints

- List of all hints provided by the user
- Option to add new hints
- Each hint is expandable to show:
  - Hint details (topic/thesis, date added, status)
  - List of generated content per platform (LinkedIn, Twitter/X, Facebook, Discord, etc.)

## Core Flow

1. User adds a hint (topic/thesis) via the UI
2. System researches the topic using Claude
3. Content is generated per platform
4. Generated content is displayed under the hint for review/publishing
