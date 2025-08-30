import { delay } from "@/utils/misc";

export interface RetryConfig {
  maxRetries?: number;
  retryDelay?: number;
  retryCondition?: (response: Response) => boolean;
  exponentialBackoff?: boolean;
}

export class HTTPError extends Error {
  readonly response: any;
  readonly status: number;
  readonly statusText: string;

  constructor(status: number, statusText: string, response: any) {
    super(statusText);
    this.status = status;
    this.statusText = statusText;
    this.response = response;
  }
}

const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  retryDelay: 1000,
  retryCondition: (response) => response.ok || response.status === 404,
  exponentialBackoff: true,
};

async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  retryConfig: RetryConfig = {}
): Promise<Response> {
  const config = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };

  for (let i = 0; i < config.maxRetries; i++) {
    try {
      const response = await fetch(url, init);

      if (config.retryCondition(response)) {
        return response;
      }

      if (i === config.maxRetries - 1) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      await delay(
        config.exponentialBackoff
          ? config.retryDelay * Math.pow(2, i)
          : config.retryDelay
      );
    } catch (error) {
      if (i === config.maxRetries - 1) {
        throw error;
      }
      await delay(
        config.exponentialBackoff
          ? config.retryDelay * Math.pow(2, i)
          : config.retryDelay
      );
    }
  }

  throw new Error("Max retries exceeded");
}

async function baseFetch<TResponse = unknown>(
  url: string,
  init: RequestInit = {},
  headers?: Record<string, string>
): Promise<TResponse> {
  const defaultHeaders = {
    "Content-Type": "application/json",
    ...headers,
  };

  const response = await fetch(url, {
    ...init,
    headers: defaultHeaders,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new HTTPError(response.status, response.statusText, data);
  }

  return data as TResponse;
}

async function baseFetchWithRetry<TResponse = unknown>(
  url: string,
  init: RequestInit = {},
  headers?: Record<string, string>,
  retryConfig?: RetryConfig
): Promise<TResponse> {
  const defaultHeaders = {
    "Content-Type": "application/json",
    ...headers,
  };

  const response = await fetchWithRetry(
    url,
    {
      ...init,
      headers: defaultHeaders,
    },
    retryConfig
  );

  const data = await response.json();

  if (!response.ok) {
    throw new HTTPError(response.status, response.statusText, data);
  }

  return data as TResponse;
}

const get = <TResponse = unknown>(
  url: string,
  headers?: Record<string, string>
): Promise<TResponse> => {
  return baseFetch<TResponse>(url, { method: "GET" }, headers);
};

const post = <TResponse = unknown, TBody = Record<string, unknown>>(
  url: string,
  body: TBody,
  headers?: Record<string, string>
): Promise<TResponse> => {
  return baseFetch<TResponse>(
    url,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    headers
  );
};

const put = <TResponse = unknown, TBody = Record<string, unknown>>(
  url: string,
  body: TBody,
  headers?: Record<string, string>
): Promise<TResponse> => {
  return baseFetch<TResponse>(
    url,
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
    headers
  );
};

const patch = <TResponse = unknown, TBody = Record<string, unknown>>(
  url: string,
  body: TBody,
  headers?: Record<string, string>
): Promise<TResponse> => {
  return baseFetch<TResponse>(
    url,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
    headers
  );
};

const del = <TResponse = unknown>(
  url: string,
  headers?: Record<string, string>
): Promise<TResponse> => {
  return baseFetch<TResponse>(url, { method: "DELETE" }, headers);
};

const getWithRetry = <TResponse = unknown>(
  url: string,
  headers?: Record<string, string>,
  retryConfig?: RetryConfig
): Promise<TResponse> => {
  return baseFetchWithRetry<TResponse>(
    url,
    { method: "GET" },
    headers,
    retryConfig
  );
};

const postWithRetry = <TResponse = unknown, TBody = Record<string, unknown>>(
  url: string,
  body: TBody,
  headers?: Record<string, string>,
  retryConfig?: RetryConfig
): Promise<TResponse> => {
  return baseFetchWithRetry<TResponse>(
    url,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    headers,
    retryConfig
  );
};

const putWithRetry = <TResponse = unknown, TBody = Record<string, unknown>>(
  url: string,
  body: TBody,
  headers?: Record<string, string>,
  retryConfig?: RetryConfig
): Promise<TResponse> => {
  return baseFetchWithRetry<TResponse>(
    url,
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
    headers,
    retryConfig
  );
};

const patchWithRetry = <TResponse = unknown, TBody = Record<string, unknown>>(
  url: string,
  body: TBody,
  headers?: Record<string, string>,
  retryConfig?: RetryConfig
): Promise<TResponse> => {
  return baseFetchWithRetry<TResponse>(
    url,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
    headers,
    retryConfig
  );
};

const deleteWithRetry = <TResponse = unknown>(
  url: string,
  headers?: Record<string, string>,
  retryConfig?: RetryConfig
): Promise<TResponse> => {
  return baseFetchWithRetry<TResponse>(
    url,
    { method: "DELETE" },
    headers,
    retryConfig
  );
};

export const api = {
  get,
  post,
  put,
  patch,
  delete: del,
  getWithRetry,
  postWithRetry,
  putWithRetry,
  patchWithRetry,
  deleteWithRetry,
};
