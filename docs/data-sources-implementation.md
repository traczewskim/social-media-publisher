# Data Sources - Implementation Guide

This document contains everything needed to implement the data ingestion layer. API contracts, response schemas, feed formats, library choices, and a unified data model.

---

## Library Choice: Feedsmith

**Package:** `feedsmith` (npm)
**Why:** Native TypeScript, actively maintained (2026), preserves original feed structure, supports RSS 2.0 + Atom 1.0, 30+ namespace support (Dublin Core, Media RSS, etc.), tree-shakable.

**Alternative:** `rss-parser` (battle-tested, 281K weekly downloads, but not maintained since 2023).

---

## Source 1: Hacker News (Algolia Search API)

### API Contract

**Base URL:** `https://hn.algolia.com/api/v1`

**Endpoints:**

| Endpoint | Sort | Use Case |
|----------|------|----------|
| `GET /search` | Relevance, then points | Best quality AI content |
| `GET /search_by_date` | Most recent first | Latest AI content |
| `GET /items/:id` | N/A | Single item details |

**Query Parameters:**

| Param | Type | Description | Example |
|-------|------|-------------|---------|
| `query` | string | Full-text search (supports OR) | `AI OR LLM OR "machine learning"` |
| `tags` | string | Filter by type (AND logic, parentheses for OR) | `story` |
| `numericFilters` | string | Numeric constraints (comma = AND) | `points>50,created_at_i>1707254400` |
| `page` | int | Zero-indexed page | `0` |
| `hitsPerPage` | int | Results per page (max 1000) | `50` |

**Tags values:** `story`, `comment`, `ask_hn`, `show_hn`, `poll`, `job`, `author_{username}`, `story_{id}`

**numericFilters fields:** `points`, `num_comments`, `created_at_i` (Unix seconds)
**Operators:** `<`, `<=`, `=`, `!=`, `>=`, `>`

### Our Query

```
GET https://hn.algolia.com/api/v1/search_by_date
  ?query=AI OR LLM OR GPT OR "machine learning" OR "artificial intelligence" OR "agentic" OR "Claude"
  &tags=story
  &numericFilters=points>30,created_at_i>{last_fetch_timestamp}
  &hitsPerPage=50
```

### Response Schema

```json
{
  "hits": [
    {
      "objectID": "35111646",
      "title": "Show HN: My AI-powered tool",
      "url": "https://example.com/my-tool",
      "author": "username",
      "points": 127,
      "num_comments": 45,
      "created_at": "2026-02-07T10:30:00.000Z",
      "created_at_i": 1675767000,
      "story_text": "Full text of self-post (null for link posts)",
      "_tags": ["story", "author_username", "story_35111646"],
      "_highlightResult": {
        "title": {
          "value": "Show HN: My <em>AI</em>-powered tool",
          "matchLevel": "full",
          "matchedWords": ["ai"]
        }
      }
    }
  ],
  "nbHits": 1234,
  "page": 0,
  "nbPages": 62,
  "hitsPerPage": 50,
  "processingTimeMS": 5
}
```

**Key fields per hit:**

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `objectID` | string | No | HN item ID |
| `title` | string | No | Story title |
| `url` | string | Yes | External URL (null for Ask HN) |
| `author` | string | No | HN username |
| `points` | int | No | Upvotes |
| `num_comments` | int | No | Comment count |
| `created_at` | string | No | ISO 8601 timestamp |
| `created_at_i` | int | No | Unix timestamp (seconds) |
| `story_text` | string | Yes | Self-post text |

### Rate Limits & Error Handling

- No documented rate limits for search (be conservative: ~100 req/min)
- HTTP 429 on rate limit exceeded (exponential backoff)
- HTTP 400 for bad query syntax
- Pagination cap: first 1000 results only

---

## Source 2: Reddit (RSS / Atom 1.0)

### Feed URLs

```
https://reddit.com/r/MachineLearning.rss
https://reddit.com/r/LocalLLaMA.rss
https://reddit.com/r/ClaudeAI.rss
```

### Feed Format: Atom 1.0

