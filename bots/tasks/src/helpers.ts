import { Browser, BrowserType, Page } from "playwright";

export async function openBrowser(chromium: BrowserType<{}>): Promise<{ browser: Browser; page: Page; }> {
  const browser = await chromium.launch();

  const context = await browser.newContext();

  await context.addInitScript("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")

  const page: Page = await browser.newPage();

  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  await page.setExtraHTTPHeaders({
    'User-Agent': userAgent,
    'Accept-Language': 'en-US,en;q=0.9'
  });

  return { browser, page };
}

export async function closeBrowser(browser: Browser): Promise<void> {
  await browser.close();
}

export function isValidURL(url: string) {
  try {
    new URL(url);

    return true;
  } catch (e) {
    return false;
  }
}

