import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from './index.js';

const URL_MCP = 'https://issuebadge-mcp.issuebadge.workers.dev/mcp';
const KEY = '158|testkey';

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];
let apiResponder: (call: Call) => Response = () => new Response('{}', { status: 200 });
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  apiResponder = ({ url }) => {
    if (url.endsWith('/badge/getall')) return json({ success: true, data: [{ id: 'B1', name: 'Completion' }] });
    if (url.endsWith('/issue/create')) return json({ success: true, IssueId: 'I1', publicUrl: 'https://app.issuebadge.com/v/I1' });
    if (url.endsWith('/validate-key')) return json({ success: true, message: 'ok' });
    return json({ success: false, message: 'not found' }, 404);
  };
  globalThis.fetch = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return apiResponder({ url: String(url), init });
  }) as unknown as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function rpc(body: unknown, headers: Record<string, string> = { Authorization: `Bearer ${KEY}` }) {
  return worker.fetch(new Request(URL_MCP, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));
}
const req = (id: number, method: string, params?: unknown) => ({ jsonrpc: '2.0', id, method, params });

describe('worker routing', () => {
  it('GET /health → 200 ok', async () => {
    const r = await worker.fetch(new Request('https://x/health'));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true });
  });
  it('GET / → 302 to the docs', async () => {
    const r = await worker.fetch(new Request('https://x/'));
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toMatch(/^https:\/\/issuebadge\.com\//);
  });
  it('GET /mcp → 405, DELETE /mcp → 204', async () => {
    expect((await worker.fetch(new Request(URL_MCP))).status).toBe(405);
    expect((await worker.fetch(new Request(URL_MCP, { method: 'DELETE' }))).status).toBe(204);
  });
});

describe('worker auth', () => {
  it.each([
    ['no header', {}],
    ['blank bearer', { Authorization: 'Bearer ' }],
    ['basic auth', { Authorization: 'Basic abc' }],
  ])('%s → 401 with WWW-Authenticate', async (_n, headers) => {
    const r = await rpc(req(1, 'tools/list'), headers as Record<string, string>);
    expect(r.status).toBe(401);
    expect(r.headers.get('www-authenticate')).toBe(
      'Bearer realm="IssueBadge", resource_metadata="https://issuebadge-mcp.issuebadge.workers.dev/.well-known/oauth-protected-resource", scope="read write"',
    );
    expect((await r.json()).error.message).toMatch(/app\.issuebadge\.com\/developer\/index/);
    expect(calls).toHaveLength(0);
  });
});

describe('worker OAuth discovery (RFC 9728)', () => {
  it.each(['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'])('GET %s → metadata for /mcp', async (path) => {
    const r = await worker.fetch(new Request(`https://issuebadge-mcp.issuebadge.workers.dev${path}`));
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toMatch(/max-age/);
    expect(await r.json()).toEqual({
      resource: 'https://issuebadge-mcp.issuebadge.workers.dev/mcp',
      authorization_servers: ['https://app.issuebadge.com'],
      bearer_methods_supported: ['header'],
      scopes_supported: ['read', 'write'],
      resource_name: 'IssueBadge MCP server',
      resource_documentation: 'https://issuebadge.com/h/integration/mcp',
    });
  });
  it('AUTH_SERVER var overrides the authorization server (self-hosters)', async () => {
    const r = await worker.fetch(new Request('https://x/.well-known/oauth-protected-resource'), { AUTH_SERVER: 'https://ib.example.com' });
    expect((await r.json()).authorization_servers).toEqual(['https://ib.example.com']);
  });
});

describe('ChatGPT plugin directory domain verification', () => {
  it('serves the challenge token as text when the var is set, 404 otherwise', async () => {
    const set = await worker.fetch(new Request('https://x/.well-known/openai-apps-challenge'), { OPENAI_APPS_CHALLENGE: ' tok-123 ' });
    expect(set.status).toBe(200);
    expect(set.headers.get('content-type')).toBe('text/plain');
    expect(await set.text()).toBe('tok-123');
    expect((await worker.fetch(new Request('https://x/.well-known/openai-apps-challenge'))).status).toBe(404);
  });
});