```xml
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>r/MachineLearning</title>
  <updated>2026-02-07T12:34:56+00:00</updated>

  <entry>
    <title>Post Title Here</title>
    <link href="https://www.reddit.com/r/MachineLearning/comments/..." />
    <id>t3_abc123</id>
    <updated>2026-02-07T10:00:00+00:00</updated>
    <author>
      <name>/u/username</name>
      <uri>https://www.reddit.com/user/username</uri>
    </author>
    <category term="MachineLearning" label="r/MachineLearning" />
    <content type="html">HTML-encoded post content</content>
  </entry>
</feed>
```

**Fields per entry:**

| Field | Path | Description |
|-------|------|-------------|
| Title | `entry > title` | Post title |
| URL | `entry > link[href]` | Reddit post URL |
| ID | `entry > id` | Reddit ID (t3_xxxxx) |
| Date | `entry > updated` | ISO 8601 |
| Author | `entry > author > name` | `/u/username` format |
| Subreddit | `entry > category[term]` | Subreddit name |
| Content | `entry > content` | HTML body |

**Limitations:**
- ~25 posts per feed
- No upvote counts or scores
- No comment data
- Subreddit-level filtering only (no keyword search)

---

## Source 3: ArXiv (RSS 2.0 + Dublin Core + ArXiv namespace)

### Feed URLs

```
http://rss.arxiv.org/rss/cs.AI
http://rss.arxiv.org/rss/cs.CL
http://rss.arxiv.org/rss/cs.LG
http://rss.arxiv.org/rss/cs.AI+cs.CL+cs.LG   (combined)
```

### Feed Format: RSS 2.0

```xml
<rss version="2.0"
     xmlns:dc="http://purl.org/dc/elements/1.1/"
     xmlns:arxiv="http://arxiv.org/schemas/atom">
  <channel>
    <title>cs.AI updates on arXiv.org</title>

    <item>
      <title>Paper Title Here</title>
      <link>https://arxiv.org/abs/2402.12345</link>
      <guid isPermaLink="true">oai:arXiv.org:2402.12345v1</guid>
      <pubDate>Fri, 07 Feb 2026 00:00:00 GMT</pubDate>
      <description>
        arXiv:2402.12345v1 Announce Type: new
        Abstract: This paper presents a novel approach to...
      </description>
      <dc:creator>Author One, Author Two, Author Three</dc:creator>
      <dc:rights>http://creativecommons.org/licenses/by/4.0/</dc:rights>
      <arxiv:announce_type>new</arxiv:announce_type>
      <arxiv:DOI>10.1234/journal.2026.12345</arxiv:DOI>
      <arxiv:comment>15 pages, 5 figures</arxiv:comment>
      <category>cs.AI</category>
      <category>cs.LG</category>
    </item>
  </channel>
</rss>
```

**Fields per item:**

| Field | Path | Description |
|-------|------|-------------|
| Title | `item > title` | Paper title |
| Abstract page | `item > link` | `https://arxiv.org/abs/YYMM.NNNNN` |
| PDF URL | Derived | `https://arxiv.org/pdf/YYMM.NNNNN.pdf` |
| ID | `item > guid` | `oai:arXiv.org:YYMM.NNNNNvX` |
| Date | `item > pubDate` | RFC 822 |
| Abstract | `item > description` | After "Abstract:" marker |
| Authors | `item > dc:creator` | Comma-separated string |
| Type | `item > arxiv:announce_type` | `new`, `replacement`, `replace-cross` |
| DOI | `item > arxiv:DOI` | Optional |
| Categories | `item > category` | Multiple elements |

**Notes:**
- Updated daily at midnight EST (no weekends)
- PDF link = replace `/abs/` with `/pdf/` and append `.pdf`
- Abstract is embedded in `<description>` after "Abstract:" - needs parsing
- Filter for `announce_type=new` to skip replacements

---

## Source 4: Substack Newsletters (RSS 2.0 + content:encoded)

### Feed URLs

```
https://importai.substack.com/feed           (Import AI)
https://thesequence.substack.com/feed        (TheSequence - verify)
```

### Feed Format: RSS 2.0

