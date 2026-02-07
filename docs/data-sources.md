# Data Sources - Research & Decisions

This document captures research and decisions on how to ingest content from each data source for the Social Media Publisher.

---

## Source 1: Hacker News

### Available Options

| Method | Auth | Rate Limits | Cost | Filtering |
|--------|------|-------------|------|-----------|
| **Official Firebase API** | None | No enforced limits | Free | No search/filter - must fetch by ID |
| **Algolia Search API** | None | Undocumented (generous) | Free | Full-text search, tags, points, date ranges |
| **RSS (hnrss.org)** | None | Generous | Free | Keyword and points filtering |
| **Web scraping** | N/A | N/A | Free | N/A |

### Details

**Official Firebase API** (`https://hacker-news.firebaseio.com/v0/`)
- Endpoints: `/topstories`, `/newstories`, `/beststories`, `/item/{id}`, `/user/{username}`
- Returns up to 500 story IDs per endpoint
- No search or keyword filtering - must fetch items individually
- Good for "top stories" but bad for topic filtering

**Algolia Search API** (`https://hn.algolia.com/api/v1/`)
- Full-text search: `search?query=AI OR LLM OR "machine learning"`
- Filter by type: `tags=story` (exclude comments)
- Filter by quality: `numericFilters=points>50`
- Filter by date: `numericFilters=created_at_i>timestamp`
- Sort by relevance or date
- Up to 100 results per page

**RSS via hnrss.org**
- Custom feeds with keyword filters
- Good for real-time monitoring
- Example: `https://hnrss.org/newest?q=AI+OR+LLM&points=50`

**Web scraping** - NOT recommended. APIs are free and comprehensive.

### Decision

> **Use Algolia Search API as primary, RSS (hnrss.org) as supplement for real-time monitoring.**
>
> Algolia gives us full search + quality filtering for free with no auth. RSS can be a lightweight real-time feed.

---

## Source 2: Reddit

### Available Options

| Method | Auth | Rate Limits | Cost | Filtering |
|--------|------|-------------|------|-----------|
| **Official API (Free tier)** | OAuth | 100 req/min, 10K/month | Free | Full subreddit/post access |
| **Official API (Basic tier)** | OAuth | Higher limits | $200/month | Same + more capacity |
| **RSS feeds** | None | Generous (undocumented) | Free | Subreddit-level only |
| **Web scraping** | N/A | N/A | N/A | Explicitly banned, active lawsuits |

### Details

**Official Reddit API (Free tier)**
- OAuth required
- 100 req/min, 10K requests/month
- Sufficient for scanning 3 subreddits: ~150 posts/day = well under limits
- Access to scores, comments, full metadata
- Python wrapper: PRAW (well-maintained)

**RSS feeds**
- Append `.rss` to any subreddit URL: `https://reddit.com/r/MachineLearning.rss`
- No auth, no rate limit concerns
- ~25 recent posts per feed
- Missing: upvote counts, comment data, score filtering

**Web scraping** - DO NOT USE. Reddit actively sues scrapers (SerpApi, Oxylabs, Perplexity AI). Explicitly banned in ToS.

### Decision

> **Use RSS feeds for MVP (simplest), upgrade to Official API (Free tier) with PRAW if we need score filtering or comment data.**
>
> RSS is zero-setup for basic monitoring. The free API tier (10K req/month) is more than enough if we need richer data later.

### RSS URLs

```
https://reddit.com/r/MachineLearning.rss
https://reddit.com/r/LocalLLaMA.rss
https://reddit.com/r/ClaudeAI.rss
```

---

## Source 3: ArXiv

### Available Options

| Method | Auth | Rate Limits | Cost | Filtering |
|--------|------|-------------|------|-----------|
| **Official API** | None | 1 req per 3 seconds | Free | Category + keyword search |
| **RSS/Atom feeds** | None | Minimal | Free | Category-level |
| **Bulk data (S3/OAI-PMH)** | None | N/A | S3: pay for transfer | Full archive |
| **Python `arxiv` package** | None | Built-in rate limiting | Free | Wraps official API |

### Details

**Official API** (`https://export.arxiv.org/api/query?`)
- Search by category: `cat:cs.AI OR cat:cs.CL`
- Combine with keywords: `cat:cs.AI AND (ti:"agentic" OR abs:"LLM")`
- Max 2,000 results per page, 30,000 total per query
- Strict: 1 request per 3 seconds

**RSS feeds**
- Per-category feeds: `http://rss.arxiv.org/rss/cs.AI`
- Combined: `http://rss.arxiv.org/rss/cs.AI+cs.CL`
- Updated Mon-Thu + Sun at 8PM ET
- Only shows new papers (not historical)

**Python `arxiv` package** (v2.4.0, Jan 2026)
- `pip install arxiv`
- Handles pagination and rate limiting automatically
- Generator-based results for efficiency

**Bulk access** - Overkill for our use case. Good for large-scale research only.

### Decision

> **Use RSS feeds for daily new paper monitoring. Use `arxiv` Python package for keyword-filtered searches.**
>
> RSS gives us zero-effort daily updates per category. The Python package lets us run targeted queries when needed.

### RSS URLs

```
http://rss.arxiv.org/rss/cs.AI
http://rss.arxiv.org/rss/cs.CL
http://rss.arxiv.org/rss/cs.LG
http://rss.arxiv.org/rss/cs.AI+cs.CL+cs.LG
```

### Relevant Categories

