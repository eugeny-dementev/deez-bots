import path from "path";
import { BrowserType, BrowserContext, Page } from "playwright";

export function nameCheckerFactory(name: string) {
  const re = new RegExp(name, 'i');
  return (item: string) => re.test(item);
}

export function formatTime(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  const pluralize = (value: number, singular: string, plural: string) => value === 1
    ? `${value} ${singular}`
    : `${value} ${plural}`;

  const hoursPart = hours > 0 ? `${pluralize(hours % 24, 'hour', 'hours')} ` : '';
  const minutesPart = minutes > 0 ? `${pluralize(minutes % 60, 'minute', 'minutes')} ` : '';
  const secondsPart = seconds > 0 ? `${pluralize(seconds % 60, 'second', 'seconds')}` : '';

  return `${hoursPart}${minutesPart}${secondsPart}`.trim();
}

export function omit(obj: object, ...keys: string[]) {
  const entries = Object.entries(obj).filter(([key]) => !keys.includes(key));
  return Object.fromEntries(entries);
}

export function sleep(timeout: number) {
  return new Promise((res) => setTimeout(res, timeout));
}

export function getUserDataPath(): string {
  return path.resolve(process.cwd(), 'userData');
}

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
