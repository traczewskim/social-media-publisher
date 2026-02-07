# Social Media Publisher for AI Content

An AI-powered content generation system for building a personal brand around AI and agentic coding. Scans AI news sources, generates platform-specific social media posts using Claude API.

## Two Modes

### 1. News Scanner (Automated)
Continuously scans AI news and generates social media content.
- Hacker News (Algolia Search API)
- Reddit (r/MachineLearning, r/LocalLLaMA, r/ClaudeAI)
- ArXiv (cs.AI, cs.CL, cs.LG)
- AI newsletters (Import AI, The Batch, TLDR AI, The Rundown AI)
- AI blogs (OpenAI)

### 2. Hint-Driven Research
Provide a thesis, system researches evidence and generates posts.

**Example:** "Stack Overflow traffic drops because of AI. No questions = no training data = future model problem." -> Research + posts with sources.

## Output Platforms
- **LinkedIn** - Professional thought leadership
- **X (Twitter)** - Punchy threads
- **Facebook** - Conversational engagement
- **Instagram** - Captions + hashtags (future)

## Tech Stack

| Component | Choice |
|-----------|--------|
| Runtime | TypeScript / Node.js |
| RSS parsing | feedsmith |
| Content generation | Claude API (@anthropic-ai/sdk) |
| Storage | SQLite (better-sqlite3) |
| CLI framework | TBD (commander or citty) |
| Deployment | Local CLI app |

## Architecture

```
CLI Layer (smp fetch | generate | list | post)
    │
    ├── Ingestion Layer
    │   ├── HN Algolia Fetcher
    │   ├── RSS Fetcher (feedsmith)
    │   └── Source Normalizers
    │
    ├── Generation Layer
    │   ├── Claude API Client
    │   ├── Prompt Templates
    │   └── Platform Formatters
    │
    └── Storage Layer (SQLite)
        └── articles | posts | fetch_log
```

## Documentation

- [Data Sources - Research & Decisions](./docs/data-sources.md)
- [Data Sources - Implementation Guide](./docs/data-sources-implementation.md)
- [Architecture & Tech Stack](./docs/architecture.md)

## Status

Pre-implementation - data sources researched, architecture defined, ready to code.
