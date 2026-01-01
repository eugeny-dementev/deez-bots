type RequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  timeoutMs?: number;
  userAgent?: string;
  noProxy?: boolean;
};

export class HttpStatusError extends Error {
  status: number;
  statusText: string;
  url: string;

  constructor(url: string, status: number, statusText: string) {
    super(`Request failed: ${status} ${statusText}`);
    this.status = status;
    this.statusText = statusText;
    this.url = url;
  }
}

function applyNoProxy(url: string): () => void {
  const host = new URL(url).hostname;
  const previous = process.env.NO_PROXY;
  const existing = previous ? previous.split(',').map((value) => value.trim()).filter(Boolean) : [];

  if (!existing.includes(host)) {
    const next = [...existing, host].join(',');
    process.env.NO_PROXY = next;
  }

  return () => {
    if (previous === undefined) {
      delete process.env.NO_PROXY;
    } else {
      process.env.NO_PROXY = previous;
    }
  };
}

export async function fetchWithTimeout(url: string, options: RequestOptions = {}): Promise<Response> {
  const {
    timeoutMs = 30000,
    headers,
    userAgent,
    noProxy,
    ...rest
  } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const requestHeaders = new Headers(headers);

  if (userAgent && !requestHeaders.has('User-Agent')) {
    requestHeaders.set('User-Agent', userAgent);
  }

  const restoreProxy = noProxy ? applyNoProxy(url) : () => undefined;

  try {
    return await fetch(url, {
      ...rest,
      headers: requestHeaders,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
    restoreProxy();
  }
}
