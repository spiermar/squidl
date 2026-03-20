# Web Search & Fetch Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `web_search` and `web_fetch` tools to agent-service using Brave Search API and content extraction libraries.

**Architecture:** Create three new modules: `brave-search.ts` (Brave API client), `content-fetcher.ts` (URL fetching + extraction), and `web-tools.ts` (tool definitions). Integrate alongside existing `createCodingTools()`.

**Tech Stack:** TypeScript, vitest, @mozilla/readability, turndown, pdf-parse, linkedom, @sinclair/typebox

**Spec:** `docs/superpowers/specs/2026-03-20-web-search-fetch-design.md`

---

## File Structure

```
agent-service/
├── src/
│   ├── agent.ts              # MODIFY: add createWebTools() to tools array
│   ├── web-tools.ts          # CREATE: tool definitions
│   ├── brave-search.ts       # CREATE: Brave Search API client
│   └── content-fetcher.ts    # CREATE: URL fetching + extraction
├── tests/
│   └── unit/
│       ├── brave-search.test.ts      # CREATE
│       ├── content-fetcher.test.ts   # CREATE
│       └── web-tools.test.ts         # CREATE
└── package.json              # MODIFY: add dependencies
```

---

### Task 1: Install Dependencies

**Files:**
- Modify: `agent-service/package.json`

- [ ] **Step 1: Add dependencies to package.json**

```bash
cd agent-service && npm install @mozilla/readability turndown pdf-parse linkedom
```

- [ ] **Step 2: Add dev dependencies for types**

```bash
cd agent-service && npm install -D @types/turndown
```

- [ ] **Step 3: Verify installation**

Run: `cd agent-service && npm ls @mozilla/readability turndown pdf-parse linkedom`
Expected: All packages listed with versions

- [ ] **Step 4: Commit**

```bash
git add agent-service/package.json agent-service/package-lock.json
git commit -m "chore: add web tools dependencies"
```

---

### Task 2: Create Brave Search Client

**Files:**
- Create: `agent-service/src/brave-search.ts`
- Create: `agent-service/tests/unit/brave-search.test.ts`

- [ ] **Step 1: Write failing test for missing API key**

`agent-service/tests/unit/brave-search.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { BraveSearchClient } from '../../src/brave-search.js'

describe('BraveSearchClient', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
    delete process.env.BRAVE_SEARCH_API_KEY
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns error when BRAVE_SEARCH_API_KEY is not set', async () => {
    const client = new BraveSearchClient()
    const result = await client.search('test query')
    
    expect(result.error).toBe(true)
    expect(result.message).toBe('BRAVE_SEARCH_API_KEY environment variable not set')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent-service && npx vitest run tests/unit/brave-search.test.ts`
Expected: FAIL - Cannot find module '../../src/brave-search.js'

- [ ] **Step 3: Write minimal implementation**

`agent-service/src/brave-search.ts`:

```typescript
import type { WebSearchResult, WebSearchError, WebSearchOptions, SearchResult } from './web-tools.js'

export class BraveSearchClient {
  private getApiKey(): string | null {
    return process.env.BRAVE_SEARCH_API_KEY ?? null
  }

  async search(query: string, options: WebSearchOptions = {}): Promise<WebSearchResult | WebSearchError> {
    const apiKey = this.getApiKey()
    if (!apiKey) {
      return { error: true, message: 'BRAVE_SEARCH_API_KEY environment variable not set' }
    }

    return { results: [] }
  }
}
```

- [ ] **Step 4: Create types file (dependency for brave-search.ts)**

`agent-service/src/web-tools.ts`:

```typescript
export interface SearchResult {
  title: string
  url: string
  description: string
}

export interface WebSearchOptions {
  count?: number
  offset?: number
  search_lang?: string
}

export interface WebSearchResult {
  error?: false
  results: SearchResult[]
}

export interface WebSearchError {
  error: true
  message: string
}

export interface FetchedContent {
  error?: false
  content: string
  contentType: 'text/html' | 'application/pdf'
}

export interface FetchError {
  error: true
  message: string
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd agent-service && npx vitest run tests/unit/brave-search.test.ts`
Expected: PASS

- [ ] **Step 6: Write failing test for successful search**

Add to `agent-service/tests/unit/brave-search.test.ts`:

