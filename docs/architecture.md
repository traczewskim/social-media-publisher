# Architecture & Tech Stack - Decisions

This document captures all architecture and technology decisions for the Social Media Publisher MVP.

---

## Progress

| Phase | Status | Description |
|-------|--------|-------------|
| Data source research | Done | All 5 source types researched, access methods decided |
| Architecture decisions | Done | Runtime, storage, deployment, libraries all decided |
| Database schema | Not started | Table definitions, migrations |
| Project scaffolding | Not started | Package.json, tsconfig, directory structure |
| Ingestion layer | Not started | Fetchers, normalizers, dedup |
| Generation layer | Not started | Claude API client, prompt templates |
| CLI layer | Not started | Commands, argument parsing |
| Scheduler | Not started | Automated fetch scheduling |

---

## Decision Log

### D1: Runtime - TypeScript / Node.js

**Decision:** Use TypeScript on Node.js.

**Rationale:**
- `feedsmith` (RSS library) is TypeScript-native
- `@anthropic-ai/sdk` (Claude) has first-class TypeScript support
- `better-sqlite3` has good TS typings
- Consistent stack across all layers (ingestion, generation, CLI)
- No reason to split languages - all dependencies are JS/TS ecosystem

**Alternatives considered:**
- Python - would work (has `feedparser`, `anthropic` SDK, good ML ecosystem) but would mean mixing ecosystems for no benefit. The `arxiv` Python package is nice but we're using RSS for ArXiv anyway.

---

### D2: Deployment Model - Local CLI App

**Decision:** Build as a local CLI application. Run on developer machine or a cheap VPS ($5/month).

**Rationale:**
- This is a personal tool, not multi-tenant SaaS
- Volume is tiny: 5 sources, ~200 articles/day max
- Simplest to build, debug, and iterate
- Zero cloud infrastructure cost
- No IAM, no deployment pipelines, no CloudFormation

**Alternatives considered:**
- **AWS Serverless (Lambda + DynamoDB + EventBridge)** - Rejected. Adds massive infrastructure complexity (IAM roles, DynamoDB table design, deployment pipelines, CloudFormation stacks) for zero benefit at this volume. Would make sense if this were multi-tenant SaaS. It's not.
- **Docker container (long-running)** - Viable but adds a Docker layer without clear benefit for MVP. Could adopt later for easier deployment to a VPS.

**Migration path:** If needed later, the code layers (ingestion, generation, storage) are decoupled from the CLI layer. Could extract to Lambda handlers without rewriting business logic.

---

### D3: Storage - SQLite

**Decision:** Use SQLite via `better-sqlite3`.

**Rationale:**
- Zero setup - single file database
- Full SQL support for querying articles by date, source, status
- Transactional, reliable, battle-tested
- `better-sqlite3` is synchronous (simpler code), fast, and well-typed
- Perfect for single-user, local application
- Data needs are relational: articles, posts, fetch state, relationships between them

**Alternatives considered:**
- **JSON files** - Too primitive. No querying, gets messy with hundreds of articles, no transactional safety.
- **PostgreSQL** - Overkill. Requires running a server, connection management, migrations tooling. Adds ops burden for a local tool.
- **DynamoDB** - Only makes sense with AWS Lambda deployment (rejected in D2).

**Tables (preliminary):**
- `articles` - Fetched content from all sources (unified schema)
- `posts` - Generated social media posts (linked to source articles)
- `fetch_log` - Last fetch timestamp and state per source
- `seen_ids` - Deduplication tracking (source + original ID)

---

### D4: CLI Framework - TBD

**Decision:** Pending. Two candidates:

| Option | Pros | Cons |
|--------|------|------|
| **commander** | Most popular (100M+ weekly downloads), battle-tested, rich ecosystem | Older API style |
| **citty** | Modern, from UnJS ecosystem, elegant API | Smaller community, newer |

**Commands planned:**

```
smp fetch                        # Fetch new articles from all sources
smp fetch --source hackernews    # Fetch from specific source
smp generate                     # Generate posts from unfeatured articles
smp generate --hint "..."        # Hint-driven research mode
smp list                         # List fetched articles
smp list --posts                 # List generated posts
smp post <id>                    # Copy/output a generated post
```

---

### D5: Scheduler - TBD

**Decision:** Pending. Two candidates:

| Option | Pros | Cons |
|--------|------|------|
| **OS cron** | Zero dependencies, standard Unix, simple | External to app, requires crontab setup |
| **node-cron** | Built into app (`smp start`), portable | Long-running process, needs to stay alive |