```xml
<rss version="2.0"
     xmlns:dc="http://purl.org/dc/elements/1.1/"
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Import AI</title>
    <generator>Substack</generator>

    <item>
      <title>Import AI #345: New Models and More</title>
      <link>https://importai.substack.com/p/import-ai-345</link>
      <guid isPermaLink="true">https://importai.substack.com/p/import-ai-345</guid>
      <pubDate>Mon, 03 Feb 2026 08:00:00 GMT</pubDate>
      <description><![CDATA[<p>Excerpt/summary...</p>]]></description>
      <content:encoded><![CDATA[<p>Full HTML article...</p>]]></content:encoded>
      <dc:creator>Jack Clark</dc:creator>
      <author>author@importai.substack.com (Jack Clark)</author>
      <media:thumbnail url="https://substackcdn.com/image/..." />
    </item>
  </channel>
</rss>
```

**Fields per item:**

| Field | Path | Description |
|-------|------|-------------|
| Title | `item > title` | Post title |
| URL | `item > link` | Substack post URL |
| Date | `item > pubDate` | RFC 822 |
| Summary | `item > description` | HTML excerpt |
| Full content | `item > content:encoded` | Full HTML article |
| Author | `item > dc:creator` | Author name |
| Thumbnail | `item > media:thumbnail[url]` | Image URL |

**Notes:**
- `description` = excerpt, `content:encoded` = full article
- Paid-only posts may be truncated
- Images embedded as standard `<img>` in content

---

## Source 5: Kill-the-Newsletter (Atom 1.0)

### How to Set Up

1. Go to `https://kill-the-newsletter.com`
2. Enter a name (e.g., "The Batch")
3. Get unique email: `{random_id}@kill-the-newsletter.com`
4. Get feed URL: `https://kill-the-newsletter.com/feeds/{random_id}.xml`
5. Subscribe to newsletter using the generated email
6. Emails appear as Atom entries in the feed

**Use for:** The Batch, TLDR AI, The Rundown AI (email-only newsletters)

### Feed Format: Atom 1.0

```xml
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>The Batch</title>
  <id>https://kill-the-newsletter.com/feeds/{id}</id>
  <updated>2026-02-07T12:34:56Z</updated>

  <entry>
    <title>Email Subject Line</title>
    <id>{unique_entry_id}</id>
    <updated>2026-02-07T10:00:00Z</updated>
    <author>
      <name>Sender Name</name>
      <email>sender@example.com</email>
    </author>
    <content type="html"><![CDATA[HTML body of email]]></content>
  </entry>
</feed>
```

**Self-hosting option:** `https://github.com/leafac/kill-the-newsletter` (recommended for reliability)

---

## Source 6: AI Blog RSS (RSS 2.0)

### Feed URLs

```
https://openai.com/news/rss.xml              (OpenAI Blog)
```

### Feed Format: Standard RSS 2.0

```xml
<rss version="2.0">
  <channel>
    <title>OpenAI Blog</title>

    <item>
      <title>Post Title</title>
      <link>https://openai.com/news/post-slug</link>
      <guid isPermaLink="true">https://openai.com/news/post-slug</guid>
      <pubDate>Mon, 03 Feb 2026 12:00:00 GMT</pubDate>
      <description><![CDATA[Post content as HTML]]></description>
      <dc:creator>OpenAI</dc:creator>
    </item>
  </channel>
</rss>
```

**Note:** Posts may not be in chronological order - sort by `pubDate` after parsing.

---

## Unified Data Model

All sources normalize to a single `Article` type for downstream processing.

```typescript
interface Article {
  // Identity
  id: string;              // Unique ID (source-specific format)
  source: Source;          // Enum: 'hackernews' | 'reddit' | 'arxiv' | 'newsletter' | 'blog'
  sourceId: string;        // Original ID from source

  // Content
  title: string;
  url: string;             // Link to original content
  summary: string;         // Short description / abstract
  content: string | null;  // Full text/HTML (if available)

  // Metadata
  author: string;
  publishedAt: Date;
  fetchedAt: Date;

  // Source-specific
  metadata: ArticleMetadata;
}

interface ArticleMetadata {
  // Hacker News
  points?: number;
  numComments?: number;

  // Reddit
  subreddit?: string;

  // ArXiv
  categories?: string[];   // e.g., ['cs.AI', 'cs.CL']
  pdfUrl?: string;
  announceType?: string;   // 'new' | 'replacement' | 'replace-cross'
  doi?: string;

  // Newsletter
  newsletterName?: string;
}

type Source = 'hackernews' | 'reddit' | 'arxiv' | 'newsletter' | 'blog';
```

### Source-to-Article Mapping

