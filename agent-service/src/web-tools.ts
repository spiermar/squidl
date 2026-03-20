import { Type, type Static } from '@sinclair/typebox'
import type { ExtensionAPI, AgentToolResult } from '@mariozechner/pi-coding-agent'
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

type WebSearchParams = Static<typeof webSearchSchema>
type WebFetchParams = Static<typeof webFetchSchema>

function formatSearchResult(result: WebSearchResult | WebSearchError): string {
  if (result.error) {
    return `Error: ${result.message}`
  }
  return result.results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.description}`).join('\n\n')
}

function formatFetchResult(result: FetchedContent | FetchError): string {
  if (result.error) {
    return `Error: ${result.message}`
  }
  return result.content
}

export default function webToolsExtension(pi: ExtensionAPI) {
  const braveClient = new BraveSearchClient()

  pi.registerTool({
    name: 'web_search',
    label: 'Web Search',
    description: 'Search the web using Brave Search API. Returns a list of results with titles, URLs, and descriptions.',
    parameters: webSearchSchema,
    execute: async (_toolCallId: string, params: WebSearchParams): Promise<AgentToolResult<WebSearchResult | WebSearchError>> => {
      const options: WebSearchOptions = {}
      if (params.count !== undefined) options.count = params.count
      const result = await braveClient.search(params.query, options)
      return {
        content: [{ type: 'text', text: formatSearchResult(result) }],
        details: result,
      }
    },
  })

  pi.registerTool({
    name: 'web_fetch',
    label: 'Web Fetch',
    description: 'Fetch content from a URL. Extracts readable content from web pages (HTML→markdown) and PDFs (text).',
    parameters: webFetchSchema,
    execute: async (_toolCallId: string, params: WebFetchParams): Promise<AgentToolResult<FetchedContent | FetchError>> => {
      const result = await fetchContent(params.url)
      return {
        content: [{ type: 'text', text: formatFetchResult(result) }],
        details: result,
      }
    },
  })
}
