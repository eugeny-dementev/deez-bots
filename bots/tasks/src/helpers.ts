
export async function openBrowser(chromium: BrowserType<{}>): Promise<{ browser: BrowserContext; page: Page; }> {
  const browser = await chromium.launchPersistentContext(getUserDataPath(), { headless: true });
  const pages = browser.pages()

  for (const page of pages) {
    page.close();
  }

  const page: Page = await browser.newPage();

  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  await page.setExtraHTTPHeaders({
    'User-Agent': userAgent,
    'Accept-Language': 'en-US,en;q=0.9'
  });

  return { browser, page };
}

export async function closeBrowser(browser: BrowserContext): Promise<void> {
  const pages = browser.pages();

  for (const page of pages) {
    page.close();
  }

  await browser.close();
}
