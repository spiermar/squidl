# Web Search & Fetch Tools Design

## Overview

Add `web_search` and `web_fetch` tools to the agent-service, enabling the AI agent to search the web via Brave Search API and fetch/extract content from URLs.

## Requirements

- **web_search**: Query Brave Search API, return structured results (title, URL, snippet)
- **web_fetch**: Fetch URLs and extract readable content (HTML→markdown, PDF→text)
- No LLM processing for fetch — raw extraction only
- Gemini API key not required
- Brave Search API key via `BRAVE_SEARCH_API_KEY` environment variable

## Architecture

```
agent-service/
├── src/
│   ├── agent.ts           # Updated to include web tools
│   ├── web-tools.ts       # Tool definitions for web_search + web_fetch
│   ├── brave-search.ts    # Brave Search API client
│   └── content-fetcher.ts # URL fetching + content extraction
```

## Data Flow

### web_search
```
user query → web_search tool → Brave Search API → structured results
```

### web_fetch
```
URL → web_fetch tool → detect content type →
  HTML: fetch → Readability → Turndown → markdown
  PDF: fetch → pdf-parse → text
```

## Components

### brave-search.ts

`BraveSearchClient` class:
- `search(query, options)` method
- Options: `count` (results per page, default 10), `offset` (pagination), `search_lang`
- Returns `{ results: [{ title, url, description }] }`
- Reads `BRAVE_SEARCH_API_KEY` from environment
- 30 second timeout

API endpoint: `https://api.search.brave.com/res/v1/web/search`

### content-fetcher.ts

Functions:
- `fetchContent(url)` → detects content-type, routes to appropriate extractor
- `extractHtml(url)`: fetch → Readability → Turndown → markdown
- `extractPdf(url)`: fetch → pdf-parse → text
- 30 second timeout per request

Supported content types:
- `text/html` → markdown extraction
- `application/pdf` → text extraction
- Other types → error with supported types list

### web-tools.ts

`createWebTools()` function returns array of tool definitions:

**web_search**
- Input: `{ query: string, count?: number }`
- Output: `{ results: [{ title: string, url: string, description: string }] }`

**web_fetch**
- Input: `{ url: string }`
- Output: `{ content: string, contentType: string }`

Integration in `agent.ts`:
```typescript
const { session } = await createAgentSession({
  // ...
  tools: [...createCodingTools(process.cwd()), ...createWebTools()],
});
```

## Dependencies

Add to `package.json`:
- `@mozilla/readability` — HTML content extraction
- `turndown` — HTML to markdown conversion
- `pdf-parse` — PDF text extraction
- `linkedom` — DOM implementation for Readability (server-side)

## Error Handling

All errors returned in tool response objects, not thrown:

**web_search errors:**
- Missing `BRAVE_SEARCH_API_KEY` → "BRAVE_SEARCH_API_KEY environment variable not set"
- Rate limit (429) → "Brave Search API rate limit exceeded"
- Timeout → "Search request timed out"
- API error → "Brave Search API error: {status} {message}"

**web_fetch errors:**
- Invalid URL → "Invalid URL format: {url}"
- HTTP error → "Failed to fetch {url}: HTTP {status}"
- Timeout → "Request to {url} timed out"
- Unsupported content-type → "Unsupported content type: {type}. Supported: text/html, application/pdf"
- Extraction failed → "Failed to extract content from {url}: {reason}"

## Testing

### Unit Tests

`tests/unit/brave-search.test.ts`:
- Mock fetch responses
- Test query parameter building
- Test response parsing
- Test error handling (missing key, rate limit, timeout)

`tests/unit/content-fetcher.test.ts`:
- Mock HTTP responses for HTML and PDF
- Test HTML extraction with Readability
- Test PDF extraction
- Test content-type detection
- Test error handling

`tests/unit/web-tools.test.ts`:
- Test tool definitions match expected schema
- Test input validation

### Integration Tests

`tests/integration/web-tools-integration.test.ts`:
- Real Brave Search API calls (requires `BRAVE_SEARCH_API_KEY`)
- Real URL fetching (public URLs)
- Skip if API key not present

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BRAVE_SEARCH_API_KEY` | Yes | Brave Search API key |

## Docker Integration

Add to `docker-compose.yml`:
```yaml
environment:
  - BRAVE_SEARCH_API_KEY=${BRAVE_SEARCH_API_KEY}
```

## Security Considerations

- No user input validation on search queries — API handles sanitization
- URL validation: only allow `http://` and `https://` schemes
- No local file access via `file://` URLs
- Timeout limits prevent hanging on slow/unresponsive servers