**Fetch schedule (defined in data-sources-implementation.md):**
- Hacker News: every 6 hours
- Reddit: every 6 hours
- ArXiv: daily at 9AM ET
- Newsletters: every 2 hours
- AI Blogs: every 6 hours

---

### D6: Content Generation - Claude API

**Decision:** Use Claude API via `@anthropic-ai/sdk`.

**Rationale:**
- High quality text generation for social media content
- Supports structured prompts with system/user messages
- Can enforce platform-specific constraints (character limits, tone)
- Pay-per-use pricing (no monthly commitment)

**Usage pattern:**
- Prompt templates per platform (LinkedIn, X, Facebook)
- Article summary + metadata fed as context
- System prompt defines tone, format, constraints
- For hint-driven mode: web search results fed as additional context

---

### D7: RSS Parsing - feedsmith

**Decision:** Use `feedsmith` for all RSS/Atom feed parsing.

**Rationale:**
- Native TypeScript (built from ground up)
- Actively maintained in 2026
- Preserves original feed structure (doesn't merge/normalize away fields)
- Supports all formats we need: RSS 2.0 (ArXiv, Substack, OpenAI), Atom 1.0 (Reddit, Kill-the-Newsletter)
- 30+ namespace support including Dublin Core (needed for ArXiv `dc:creator`)
- Tree-shakable
- 2000+ tests, 99% coverage

**Alternatives considered:**
- **rss-parser** - Most popular (281K weekly downloads) but not maintained since 2023. Normalizes away format-specific fields we need.
- **node-feedparser** - Abandoned (last publish 6 years ago).

---

## Dependencies Summary

| Package | Purpose | Version |
|---------|---------|---------|
| `typescript` | Language | Latest |
| `feedsmith` | RSS/Atom parsing | Latest |
| `@anthropic-ai/sdk` | Claude API | Latest |
| `better-sqlite3` | SQLite driver | Latest |
| `@types/better-sqlite3` | Type definitions | Latest |
| `commander` or `citty` | CLI framework | TBD |
| `node-cron` | Scheduler (if chosen) | TBD |

---

## Project Structure (Preliminary)

```
social-media-publisher/
├── src/
│   ├── cli/                    # CLI commands
│   │   ├── fetch.ts
│   │   ├── generate.ts
│   │   ├── list.ts
│   │   └── post.ts
│   ├── ingestion/              # Data fetching layer
│   │   ├── fetchers/
│   │   │   ├── algolia-hn.ts   # Hacker News via Algolia
│   │   │   └── rss.ts          # Generic RSS/Atom fetcher
│   │   ├── normalizers/
│   │   │   ├── hackernews.ts   # HN hit -> Article
│   │   │   ├── reddit.ts       # Reddit Atom entry -> Article
│   │   │   ├── arxiv.ts        # ArXiv RSS item -> Article
│   │   │   ├── newsletter.ts   # Substack/KtN item -> Article
│   │   │   └── blog.ts         # Blog RSS item -> Article
│   │   ├── dedup.ts            # URL normalization + title matching
│   │   └── scheduler.ts        # Fetch scheduling logic
│   ├── generation/             # Content generation layer
│   │   ├── claude.ts           # Claude API client wrapper
│   │   ├── prompts/
│   │   │   ├── linkedin.ts     # LinkedIn prompt template
│   │   │   ├── twitter.ts      # X/Twitter prompt template
│   │   │   └── hint.ts         # Hint-driven research prompt
│   │   └── formatter.ts        # Platform-specific formatting
│   ├── storage/                # Database layer
│   │   ├── db.ts               # SQLite connection + migrations
│   │   ├── articles.ts         # Article CRUD operations
│   │   ├── posts.ts            # Generated post CRUD
│   │   └── fetch-log.ts        # Fetch state tracking
│   ├── config.ts               # Feed URLs, source config
│   ├── types.ts                # Shared TypeScript types
│   └── index.ts                # CLI entry point
├── docs/
│   ├── data-sources.md         # Source research & decisions
│   ├── data-sources-implementation.md  # API contracts & schemas
│   └── architecture.md         # This file
├── data/
│   └── smp.db                  # SQLite database file (gitignored)
├── package.json
├── tsconfig.json
└── README.md
```

---

## Open Questions

1. **CLI framework:** commander vs citty - needs decision before implementation
2. **Scheduler:** OS cron vs node-cron - needs decision before implementation
3. **Database migrations:** Use a migration library (e.g., `umzug`) or hand-rolled SQL scripts?
4. **HTML-to-text:** Needed for extracting readable text from RSS HTML content. Library choice? (`turndown` for HTML->Markdown, `html-to-text` for plain text)
5. **Web search for hint mode:** Which API? (Brave Search API is free tier, or use Claude's built-in tool use with web search)