describe('worker JSON-RPC', () => {
  it('initialize returns serverInfo and echoes a supported older protocol version', async () => {
    const r = await rpc(req(1, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'c', version: '1' } }));
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.result.serverInfo.name).toBe('issuebadge');
    expect(b.result.protocolVersion).toBe('2025-03-26');
    expect(b.result.capabilities).toEqual({ tools: {}, resources: {} });
  });
  it('initialize defaults to 2025-06-18 for unknown versions', async () => {
    const b = await (await rpc(req(1, 'initialize', { protocolVersion: '1999-01-01', capabilities: {}, clientInfo: { name: 'c', version: '1' } }))).json();
    expect(b.result.protocolVersion).toBe('2025-06-18');
  });
  it('ping → {}', async () => {
    expect((await (await rpc(req(7, 'ping'))).json()).result).toEqual({});
  });
  it('tools/list → the 3 remote tools, never create_badge', async () => {
    const b = await (await rpc(req(2, 'tools/list'))).json();
    expect(b.result.tools.map((t: { name: string }) => t.name)).toEqual(['validate_key', 'get_all_badges', 'issue_badge']);
  });
  it('tools/call get_all_badges forwards the caller bearer and returns structuredContent', async () => {
    const b = await (await rpc(req(3, 'tools/call', { name: 'get_all_badges', arguments: {} }))).json();
    expect(b.result.structuredContent).toEqual({ badges: [{ id: 'B1', name: 'Completion' }] });
    expect(new Headers(calls[0].init.headers).get('authorization')).toBe(`Bearer ${KEY}`);
    expect(calls[0].url).toBe('https://app.issuebadge.com/api/v1/badge/getall');
  });
  it('tools/call issue_badge returns the certificate url', async () => {
    const b = await (await rpc(req(4, 'tools/call', { name: 'issue_badge', arguments: { badge_id: 'B1', name: 'Jane', email: 'j@x.io' } }))).json();
    expect(b.result.structuredContent).toMatchObject({ issue_id: 'I1', certificate_url: 'https://app.issuebadge.com/v/I1' });
  });
  it('tools/call with bad params → -32602', async () => {
    const b = await (await rpc(req(5, 'tools/call', { name: 'get_all_badges', arguments: { limit: '5' } }))).json();
    expect(b.error.code).toBe(-32602);
  });
  it('API failure → isError tool result, not a JSON-RPC error', async () => {
    apiResponder = () => json({ success: false, message: 'Unauthenticated.' }, 401);
    const b = await (await rpc(req(6, 'tools/call', { name: 'get_all_badges', arguments: {} }))).json();
    expect(b.result.isError).toBe(true);
    expect(b.result.content[0].text).toBe('IssueBadge error: Unauthenticated.');
  });
  it('unknown method → -32601', async () => {
    expect((await (await rpc(req(8, 'prompts/list'))).json()).error.code).toBe(-32601);
  });
  it('tools/list carries ChatGPT widget + status _meta and securitySchemes', async () => {
    const tools = (await (await rpc(req(2, 'tools/list'))).json()).result.tools;
    const issue = tools.find((t: { name: string }) => t.name === 'issue_badge');
    expect(issue._meta['openai/outputTemplate']).toBe('ui://widget/certificate.html');
    expect(issue._meta.ui).toEqual({ resourceUri: 'ui://widget/certificate.html' });
    expect(issue._meta['openai/toolInvocation/invoking']).toBe('Issuing certificate…');
    expect(issue.securitySchemes).toEqual([{ type: 'oauth2', scopes: ['write'] }]);
    expect(issue.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(issue.outputSchema.required).toContain('certificate_url');
    expect(issue._meta.securitySchemes).toEqual([{ type: 'oauth2', scopes: ['write'] }]);
    const list = tools.find((t: { name: string }) => t.name === 'get_all_badges');
    expect(list.securitySchemes).toEqual([{ type: 'oauth2', scopes: ['read'] }]);
    expect(list.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });
    expect(list.outputSchema.properties.badges.type).toBe('array');
    expect(list._meta['openai/outputTemplate']).toBeUndefined();
  });
  it('resources/list + resources/read serve the certificate widget', async () => {
    const list = (await (await rpc(req(9, 'resources/list'))).json()).result.resources;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ uri: 'ui://widget/certificate.html', mimeType: 'text/html;profile=mcp-app' });
    expect(list[0]._meta['openai/widgetPrefersBorder']).toBe(true);
    const read = (await (await rpc(req(10, 'resources/read', { uri: 'ui://widget/certificate.html' }))).json()).result;
    expect(read.contents).toHaveLength(1);
    expect(read.contents[0].mimeType).toBe('text/html;profile=mcp-app');
    expect(read.contents[0].text).toContain('window.openai');
    expect(read.contents[0].text).toContain('ui/notifications/tool-result');
    expect(read.contents[0].text).toContain('certificate_url');
    expect((await (await rpc(req(11, 'resources/templates/list'))).json()).result.resourceTemplates).toEqual([]);
  });
  it('resources/read of an unknown uri → -32002', async () => {
    expect((await (await rpc(req(12, 'resources/read', { uri: 'ui://nope' }))).json()).error.code).toBe(-32002);
  });
  it('issue_badge echoes the recipient for the widget', async () => {
    const b = await (await rpc(req(4, 'tools/call', { name: 'issue_badge', arguments: { badge_id: 'B1', name: 'Jane', email: 'j@x.io' } }))).json();
    expect(b.result.structuredContent).toMatchObject({ issue_id: 'I1', badge_id: 'B1', name: 'Jane', email: 'j@x.io' });
  });
  it('invalid JSON → 400 with -32700', async () => {
    const r = await rpc('{not json');
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe(-32700);
  });
  it('notification-only body → 202 with no body', async () => {
    const r = await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(r.status).toBe(202);
    expect(await r.text()).toBe('');
  });
  it('batch of two requests → array of two responses', async () => {
    const r = await rpc([req(1, 'ping'), req(2, 'tools/list')]);
    const b = await r.json();
    expect(Array.isArray(b)).toBe(true);
    expect(b.map((m: { id: number }) => m.id)).toEqual([1, 2]);
  });
  it('batch containing only a notification → 202', async () => {
    expect((await rpc([{ jsonrpc: '2.0', method: 'notifications/initialized' }])).status).toBe(202);
  });
});

describe('worker module shape', () => {
  it('exports only the default handler and functions (workerd rejects other named exports)', async () => {
    const mod = await import('./index.js');
    for (const [name, value] of Object.entries(mod)) {
      if (name === 'default') continue;
      expect(typeof value, `export "${name}" must be a function`).toBe('function');
    }
  });
});

describe('worker invalid request bodies', () => {
  it('JSON null body → 400 with -32600, not a crash', async () => {
    const r = await rpc('null');
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe(-32600);
  });
  it('a null or non-object item inside a batch → -32600 for that item, others still answered', async () => {
    const r = await rpc([null, 5, req(2, 'ping')]);
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.map((m: { error?: { code: number }; id: unknown }) => m.error?.code ?? 'ok')).toEqual([-32600, -32600, 'ok']);
  });
  it('a scalar body → 400 with -32600', async () => {
    expect((await rpc('5')).status).toBe(400);
  });
});
