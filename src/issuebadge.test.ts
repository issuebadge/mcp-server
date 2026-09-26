import { describe, it, expect, vi } from 'vitest';
import { IssueBadgeClient, IssueBadgeError, DEFAULT_BASE_URL } from './issuebadge.js';

type Call = { url: string; init: RequestInit };
function mockFetch(responder: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    return responder({ url, init });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('IssueBadgeClient', () => {
  it('validateKey returns valid=true when the API says success', async () => {
    const f = mockFetch(() => json({ success: true, message: 'ok' }));
    const c = new IssueBadgeClient('key-1', DEFAULT_BASE_URL, f.fn);
    expect(await c.validateKey()).toEqual({ valid: true, message: 'ok' });
    expect(f.calls[0].url).toBe(DEFAULT_BASE_URL + '/validate-key');
    expect(JSON.parse(f.calls[0].init.body as string)).toEqual({ api_key: 'key-1' });
  });

  it('validateKey returns valid=false on 401 instead of throwing', async () => {
    const f = mockFetch(() => json({ success: false, message: 'Unauthenticated.' }, 401));
    const c = new IssueBadgeClient('bad', DEFAULT_BASE_URL, f.fn);
    expect(await c.validateKey()).toEqual({ valid: false, message: 'Unauthenticated.' });
  });

  it('listBadges sends the bearer key and maps data[] to {id,name}', async () => {
    const f = mockFetch(() => json({ success: true, data: [
      { id: 'B1', name: 'Completion', description: 'd', created_at: '2026-01-01' },
      { badge_id: 'B2', name: 'Attendance' },
    ] }));
    const c = new IssueBadgeClient('key-1', DEFAULT_BASE_URL, f.fn);
    const badges = await c.listBadges();
    expect(badges).toEqual([
      { id: 'B1', name: 'Completion', description: 'd', created_at: '2026-01-01' },
      { id: 'B2', name: 'Attendance', description: undefined, created_at: undefined },
    ]);
    const h = new Headers(f.calls[0].init.headers);
    expect(h.get('authorization')).toBe('Bearer key-1');
    expect(f.calls[0].init.method ?? 'GET').toBe('GET');
  });

  it('listBadges honours limit', async () => {
    const f = mockFetch(() => json({ success: true, data: [{ id: '1', name: 'a' }, { id: '2', name: 'b' }] }));
    const c = new IssueBadgeClient('k', DEFAULT_BASE_URL, f.fn);
    expect((await c.listBadges(1)).map(b => b.id)).toEqual(['1']);
  });

  it('issueBadge posts the payload, defaults idempotency_key to mcp-<uuid>, returns ids', async () => {
    const f = mockFetch(() => json({ success: true, IssueId: 'X64MM', publicUrl: 'https://app.issuebadge.com/v/X64MM' }));
    const c = new IssueBadgeClient('k', DEFAULT_BASE_URL, f.fn);
    const r = await c.issueBadge({ badge_id: 'B1', name: 'Jane Doe', email: 'jane@example.com' });
    expect(r.issue_id).toBe('X64MM');
    expect(r.certificate_url).toBe('https://app.issuebadge.com/v/X64MM');
    expect(r.idempotency_key).toMatch(/^mcp-[0-9a-f-]{36}$/);
    const body = JSON.parse(f.calls[0].init.body as string);
    expect(body).toMatchObject({ badge_id: 'B1', name: 'Jane Doe', email: 'jane@example.com', idempotency_key: r.idempotency_key });
    expect(f.calls[0].url).toBe(DEFAULT_BASE_URL + '/issue/create');
  });

  it('issueBadge keeps a supplied idempotency_key and forwards metadata', async () => {
    const f = mockFetch(() => json({ success: true, IssueId: '1', publicUrl: 'u' }));
    const c = new IssueBadgeClient('k', DEFAULT_BASE_URL, f.fn);
    await c.issueBadge({ badge_id: 'B', name: 'N', idempotency_key: 'course-42-jane', metadata: { score: 9 } });
    const body = JSON.parse(f.calls[0].init.body as string);
    expect(body.idempotency_key).toBe('course-42-jane');
    expect(body.metadata).toEqual({ score: 9 });
  });

  it('throws IssueBadgeError with the API message on HTTP 200 + success:false', async () => {
    const f = mockFetch(() => json({ success: false, message: 'Validation failed' }));
    const c = new IssueBadgeClient('k', DEFAULT_BASE_URL, f.fn);
    await expect(c.listBadges()).rejects.toMatchObject({ name: 'IssueBadgeError', message: 'Validation failed', status: 200 });
  });

  it('throws IssueBadgeError with HTTP status on non-2xx', async () => {
    const f = mockFetch(() => json({ message: 'Unauthenticated.' }, 401));
    const c = new IssueBadgeClient('k', DEFAULT_BASE_URL, f.fn);
    await expect(c.listBadges()).rejects.toMatchObject({ message: 'Unauthenticated.', status: 401 });
  });

  it('throws "Unexpected response" when the body is not JSON', async () => {
    const f = mockFetch(() => new Response('<html>502</html>', { status: 502 }));
    const c = new IssueBadgeClient('k', DEFAULT_BASE_URL, f.fn);
    await expect(c.listBadges()).rejects.toThrow(/Unexpected response from IssueBadge \(HTTP 502\)/);
  });

  it('throws "unreachable" when fetch itself fails', async () => {
    const f = { fn: (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch };
    const c = new IssueBadgeClient('k', DEFAULT_BASE_URL, f.fn);
    await expect(c.listBadges()).rejects.toThrow('IssueBadge API unreachable');
  });

  it('invokes fetch with the global receiver, never with the client as `this` (workerd throws "Illegal invocation")', async () => {
    let receiver: unknown = 'unset';
    const strictFetch = async function (this: unknown) {
      receiver = this;
      return json({ success: true, data: [] });
    } as unknown as typeof fetch;
    const c = new IssueBadgeClient('k', DEFAULT_BASE_URL, strictFetch);
    await c.listBadges();
    expect(receiver === c).toBe(false);
    expect(receiver === globalThis || receiver === undefined).toBe(true);
  });

  it('never includes the API key in error messages', async () => {
    const f = mockFetch(() => json({ success: false, message: 'nope' }, 500));
    const c = new IssueBadgeClient('secret-key-123', DEFAULT_BASE_URL, f.fn);
    const err = await c.listBadges().catch(e => e as IssueBadgeError);
    expect(String(err)).not.toContain('secret-key-123');
  });
});
