import { acquire, connect, launch } from '@cloudflare/playwright'
import type { Browser } from '@cloudflare/playwright'
import { env } from 'cloudflare:workers'

const MAIN_CONTENT_SELECTOR = 'div#codex-content'
const DEFAULT_KEEP_ALIVE_MS = 600_000
const CONTENT_SELECTOR_TIMEOUT_MS = 30_000

async function getBrowser(): Promise<Browser> {
  const browserBinding = env.BROWSER

  if (!browserBinding) {
    throw new Error('Browser binding "BROWSER" not found in Cloudflare environment.')
  }

  return launch(browserBinding, { keep_alive: DEFAULT_KEEP_ALIVE_MS })
}

export function toRenderedPageUrl(markdownUrl: string): string {
  const parsedUrl = new URL(markdownUrl)

  if (parsedUrl.pathname.endsWith('.md')) {
    parsedUrl.pathname = parsedUrl.pathname.slice(0, -3)
  }

  return parsedUrl.toString()
}

export async function extractMainContentHTMLFromBrowserPage(
  url: string,
  browser: Browser,
): Promise<string | null> {
  const renderedPageUrl = toRenderedPageUrl(url)
  const page = await browser.newPage()

  try {
    await page.goto(renderedPageUrl, { waitUntil: 'domcontentloaded' })

    try {
      await page.waitForSelector(MAIN_CONTENT_SELECTOR, { timeout: CONTENT_SELECTOR_TIMEOUT_MS })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      if (/timeout/i.test(message)) {
        console.warn('[browser-render] timeout waiting for content selector', {
          url,
          renderedPageUrl,
          selector: MAIN_CONTENT_SELECTOR,
          timeoutMs: CONTENT_SELECTOR_TIMEOUT_MS,
          error: message,
        })
      }

      return null
    }

    const html = await page.$eval(MAIN_CONTENT_SELECTOR, (element) => element.outerHTML)
    return html || null
  } catch {
    return null
  } finally {
    await page.close()
  }
}

class Semaphore {
  private readonly queue: Array<() => void> = []
  private inUse = 0

  readonly limit: number

  constructor(limit: number) {
    this.limit = limit
  }

  async acquire() {
    if (this.inUse < this.limit) {
      this.inUse += 1
      return
    }

    await new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.inUse += 1
        resolve()
      })
    })
  }

  release() {
    this.inUse -= 1

    const next = this.queue.shift()
    if (next) {
      next()
    }
  }
}

export interface BrowserRenderPool {
  render: (url: string) => Promise<string | null>
  close: () => Promise<void>
}

interface BrowserSlot {
  sessionId: string | null
  browser: Browser | null
  semaphore: Semaphore
  connectPromise: Promise<void> | null
}

interface SharedPoolState {
  slots: BrowserSlot[]
  nextBrowserIndex: number
}

const sharedPoolStateByKey = new Map<string, SharedPoolState>()

function getSharedPoolState(browserCount: number, pagesPerBrowserConcurrency: number): SharedPoolState {
  const key = `${browserCount}:${pagesPerBrowserConcurrency}`
  const existingState = sharedPoolStateByKey.get(key)

  if (existingState) {
    return existingState
  }

  const state: SharedPoolState = {
    slots: new Array(browserCount).fill(null).map(() => ({
      sessionId: null,
      browser: null,
      semaphore: new Semaphore(pagesPerBrowserConcurrency),
      connectPromise: null,
    })),
    nextBrowserIndex: 0,
  }

  sharedPoolStateByKey.set(key, state)
  return state
}

async function ensureSlotBrowser(slot: BrowserSlot): Promise<Browser | null> {
  if (slot.browser) {
    return slot.browser
  }

  if (slot.connectPromise) {
    await slot.connectPromise
    return slot.browser
  }

  slot.connectPromise = (async () => {
    try {
      if (!env.BROWSER) {
        throw new Error('Browser binding "BROWSER" not found in Cloudflare environment.')
      }

      if (!slot.sessionId) {
        const acquiredSession = await acquire(env.BROWSER, {
          keep_alive: DEFAULT_KEEP_ALIVE_MS,
        })
        slot.sessionId = acquiredSession.sessionId
      }

      slot.browser = await connect(env.BROWSER, {
        sessionId: slot.sessionId,
      })
    } catch (error) {
      console.error('[browser-render] failed to acquire/connect session', {
        phase: 'connect',
        sessionId: slot.sessionId,
        error: error instanceof Error ? error.message : String(error),
      })

      slot.sessionId = null
      slot.browser = null
    } finally {
      slot.connectPromise = null
    }
  })()

  await slot.connectPromise
  return slot.browser
}

export function createLazyBrowserRenderPool(
  browserCount: number,
  pagesPerBrowserConcurrency: number,
): BrowserRenderPool {
  const state = getSharedPoolState(browserCount, pagesPerBrowserConcurrency)

  const render = async (url: string): Promise<string | null> => {
    const browserIndex = state.nextBrowserIndex
    state.nextBrowserIndex = (state.nextBrowserIndex + 1) % state.slots.length

    const slot = state.slots[browserIndex]
    const semaphore = slot.semaphore

    await semaphore.acquire()
    try {
      let browser = await ensureSlotBrowser(slot)
      if (!browser) {
        return null
      }

      const html = await extractMainContentHTMLFromBrowserPage(url, browser)
      if (html !== null) {
        return html
      }

      slot.browser = null
      browser = await ensureSlotBrowser(slot)
      if (!browser) {
        return null
      }

      return extractMainContentHTMLFromBrowserPage(url, browser)
    } finally {
      semaphore.release()
    }
  }

  const close = async () => {
    // Intentionally no-op: browsers stay connected via keep-alive for cross-request reuse.
  }

  return {
    render,
    close,
  }
}

export async function getMainContentHTMLofPage(url: string): Promise<string | null> {
  let browser: Browser
  const renderedPageUrl = toRenderedPageUrl(url)
  const startedAt = Date.now()

  try {
    browser = await getBrowser()
  } catch (error) {
    console.error('[browser-render] failed to launch browser', {
      url,
      renderedPageUrl,
      phase: 'launch',
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }

  try {
    return extractMainContentHTMLFromBrowserPage(url, browser)
  } finally {
    await browser.close()
  }
}