- `cs.AI` - Artificial Intelligence
- `cs.CL` - Computation and Language (NLP/LLMs)
- `cs.LG` - Machine Learning
- `cs.SE` - Software Engineering (for agentic coding papers)

---

## Source 4: Twitter/X

### Available Options

| Method | Auth | Rate Limits | Cost | Notes |
|--------|------|-------------|------|-------|
| **Official API (Free)** | OAuth | 1 req/24h read | Free | Write-only (useless for reading) |
| **Official API (Basic)** | OAuth | 10K tweets/month, 7-day search | $200/month | Minimum viable for reading |
| **Official API (Pro)** | OAuth | 100x Basic | $5,000/month | Overkill |
| **Third-party APIs** (TwitterAPI.io, SociaVault) | API key | Varies | ~$15-30/month | Legal gray area |
| **Nitter/RSS bridges** | None | Varies | Free | Unreliable in 2026 |
| **Web scraping** | N/A | N/A | N/A | ToS violation, risky |

### Details

**Official API** - The free tier is write-only (500 posts/month, no meaningful read). Basic tier ($200/month) gives 10K tweets/month with 7-day search history. Too expensive for a side project.

**Third-party APIs** (e.g., TwitterAPI.io at ~$0.15/1K tweets) - Affordable but live in a legal gray area. Could break anytime.

**Nitter/RSS bridges** - Nitter requires real X accounts and session tokens since 2026. Public instances are fragile. Not reliable.

**Pay-per-use pilot** - X is piloting credit-based pricing. Could become viable but too early to depend on.

### Decision

> **Defer Twitter/X from MVP. It's the most expensive and least reliable source.**
>
> Options for later:
> 1. Official Basic API ($200/month) - if budget allows
> 2. Third-party API (~$15-30/month) - if we accept the gray area
> 3. Monitor X's pay-per-use pilot pricing
>
> For MVP, the other 4 sources (HN, Reddit, ArXiv, newsletters) provide plenty of content.

---

## Source 5: AI Newsletters

### Available Options

| Method | Auth | Rate Limits | Cost | Notes |
|--------|------|-------------|------|-------|
| **RSS feeds (native)** | None | N/A | Free | Substack newsletters have RSS built-in |
| **Kill the Newsletter** (email-to-RSS) | None | N/A | Free | Converts any email newsletter to RSS |
| **Email parsing** (Parsio, Mailparser) | API key | Varies | Paid | AI-powered extraction from emails |
| **Web archive scraping** | N/A | N/A | Free | For historical content |

### Details

**Substack RSS** - All Substack newsletters have RSS at `https://[name].substack.com/feed`. Import AI, TheSequence, and many others are on Substack.

**Kill the Newsletter** (kill-the-newsletter.com) - Generates a unique email + Atom feed URL. Subscribe to any newsletter with that email, get an RSS feed. Free, open-source, self-hostable.

**Email parsing** - Services like Parsio use AI to extract structured data from newsletters. Useful but adds complexity and cost. Note: Zapier Email Parser cannot handle newsletters with multiple articles.

**Web archives** - The Batch at `deeplearning.ai/the-batch/`, Import AI at `importai.substack.com/archive`.

### Top AI Newsletters (Ranked by Relevance)

| Newsletter | Platform | RSS Available | Frequency |
|------------|----------|---------------|-----------|
| **The Batch** (Andrew Ng) | DeepLearning.AI | Via Kill-the-Newsletter or aggregator | Weekly |
| **Import AI** (Jack Clark) | Substack | `importai.substack.com/feed` | Weekly |
| **TLDR AI** | Email | Via Kill-the-Newsletter | Daily |
| **The Rundown AI** | Email | Via Kill-the-Newsletter | Daily |
| **TheSequence** | Substack | Likely available | Regular |
| **LangChain Newsletter** | blog.langchain.com | Likely available | Monthly |

### Other AI Sources with RSS

| Source | RSS Feed |
|--------|----------|
| **OpenAI Blog** | `openai.com/news/rss.xml` |
| **Google Research Blog** | Available via aggregators |
| **Hugging Face Blog** | Community RSS feeds |

### Decision

> **Use Substack RSS where available. Use Kill-the-Newsletter for email-only newsletters. Use direct RSS for blogs (OpenAI, etc.).**
>
> This gives us free, auth-free access to all major AI newsletters. No email parsing complexity needed for MVP.

---

## Summary: MVP Data Ingestion Strategy

| Source | Method | Auth | Cost | Priority |
|--------|--------|------|------|----------|
| **Hacker News** | Algolia Search API | None | Free | P1 |
| **Reddit** | RSS feeds (`.rss` URLs) | None | Free | P1 |
| **ArXiv** | RSS feeds per category | None | Free | P1 |
| **AI Newsletters** | Substack RSS + Kill-the-Newsletter | None | Free | P1 |
| **AI Blogs** | Direct RSS (OpenAI, etc.) | None | Free | P2 |
| **Twitter/X** | Deferred | - | $200/mo+ | P3 (post-MVP) |

### Key Decisions

1. **RSS-first approach** - Most sources offer free RSS. Standardizing on RSS simplifies the ingestion pipeline.
2. **Algolia for HN** - Only exception to RSS-first, because Algolia gives us search + quality filtering that RSS can't.
3. **Twitter/X deferred** - Too expensive and unreliable for MVP. Other sources provide sufficient content.
4. **No scraping** - All sources have legal API/RSS access. No need for scraping.
5. **No paid APIs for MVP** - Everything in the MVP pipeline is free.
6. **Kill-the-Newsletter** for email-only newsletters - Bridges the gap for newsletters without native RSS.
