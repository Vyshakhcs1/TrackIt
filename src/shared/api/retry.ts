import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

export interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export const defaultRetryOptions: RetryOptions = {
  retries: 2,
  baseDelayMs: 500,
  maxDelayMs: 4000,
};

type RetryableConfig = InternalAxiosRequestConfig & { retryAttempt?: number };

const retryableStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);

// Network failures and timeouts have no response; of the rest, only transient server errors retry.
export function isRetryableError(error: unknown): boolean {
  if (!axios.isAxiosError(error) || error.code === 'ERR_CANCELED') {
    return false;
  }
  return !error.response || retryableStatuses.has(error.response.status);
}

function retryDelayMs(attempt: number, error: unknown, options: RetryOptions): number {
  const retryAfter = axios.isAxiosError(error)
    ? Number(error.response?.headers?.['retry-after'])
    : NaN;
  if (Number.isFinite(retryAfter) && retryAfter >= 0) {
    return Math.min(retryAfter * 1000, options.maxDelayMs);
  }
  const exponential = Math.min(options.baseDelayMs * 2 ** attempt, options.maxDelayMs);
  return exponential / 2 + Math.random() * (exponential / 2);
}

export function attachRetry(client: AxiosInstance, options: RetryOptions): void {
  const sleep = options.sleep ?? ((milliseconds: number) =>
    new Promise<void>(resolve => setTimeout(resolve, milliseconds)));

  client.interceptors.response.use(undefined, async (error: unknown) => {
    const config = axios.isAxiosError(error) ? (error.config as RetryableConfig | undefined) : undefined;
    const attempt = config?.retryAttempt ?? 0;
    if (!config || attempt >= options.retries || !isRetryableError(error)) {
      throw error;
    }

    config.retryAttempt = attempt + 1;
    await sleep(retryDelayMs(attempt, error, options));
    return client.request(config);
  });
}