```typescript
it('returns search results on successful API call', async () => {
  process.env.BRAVE_SEARCH_API_KEY = 'test-api-key'
  
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      web: {
        results: [
          { title: 'Result 1', url: 'https://example.com/1', description: 'Description 1' },
          { title: 'Result 2', url: 'https://example.com/2', description: 'Description 2' },
        ]
      }
    })
  })
  global.fetch = mockFetch

  const client = new BraveSearchClient()
  const result = await client.search('test query')

  expect(result.error).toBeUndefined()
  if (!result.error) {
    expect(result.results).toHaveLength(2)
    expect(result.results[0].title).toBe('Result 1')
    expect(result.results[0].url).toBe('https://example.com/1')
  }
})
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd agent-service && npx vitest run tests/unit/brave-search.test.ts`
Expected: FAIL - results is empty array

- [ ] **Step 8: Implement API call**

Update `agent-service/src/brave-search.ts`:

```typescript
import type { WebSearchResult, WebSearchError, WebSearchOptions, SearchResult } from './web-tools.js'

const API_BASE = 'https://api.search.brave.com/res/v1/web/search'
const DEFAULT_TIMEOUT = 30000

export class BraveSearchClient {
  private getApiKey(): string | null {
    return process.env.BRAVE_SEARCH_API_KEY ?? null
  }

  async search(query: string, options: WebSearchOptions = {}): Promise<WebSearchResult | WebSearchError> {
    const apiKey = this.getApiKey()
    if (!apiKey) {
      return { error: true, message: 'BRAVE_SEARCH_API_KEY environment variable not set' }
    }

    const count = options.count ?? 10
    const offset = options.offset ?? 0

    const params = new URLSearchParams({
      q: query,
      count: String(Math.min(count, 20)),
    })
    if (offset > 0) params.set('offset', String(offset))
    if (options.search_lang) params.set('search_lang', options.search_lang)

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT)

      const response = await fetch(`${API_BASE}?${params}`, {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': apiKey,
        },
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        if (response.status === 429) {
          return { error: true, message: 'Brave Search API rate limit exceeded' }
        }
        return { error: true, message: `Brave Search API error: ${response.status}` }
      }

      const data = await response.json() as { web?: { results?: Array<{ title: string; url: string; description: string }> } }
      const results: SearchResult[] = data.web?.results?.map(r => ({
        title: r.title,
        url: r.url,
        description: r.description,
      })) ?? []

      return { results }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return { error: true, message: 'Search request timed out' }
      }
      const message = err instanceof Error ? err.message : String(err)
      return { error: true, message: `Brave Search API error: ${message}` }
    }
  }
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd agent-service && npx vitest run tests/unit/brave-search.test.ts`
Expected: PASS

- [ ] **Step 10: Write test for rate limit error**

Add to `agent-service/tests/unit/brave-search.test.ts`:

```typescript
it('returns error on rate limit (429)', async () => {
  process.env.BRAVE_SEARCH_API_KEY = 'test-api-key'
  
  const mockFetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 429,
  })
  global.fetch = mockFetch

  const client = new BraveSearchClient()
  const result = await client.search('test query')

  expect(result.error).toBe(true)
  if (result.error) {
    expect(result.message).toBe('Brave Search API rate limit exceeded')
  }
})
```

- [ ] **Step 11: Run test to verify it passes**

Run: `cd agent-service && npx vitest run tests/unit/brave-search.test.ts`
Expected: PASS

- [ ] **Step 12: Commit**

```bash
git add agent-service/src/brave-search.ts agent-service/src/web-tools.ts agent-service/tests/unit/brave-search.test.ts
git commit -m "feat: add Brave Search client with error handling"
```

---

### Task 3: Create Content Fetcher

**Files:**
- Create: `agent-service/src/content-fetcher.ts`
- Create: `agent-service/tests/unit/content-fetcher.test.ts`

- [ ] **Step 1: Write failing test for invalid URL**

`agent-service/tests/unit/content-fetcher.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { fetchContent } from '../../src/content-fetcher.js'

describe('fetchContent', () => {
  it('returns error for invalid URL scheme', async () => {
    const result = await fetchContent('ftp://example.com/file')
    
    expect(result.error).toBe(true)
    if (result.error) {
      expect(result.message).toContain('Invalid URL')
    }
  })

  it('returns error for file:// URL', async () => {
    const result = await fetchContent('file:///etc/passwd')
    
    expect(result.error).toBe(true)
    if (result.error) {
      expect(result.message).toContain('Invalid URL')
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent-service && npx vitest run tests/unit/content-fetcher.test.ts`
Expected: FAIL - Cannot find module

- [ ] **Step 3: Write minimal implementation with URL validation**

