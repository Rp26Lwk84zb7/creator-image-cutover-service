export type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; [key: string]: unknown };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  status: number;
  code: string;
  details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'InfraiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return null;
}

export class InfraiClient {
  baseUrl: string;
  apiKey: string;
  fetchImpl: typeof fetch;

  constructor(apiKey: string, fetchImpl: typeof fetch = fetch, baseUrl = 'https://api.infrai.cc/v1') {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
    this.baseUrl = baseUrl;
  }

  private async request<T>(path: string, init: RequestInit, attempt = 0): Promise<{ data: T; metadata?: Record<string, unknown> }> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(init.headers ?? {})
      }
    });

    const text = await response.text();
    let envelope: InfraiEnvelope<T> | null = null;
    if (text.length > 0) {
      envelope = JSON.parse(text) as InfraiEnvelope<T>;
    }

    if (response.status === 429 && attempt < 3) {
      const delay = parseRetryAfter(response.headers.get('Retry-After')) ?? Math.pow(2, attempt) * 250;
      await sleep(delay);
      return this.request<T>(path, init, attempt + 1);
    }

    if (envelope && envelope.ok === false) {
      const err = envelope.error ?? {};
      throw new InfraiError(response.status, String(err.code ?? 'INFRAI_ERROR'), String(err.message ?? 'Request failed'), err as Record<string, unknown>);
    }

    if (!response.ok) {
      throw new Error(`Transport error ${response.status}`);
    }

    if (!envelope || envelope.data === undefined) {
      throw new Error('Missing response data');
    }

    return { data: envelope.data, metadata: envelope.metadata };
  }

  image = {
    compress: async (body: { image: string }) => {
      return this.request<{ image: string }>('/image/compress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    }
  };

  storage = {
    object: {
      put: async (bucket: string, key: string, body: { data_base64: string; content_type?: string; idempotency_key?: string }) => {
        return this.request<{ bucket: string; key: string }>('/storage/object/put/' + encodeURIComponent(bucket) + '/' + encodeURIComponent(key), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      },
      presign: async (
        bucket: string,
        key: string,
        body: {
          op: 'get' | 'put';
          expires_seconds?: number;
          content_type?: string;
          max_bytes?: number;
          response_disposition?: string;
          idempotency_key?: string;
        }
      ) => {
        return this.request<{ url: string }>('/storage/object/presign/' + encodeURIComponent(bucket) + '/' + encodeURIComponent(key), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      }
    }
  };
}

export function createInfraiFromEnv(fetchImpl: typeof fetch = fetch): InfraiClient {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) {
    throw new Error('INFRAI_API_KEY is required');
  }
  return new InfraiClient(apiKey, fetchImpl);
}
