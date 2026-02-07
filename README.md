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
    |
    +-- Ingestion Layer
    |   +-- HN Algolia Fetcher
    |   +-- RSS Fetcher (feedsmith)
    |   +-- Source Normalizers
    |
    +-- Generation Layer
    |   +-- Claude API Client
    |   +-- Prompt Templates
    |   +-- Platform Formatters
    |
    +-- Storage Layer (SQLite)
        +-- articles | posts | fetch_log
```

## Progress

| Phase | Status | Details |
|-------|--------|---------|
| Data source research | Done | 5 source types, access methods, API contracts, feed schemas |
| Architecture decisions | Done | 7 decisions documented (runtime, storage, deployment, libraries) |
| Database schema | Pending | Table definitions, migrations |
| Project scaffolding | Pending | package.json, tsconfig, directory structure |
| Ingestion layer | Pending | Fetchers, normalizers, dedup |
| Generation layer | Pending | Claude API client, prompt templates |
| CLI layer | Pending | Commands, argument parsing |
| Scheduler | Pending | Automated fetch scheduling |

## Key Decisions

- **RSS-first ingestion** - All sources except HN use RSS/Atom feeds. Free, no auth, simple.
- **Algolia for HN** - Full-text search + quality filtering (points>30) for free.
- **Twitter/X deferred** - $200/month minimum for read access. Other sources provide enough content for MVP.
- **Local CLI, not serverless** - Personal tool, not SaaS. SQLite, not DynamoDB. Zero cloud costs.
- **Entire MVP pipeline is free** - No paid APIs needed for data ingestion.

## Documentation

| Document | Contents |
|----------|----------|
| [Data Sources - Research & Decisions](./docs/data-sources.md) | Options analysis per source, access methods, cost comparison |
| [Data Sources - Implementation Guide](./docs/data-sources-implementation.md) | API contracts, response schemas, feed XML formats, unified data model, feed config |
| [Architecture & Tech Stack](./docs/architecture.md) | All tech decisions with rationale, dependencies, project structure, open questions |

## Status

Pre-implementation - data sources researched, architecture defined, ready to code.