`agent-service/src/content-fetcher.ts`:

```typescript
import type { FetchedContent, FetchError } from './web-tools.js'

const MAX_URL_LENGTH = 2048
const MAX_REDIRECTS = 5
const DEFAULT_TIMEOUT = 30000

function validateUrl(url: string): { valid: true } | { valid: false; error: string } {
  if (url.length > MAX_URL_LENGTH) {
    return { valid: false, error: `URL exceeds maximum length of ${MAX_URL_LENGTH} characters` }
  }

  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: `Invalid URL scheme: ${parsed.protocol}. Only http:// and https:// are allowed` }
    }
    return { valid: true }
  } catch {
    return { valid: false, error: `Invalid URL format: ${url}` }
  }
}

export async function fetchContent(url: string): Promise<FetchedContent | FetchError> {
  const validation = validateUrl(url)
  if (!validation.valid) {
    return { error: true, message: validation.error }
  }

  return { error: true, message: 'Not implemented' }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent-service && npx vitest run tests/unit/content-fetcher.test.ts`
Expected: PASS

- [ ] **Step 5: Write test for HTML content**

Add to `agent-service/tests/unit/content-fetcher.test.ts`:

```typescript
it('extracts markdown from HTML content', async () => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head><title>Test Page</title></head>
    <body>
      <article>
        <h1>Hello World</h1>
        <p>This is <strong>test</strong> content.</p>
      </article>
    </body>
    </html>
  `
  
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
    text: async () => html,
  })
  global.fetch = mockFetch

  const result = await fetchContent('https://example.com/page')

  expect(result.error).toBeUndefined()
  if (!result.error) {
    expect(result.contentType).toBe('text/html')
    expect(result.content).toContain('Hello World')
    expect(result.content).toContain('test content')
  }
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd agent-service && npx vitest run tests/unit/content-fetcher.test.ts`
Expected: FAIL - "Not implemented"

- [ ] **Step 7: Implement HTML extraction**

Update `agent-service/src/content-fetcher.ts`:

```typescript
import type { FetchedContent, FetchError } from './web-tools.js'
import { Readability } from '@mozilla/readability'
import { TurndownService } from 'turndown'
import { parseHTML } from 'linkedom'

const MAX_URL_LENGTH = 2048
const MAX_REDIRECTS = 5
const DEFAULT_TIMEOUT = 30000

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
})

function validateUrl(url: string): { valid: true } | { valid: false; error: string } {
  if (url.length > MAX_URL_LENGTH) {
    return { valid: false, error: `URL exceeds maximum length of ${MAX_URL_LENGTH} characters` }
  }

  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: `Invalid URL scheme: ${parsed.protocol}. Only http:// and https:// are allowed` }
    }
    return { valid: true }
  } catch {
    return { valid: false, error: `Invalid URL format: ${url}` }
  }
}

function extractContentType(header: string | null): string | null {
  if (!header) return null
  return header.split(';')[0].trim().toLowerCase()
}

async function extractHtml(html: string, url: string): Promise<string> {
  const { document } = parseHTML(html)
  const reader = new Readability(document)
  const article = reader.parse()

  if (!article || !article.content) {
    return document.body?.textContent?.trim() ?? ''
  }

  return turndownService.turndown(article.content)
}

