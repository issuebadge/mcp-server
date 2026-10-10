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

export const QR_TYPES = ['url', 'vcard', 'paypal', 'wifi', 'email', 'phone', 'sms', 'maps', 'event', 'facebook', 'twitter', 'youtube', 'text', 'mecard'] as const;
export type QrType = (typeof QR_TYPES)[number];

// `type` (not interface) so the shapes are assignable to Record<string, unknown> in tool results.
export type QrCode = {
  code: string;
  name: string;
  type: string;
  data: Record<string, unknown>;
  is_active: boolean;
  scan_count: number;
  scan_url: string;
  image_url: string;
  created_at?: string;
  updated_at?: string;
  /** data:image/png;base64,… — only on create and get. */
  image_base64?: string;
};

export type QrScan = {
  scanned_at?: string;
  ip_address?: string;
  user_agent?: string;
  referer?: string;
};

export interface QrCreateInput {
  name: string;
  type: QrType;
  data: Record<string, unknown>;
  is_active?: boolean;
}

export interface QrUpdateInput {
  name?: string;
  data?: Record<string, unknown>;
  is_active?: boolean;
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

  private sendJson(method: 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<ApiEnvelope> {
    return this.request(path, {
      method,
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
  }

  private static query(params: Record<string, string | number | undefined>): string {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
    const s = q.toString();
    return s ? `?${s}` : '';
  }

  private static qr(row: Record<string, unknown>): QrCode {
    return {
      code: String(row.code ?? ''),
      name: String(row.name ?? ''),
      type: String(row.type ?? ''),
      data: typeof row.data === 'object' && row.data !== null ? (row.data as Record<string, unknown>) : {},
      is_active: Boolean(row.is_active),
      scan_count: Number(row.scan_count ?? 0),
      scan_url: String(row.scan_url ?? ''),
      image_url: String(row.image_url ?? ''),
      created_at: typeof row.created_at === 'string' ? row.created_at : undefined,
      updated_at: typeof row.updated_at === 'string' ? row.updated_at : undefined,
      ...(typeof row.image_base64 === 'string' ? { image_base64: row.image_base64 } : {}),
    };
  }

  // ---- Dynamic QR codes (/qrcode). The image encodes /q/{code}, so `data` can change after printing. ----

  async listQrCodes(opts: { type?: string; limit?: number } = {}): Promise<{ qr_codes: QrCode[]; total: number }> {
    const perPage = typeof opts.limit === 'number' && opts.limit > 0 ? Math.min(opts.limit, 100) : 20;
    const data = await this.request('/qrcode' + IssueBadgeClient.query({ per_page: perPage, type: opts.type }));
    const rows = Array.isArray(data.data) ? (data.data as Record<string, unknown>[]) : [];
    const pagination = (data.pagination ?? {}) as { total?: number };
    return { qr_codes: rows.map(IssueBadgeClient.qr), total: Number(pagination.total ?? rows.length) };
  }

  async createQrCode(input: QrCreateInput): Promise<QrCode> {
    const data = await this.postJson('/qrcode/create', input);
    return IssueBadgeClient.qr((data.data ?? {}) as Record<string, unknown>);
  }

  async getQrCode(code: string): Promise<QrCode> {
    const data = await this.request(`/qrcode/${encodeURIComponent(code)}`);
    return IssueBadgeClient.qr((data.data ?? {}) as Record<string, unknown>);
  }

  async updateQrCode(code: string, input: QrUpdateInput): Promise<QrCode> {
    const data = await this.sendJson('PATCH', `/qrcode/${encodeURIComponent(code)}`, input);
    return IssueBadgeClient.qr((data.data ?? {}) as Record<string, unknown>);
  }

  async listQrScans(code: string, limit?: number): Promise<{ code: string; scan_count: number; scans: QrScan[]; total: number }> {
    const perPage = typeof limit === 'number' && limit > 0 ? Math.min(limit, 200) : 50;
    const data = await this.request(`/qrcode/${encodeURIComponent(code)}/scans` + IssueBadgeClient.query({ per_page: perPage }));
    const rows = Array.isArray(data.data) ? (data.data as Record<string, unknown>[]) : [];
    const pagination = (data.pagination ?? {}) as { total?: number };
    return {
      code: String(data.code ?? code),
      scan_count: Number(data.scan_count ?? 0),
      scans: rows.map((s) => ({
        scanned_at: typeof s.scanned_at === 'string' ? s.scanned_at : undefined,
        ip_address: typeof s.ip_address === 'string' ? s.ip_address : undefined,
        user_agent: typeof s.user_agent === 'string' ? s.user_agent : undefined,
        referer: typeof s.referer === 'string' ? s.referer : undefined,
      })),
      total: Number(pagination.total ?? rows.length),
    };
  }

  async deleteQrCode(code: string): Promise<{ deleted: true; code: string }> {
    await this.sendJson('DELETE', `/qrcode/${encodeURIComponent(code)}`);
    return { deleted: true, code };
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
