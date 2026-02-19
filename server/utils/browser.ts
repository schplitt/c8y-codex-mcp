import { launch } from '@cloudflare/playwright'
import type { Browser } from '@cloudflare/playwright'
import { env } from 'cloudflare:workers'

const MAIN_CONTENT_SELECTOR = 'div#codex-content'

async function getBrowser(): Promise<Browser> {
  const browserBinding = env.BROWSER

  if (!browserBinding) {
    throw new Error('Browser binding "BROWSER" not found in Cloudflare environment.')
  }

  // https://developers.cloudflare.com/browser-rendering/playwright/
  // DO NOT cache browser at module level - Cloudflare Workers forbids I/O object reuse
  // across different request contexts. Create a fresh browser for each request.
  return launch(browserBinding)
}

export function toRenderedPageUrl(markdownUrl: string): string {
  const parsedUrl = new URL(markdownUrl)

  if (parsedUrl.pathname.endsWith('.md')) {
    parsedUrl.pathname = parsedUrl.pathname.slice(0, -3)
  }

  return parsedUrl.toString()
}

export async function getMainContentHTMLofPage(url: string): Promise<string | null> {
  let browser: Browser

  try {
    browser = await getBrowser()
  } catch {
    return null
  }

  const page = await browser.newPage()

  try {
    await page.goto(toRenderedPageUrl(url), { waitUntil: 'domcontentloaded' })
    await page.waitForSelector(MAIN_CONTENT_SELECTOR, { timeout: 15000 })
    const html = await page.$eval(MAIN_CONTENT_SELECTOR, (element) => element.outerHTML)
    return html || null
  } catch {
    return null
  } finally {
    await page.close()
  }
}