export async function fetchContent(url: string): Promise<FetchedContent | FetchError> {
  const validation = validateUrl(url)
  if (!validation.valid) {
    return { error: true, message: validation.error }
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT)

    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      return { error: true, message: `Failed to fetch ${url}: HTTP ${response.status}` }
    }

    const contentType = extractContentType(response.headers.get('content-type'))

    if (contentType === 'text/html') {
      const html = await response.text()
      const content = await extractHtml(html, url)
      return { content, contentType: 'text/html' }
    }

    return {
      error: true,
      message: `Unsupported content type: ${contentType ?? 'unknown'}. Supported: text/html, application/pdf`,
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { error: true, message: `Request to ${url} timed out` }
    }
    const message = err instanceof Error ? err.message : String(err)
    return { error: true, message: `Failed to fetch ${url}: ${message}` }
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd agent-service && npx vitest run tests/unit/content-fetcher.test.ts`
Expected: PASS

- [ ] **Step 9: Write test for PDF content**

Add to `agent-service/tests/unit/content-fetcher.test.ts`:

```typescript
it('extracts text from PDF content', async () => {
  const mockPdfBuffer = Buffer.from('%PDF-1.4 mock pdf content')
  
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    headers: new Headers({ 'content-type': 'application/pdf' }),
    arrayBuffer: async () => mockPdfBuffer,
  })
  global.fetch = mockFetch

  vi.mock('pdf-parse', () => ({
    default: vi.fn().mockResolvedValue({ text: 'Extracted PDF text content' }),
  }))

  const result = await fetchContent('https://example.com/doc.pdf')

  expect(result.error).toBeUndefined()
  if (!result.error) {
    expect(result.contentType).toBe('application/pdf')
    expect(result.content).toContain('Extracted PDF text')
  }
})
```

- [ ] **Step 10: Run test to verify it fails**

Run: `cd agent-service && npx vitest run tests/unit/content-fetcher.test.ts`
Expected: FAIL - PDF not supported yet

- [ ] **Step 11: Add PDF extraction**

Update imports in `agent-service/src/content-fetcher.ts`:

```typescript
import type { FetchedContent, FetchError } from './web-tools.js'
import { Readability } from '@mozilla/readability'
import { TurndownService } from 'turndown'
import { parseHTML } from 'linkedom'
import pdf from 'pdf-parse'
```

Update the content-type handling in `fetchContent`:

```typescript
    if (contentType === 'text/html') {
      const html = await response.text()
      const content = await extractHtml(html, url)
      return { content, contentType: 'text/html' }
    }

    if (contentType === 'application/pdf') {
      const buffer = await response.arrayBuffer()
      const data = await pdf(Buffer.from(buffer))
      return { content: data.text, contentType: 'application/pdf' }
    }
```

- [ ] **Step 12: Run test to verify it passes**

Run: `cd agent-service && npx vitest run tests/unit/content-fetcher.test.ts`
Expected: PASS

- [ ] **Step 13: Write test for HTTP error**

Add to `agent-service/tests/unit/content-fetcher.test.ts`:

```typescript
it('returns error on HTTP 404', async () => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 404,
  })
  global.fetch = mockFetch

  const result = await fetchContent('https://example.com/notfound')

  expect(result.error).toBe(true)
  if (result.error) {
    expect(result.message).toContain('HTTP 404')
  }
})
```

- [ ] **Step 14: Run test to verify it passes**

Run: `cd agent-service && npx vitest run tests/unit/content-fetcher.test.ts`
Expected: PASS

- [ ] **Step 15: Commit**

```bash
git add agent-service/src/content-fetcher.ts agent-service/tests/unit/content-fetcher.test.ts
git commit -m "feat: add content fetcher with HTML and PDF extraction"
```

---

### Task 4: Create Web Tools

**Files:**
- Modify: `agent-service/src/web-tools.ts`
- Create: `agent-service/tests/unit/web-tools.test.ts`

- [ ] **Step 1: Write failing test for web_search tool definition**

`agent-service/tests/unit/web-tools.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { createWebTools } from '../../src/web-tools.js'

