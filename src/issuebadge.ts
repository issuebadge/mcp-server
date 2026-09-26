/**
 * Thin fetch-based client for the IssueBadge REST API (https://app.issuebadge.com/api/v1).
 * The API key is a bearer token; it is sent per request and never stored anywhere else.
 */

export const DEFAULT_BASE_URL = 'https://app.issuebadge.com/api/v1';

export type FetchLike = typeof fetch;

export interface Badge {
  id: string;
  name: string;
  description?: string;
  created_at?: string;
}

export interface IssueInput {
  badge_id: string;
  name: string;
  email?: string;
  phone?: string;
  idempotency_key?: string;
  metadata?: Record<string, unknown>;
}

export interface IssueResult {
  issue_id: string;
  certificate_url: string;
  idempotency_key: string;
}

export class IssueBadgeError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'IssueBadgeError';
    this.status = status;
  }
}

type ApiEnvelope = { success?: boolean; message?: string; [key: string]: unknown };

export class IssueBadgeClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = DEFAULT_BASE_URL,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  /** Raw request; throws IssueBadgeError on transport, parse, non-2xx or success:false. */
  private async request(path: string, init: RequestInit = {}): Promise<ApiEnvelope> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${this.apiKey}`);
    headers.set('Accept', 'application/json');

    let res: Response;
    try {
      // .call(globalThis): workerd's fetch throws "Illegal invocation" when called as a method of another object.
      res = await this.fetchImpl.call(globalThis, this.baseUrl + path, { ...init, headers });
    } catch {
      throw new IssueBadgeError('IssueBadge API unreachable');
    }

    let data: ApiEnvelope;
    try {
      data = (await res.json()) as ApiEnvelope;
    } catch {
      throw new IssueBadgeError(`Unexpected response from IssueBadge (HTTP ${res.status})`, res.status);
    }

    if (!res.ok || data.success === false) {
      throw new IssueBadgeError(
        typeof data.message === 'string' && data.message ? data.message : `IssueBadge API error (HTTP ${res.status})`,
        res.status,
      );
    }
    return data;
  }

  postJson(path: string, body: unknown): Promise<ApiEnvelope> {
    return this.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  postForm(path: string, form: FormData): Promise<ApiEnvelope> {
    return this.request(path, { method: 'POST', body: form });
  }

  async validateKey(): Promise<{ valid: boolean; message?: string }> {
    try {
      const data = await this.postJson('/validate-key', { api_key: this.apiKey });
      return { valid: true, message: typeof data.message === 'string' ? data.message : undefined };
    } catch (err) {
      if (err instanceof IssueBadgeError && err.status !== undefined && err.status < 500) {
        return { valid: false, message: err.message };
      }
      throw err;
    }
  }

  async listBadges(limit?: number): Promise<Badge[]> {
    const data = await this.request('/badge/getall');
    const rows = Array.isArray(data.data) ? (data.data as Record<string, unknown>[]) : [];
    const badges = rows.map((b) => ({
      id: String(b.id ?? b.badge_id ?? ''),
      name: String(b.name ?? '(unnamed)'),
      description: typeof b.description === 'string' ? b.description : undefined,
      created_at: typeof b.created_at === 'string' ? b.created_at : undefined,
    }));
    return typeof limit === 'number' && limit > 0 ? badges.slice(0, limit) : badges;
  }

  async issueBadge(input: IssueInput): Promise<IssueResult> {
    const idempotency_key = input.idempotency_key || `mcp-${crypto.randomUUID()}`;
    const data = await this.postJson('/issue/create', { ...input, idempotency_key });
    return {
      issue_id: String(data.IssueId ?? ''),
      certificate_url: String(data.publicUrl ?? ''),
      idempotency_key,
    };
  }
}
