import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'
import { fetchContent } from '../../src/content-fetcher.js'

vi.mock('pdf-parse', () => ({
  default: vi.fn().mockResolvedValue({ text: 'Extracted PDF text' }),
  __esModule: true,
}))

describe('fetchContent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    // @ts-expect-error cleanup
    delete global.fetch
  })

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
      expect(result.content).toContain('**test** content')
    }
  })

  it('extracts text from PDF content', async () => {
    const mockPdfBuffer = Buffer.from('%PDF-1.4 mock pdf content')
    
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/pdf' }),
      arrayBuffer: async () => mockPdfBuffer,
    })
    global.fetch = mockFetch

    const result = await fetchContent('https://example.com/doc.pdf')

    expect(result.error).toBeUndefined()
    if (!result.error) {
      expect(result.contentType).toBe('application/pdf')
      expect(result.content).toBe('Extracted PDF text')
    }
  })

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

  it('returns error for unsupported content type', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'image/png' }),
    })
    global.fetch = mockFetch

    const result = await fetchContent('https://example.com/image.png')

    expect(result.error).toBe(true)
    if (result.error) {
      expect(result.message).toContain('Unsupported content type')
    }
  })
})