describe('createWebTools', () => {
  it('returns array of tools', () => {
    const tools = createWebTools()
    expect(tools).toBeInstanceOf(Array)
    expect(tools.length).toBe(2)
  })

  it('includes web_search tool', () => {
    const tools = createWebTools()
    const webSearch = tools.find(t => t.name === 'web_search')
    expect(webSearch).toBeDefined()
    expect(webSearch?.description).toContain('search')
  })

  it('includes web_fetch tool', () => {
    const tools = createWebTools()
    const webFetch = tools.find(t => t.name === 'web_fetch')
    expect(webFetch).toBeDefined()
    expect(webFetch?.description).toContain('fetch')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent-service && npx vitest run tests/unit/web-tools.test.ts`
Expected: FAIL - createWebTools is not a function

- [ ] **Step 3: Implement createWebTools**

Update `agent-service/src/web-tools.ts`:

```typescript
import { Type } from '@sinclair/typebox'
import type { Tool } from '@mariozechner/pi-coding-agent'
import { BraveSearchClient } from './brave-search.js'
import { fetchContent } from './content-fetcher.js'

export interface SearchResult {
  title: string
  url: string
  description: string
}

export interface WebSearchOptions {
  count?: number
  offset?: number
  search_lang?: string
}

export interface WebSearchResult {
  error?: false
  results: SearchResult[]
}

export interface WebSearchError {
  error: true
  message: string
}

export interface FetchedContent {
  error?: false
  content: string
  contentType: 'text/html' | 'application/pdf'
}

export interface FetchError {
  error: true
  message: string
}

const webSearchSchema = Type.Object({
  query: Type.String({ description: 'Search query' }),
  count: Type.Optional(Type.Number({ minimum: 1, maximum: 20, description: 'Number of results (1-20, default 10)' })),
})

const webFetchSchema = Type.Object({
  url: Type.String({ description: 'URL to fetch' }),
})

export function createWebTools(): Tool[] {
  const braveClient = new BraveSearchClient()

  const webSearchTool: Tool = {
    name: 'web_search',
    description: 'Search the web using Brave Search API. Returns a list of results with titles, URLs, and descriptions.',
    parameters: webSearchSchema,
    execute: async (args: unknown) => {
      const { query, count } = args as { query: string; count?: number }
      return braveClient.search(query, { count })
    },
  }

  const webFetchTool: Tool = {
    name: 'web_fetch',
    description: 'Fetch content from a URL. Extracts readable content from web pages (HTML→markdown) and PDFs (text).',
    parameters: webFetchSchema,
    execute: async (args: unknown) => {
      const { url } = args as { url: string }
      return fetchContent(url)
    },
  }

  return [webSearchTool, webFetchTool]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent-service && npx vitest run tests/unit/web-tools.test.ts`
Expected: PASS

- [ ] **Step 5: Write test for web_search execution**

Add to `agent-service/tests/unit/web-tools.test.ts`:

```typescript
import { vi, beforeEach, afterEach } from 'vitest'

describe('web_search tool execution', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    process.env.BRAVE_SEARCH_API_KEY = 'test-key'
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        web: { results: [{ title: 'Test', url: 'https://example.com', description: 'Desc' }] }
      }),
    })
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  it('returns search results', async () => {
    const tools = createWebTools()
    const webSearch = tools.find(t => t.name === 'web_search')
    
    const result = await webSearch!.execute({ query: 'test query' })
    
    expect(result).toMatchObject({
      results: [{ title: 'Test', url: 'https://example.com', description: 'Desc' }]
    })
  })
})
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd agent-service && npx vitest run tests/unit/web-tools.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add agent-service/src/web-tools.ts agent-service/tests/unit/web-tools.test.ts
git commit -m "feat: add createWebTools with web_search and web_fetch tools"
```

---

### Task 5: Integrate Web Tools into Agent

**Files:**
- Modify: `agent-service/src/agent.ts`

- [ ] **Step 1: Update agent.ts to include web tools**

Update `agent-service/src/agent.ts`:

Add import at top:
```typescript
import { createWebTools } from "./web-tools.js"
```

Update the createAgentSession call (around line 55):
```typescript
  const { session } = await createAgentSession({
    cwd: process.cwd(),
    model,
    thinkingLevel: "medium",
    tools: [...createCodingTools(process.cwd()), ...createWebTools()],
    resourceLoader: resourceLoader,
    sessionManager,
  });
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd agent-service && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add agent-service/src/agent.ts
git commit -m "feat: integrate web tools into agent session"
```

---

### Task 6: Update Docker Configuration

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add BRAVE_SEARCH_API_KEY to agent service**

Update `docker-compose.yml`:

```yaml
  agent:
    build: ./agent-service
    ports:
      - "8081:8081"
      - "8082:8082"
    volumes:
      - ~/workspace/pi-agent-burt:/workspace
    environment:
      - LLM_BASE_URL=${LLM_BASE_URL}
      - LLM_MODEL=${LLM_MODEL}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - WEBSOCKET_PORT=8081
      - HTTP_PORT=8082
      - BRAVE_SEARCH_API_KEY=${BRAVE_SEARCH_API_KEY}
```

- [ ] **Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add BRAVE_SEARCH_API_KEY to docker-compose"
```

---

### Task 7: Update .env.example

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add BRAVE_SEARCH_API_KEY to .env.example**

Add to `.env.example`:
```
BRAVE_SEARCH_API_KEY=your_brave_search_api_key_here
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add BRAVE_SEARCH_API_KEY to .env.example"
```

---

### Task 8: Run All Tests

- [ ] **Step 1: Run all unit tests**

Run: `cd agent-service && npm test`
Expected: All tests pass

- [ ] **Step 2: Run type check**

Run: `cd agent-service && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Build the project**

Run: `cd agent-service && npm run build`
Expected: Build succeeds

---

### Task 9: Final Commit

- [ ] **Step 1: Ensure all changes committed**

Run: `git status`
Expected: No uncommitted changes

- [ ] **Step 2: Verify commit history**

Run: `git log --oneline -10`
Expected: All task commits present