| Source Field | HN (Algolia) | Reddit (Atom) | ArXiv (RSS) | Newsletter (RSS/Atom) |
|-------------|--------------|---------------|-------------|----------------------|
| `id` | `hn_{objectID}` | `reddit_{id}` | `arxiv_{guid}` | `nl_{guid}` |
| `title` | `hit.title` | `entry.title` | `item.title` | `item.title` |
| `url` | `hit.url` | `entry.link.href` | `item.link` | `item.link` |
| `summary` | `hit.title` (no summary) | `entry.content` (HTML) | `item.description` (parse after "Abstract:") | `item.description` |
| `content` | `hit.story_text` | `entry.content` | `item.description` | `item.content:encoded` |
| `author` | `hit.author` | `entry.author.name` | `item.dc:creator` | `item.dc:creator` |
| `publishedAt` | `hit.created_at` | `entry.updated` | `item.pubDate` | `item.pubDate` |
| `points` | `hit.points` | N/A | N/A | N/A |
| `numComments` | `hit.num_comments` | N/A | N/A | N/A |
| `subreddit` | N/A | `entry.category.term` | N/A | N/A |
| `categories` | N/A | N/A | `item.category[]` | N/A |
| `pdfUrl` | N/A | N/A | Derived from link | N/A |

---

## Deduplication Strategy

Articles may appear in multiple sources (e.g., ArXiv paper shared on HN and Reddit). Deduplicate by:

1. **URL normalization** - Strip query params, trailing slashes, normalize domains
2. **Title similarity** - Fuzzy match titles (Levenshtein distance or similar)
3. **Keep richest version** - Prefer the source with most metadata (HN > Reddit for engagement data, ArXiv for paper details)

---

## Fetch Schedule

| Source | Frequency | Method | Rationale |
|--------|-----------|--------|-----------|
| Hacker News | Every 6 hours | Algolia API (date-filtered) | High volume, use `created_at_i` to fetch only new |
| Reddit | Every 6 hours | RSS fetch | ~25 posts per feed, low volume |
| ArXiv | Daily at 9AM ET | RSS fetch | Feed updates overnight (8PM ET) |
| Newsletters | Every 2 hours | RSS/Atom fetch | Depends on publication schedule |
| AI Blogs | Every 6 hours | RSS fetch | Low volume |

**State tracking:** Store `lastFetchTimestamp` per source. For Algolia, use `created_at_i` filter. For RSS, compare `guid`/`id` against previously seen items.

---

## Feed Configuration

All RSS/Atom feeds to consume:

```typescript
const FEED_CONFIG = {
  reddit: [
    { url: 'https://reddit.com/r/MachineLearning.rss', name: 'r/MachineLearning' },
    { url: 'https://reddit.com/r/LocalLLaMA.rss', name: 'r/LocalLLaMA' },
    { url: 'https://reddit.com/r/ClaudeAI.rss', name: 'r/ClaudeAI' },
  ],
  arxiv: [
    { url: 'http://rss.arxiv.org/rss/cs.AI+cs.CL+cs.LG', name: 'ArXiv AI/CL/LG' },
  ],
  newsletters: [
    { url: 'https://importai.substack.com/feed', name: 'Import AI' },
    // Add Kill-the-Newsletter feeds after setup:
    // { url: 'https://kill-the-newsletter.com/feeds/{id}.xml', name: 'The Batch' },
    // { url: 'https://kill-the-newsletter.com/feeds/{id}.xml', name: 'TLDR AI' },
    // { url: 'https://kill-the-newsletter.com/feeds/{id}.xml', name: 'The Rundown AI' },
  ],
  blogs: [
    { url: 'https://openai.com/news/rss.xml', name: 'OpenAI Blog' },
  ],
};
```

---

## Implementation Checklist

- [ ] Install `feedsmith` (RSS/Atom parsing)
- [ ] Implement Algolia HN fetcher (HTTP client + JSON parsing)
- [ ] Implement generic RSS/Atom fetcher using feedsmith
- [ ] Implement per-source normalizers (RSS entry -> Article)
- [ ] Implement deduplication (URL + title matching)
- [ ] Implement state tracking (last fetch timestamp, seen IDs)
- [ ] Set up Kill-the-Newsletter feeds for email-only newsletters
- [ ] Implement fetch scheduler (cron or interval-based)
- [ ] Add error handling and retry logic per source
