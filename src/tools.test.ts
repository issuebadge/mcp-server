import { describe, it, expect } from 'vitest';
import { remoteTools, listTools, callTool, InvalidParams, type ToolResult } from './tools.js';
import { IssueBadgeClient, IssueBadgeError } from './issuebadge.js';

function fakeClient(overrides: Partial<IssueBadgeClient> = {}): IssueBadgeClient {
  return {
    validateKey: async () => ({ valid: true, message: 'ok' }),
    listBadges: async () => [{ id: 'B1', name: 'Completion' }],
    issueBadge: async (input: { badge_id: string; name: string }) => ({
      issue_id: 'I1', certificate_url: 'https://app.issuebadge.com/v/I1', idempotency_key: 'mcp-x',
    }),
    ...overrides,
  } as unknown as IssueBadgeClient;
}

describe('tool registry', () => {
  it('lists the remote tools in order with JSON schemas', () => {
    const list = listTools(remoteTools);
    expect(list.map(t => t.name)).toEqual([
      'validate_key', 'get_all_badges', 'issue_badge',
      'create_qr_code', 'list_qr_codes', 'get_qr_code', 'update_qr_code', 'get_qr_code_scans', 'delete_qr_code',
    ]);
    for (const t of list) {
      expect(t.description.length).toBeGreaterThan(10);
      expect(t.inputSchema).toMatchObject({ type: 'object' });
    }
    expect((listTools(remoteTools)[2].inputSchema as { required: string[] }).required).toEqual(['badge_id', 'name']);
  });

  it('validate_key returns the client verdict', async () => {
    const r = await callTool(remoteTools, 'validate_key', {}, fakeClient());
    expect(r.isError).toBeUndefined();
    expect(r.structuredContent).toEqual({ valid: true, message: 'ok' });
    expect((r.content[0] as { text: string }).text).toContain('"valid": true');
  });

  it('get_all_badges returns the badges as structured content', async () => {
    const r = await callTool(remoteTools, 'get_all_badges', {}, fakeClient());
    expect(r.structuredContent).toEqual({ badges: [{ id: 'B1', name: 'Completion' }] });
  });

  it('get_all_badges passes limit through', async () => {
    let seen: number | undefined;
    const c = fakeClient({ listBadges: async (limit?: number) => { seen = limit; return []; } } as Partial<IssueBadgeClient>);
    await callTool(remoteTools, 'get_all_badges', { limit: 5 }, c);
    expect(seen).toBe(5);
  });

  it('issue_badge forwards the input and returns issue id + certificate url', async () => {
    let seen: unknown;
    const c = fakeClient({ issueBadge: async (input: unknown) => { seen = input; return { issue_id: 'I9', certificate_url: 'https://x/v/I9', idempotency_key: 'k' }; } } as Partial<IssueBadgeClient>);
    const r = await callTool(remoteTools, 'issue_badge', { badge_id: 'B1', name: 'Jane', email: 'j@x.io', idempotency_key: 'k', metadata: { a: 1 } }, c);
    expect(seen).toEqual({ badge_id: 'B1', name: 'Jane', email: 'j@x.io', idempotency_key: 'k', metadata: { a: 1 } });
    expect(r.structuredContent).toEqual({ issue_id: 'I9', certificate_url: 'https://x/v/I9', idempotency_key: 'k', badge_id: 'B1', name: 'Jane', email: 'j@x.io' });
  });

  it('unknown tool → isError result', async () => {
    const r: ToolResult = await callTool(remoteTools, 'nope', {}, fakeClient());
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toBe('Unknown tool: nope');
  });

  it('wrong argument types throw InvalidParams', async () => {
    await expect(callTool(remoteTools, 'get_all_badges', { limit: '5' }, fakeClient())).rejects.toBeInstanceOf(InvalidParams);
    await expect(callTool(remoteTools, 'issue_badge', { badge_id: 'B1' }, fakeClient())).rejects.toBeInstanceOf(InvalidParams);
  });

  it('IssueBadgeError from the client becomes an isError result with the API message', async () => {
    const c = fakeClient({ listBadges: async () => { throw new IssueBadgeError('Unauthenticated.', 401); } } as Partial<IssueBadgeClient>);
    const r = await callTool(remoteTools, 'get_all_badges', {}, c);
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toBe('IssueBadge error: Unauthenticated.');
  });
});

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const qr = { code: 'btools_qrcode_abc', name: 'Menu', type: 'url', data: { url: 'https://x.io' }, is_active: true, scan_count: 2, scan_url: 'https://app.issuebadge.com/q/btools_qrcode_abc', image_url: 'https://app.issuebadge.com/api/v1/qrcode/btools_qrcode_abc/image' };

describe('qr code tools', () => {
  it('create_qr_code validates type + data and returns the image as an MCP image block', async () => {
    let seen: unknown;
    const c = fakeClient({ createQrCode: async (input: unknown) => { seen = input; return { ...qr, image_base64: PNG }; } } as Partial<IssueBadgeClient>);
    const r = await callTool(remoteTools, 'create_qr_code', { name: 'Menu', type: 'url', data: { url: 'https://x.io' } }, c);
    expect(seen).toEqual({ name: 'Menu', type: 'url', data: { url: 'https://x.io' } });
    expect(r.structuredContent).toMatchObject({ code: 'btools_qrcode_abc', image_base64: PNG });
    expect(r.content[1]).toEqual({ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' });
    expect((r.content[0] as { text: string }).text).not.toContain('iVBORw0KGgo=');
    await expect(callTool(remoteTools, 'create_qr_code', { name: 'x', type: 'pdf', data: {} }, c)).rejects.toBeInstanceOf(InvalidParams);
    await expect(callTool(remoteTools, 'create_qr_code', { name: 'x', type: 'url' }, c)).rejects.toBeInstanceOf(InvalidParams);
  });

  it('list_qr_codes passes type + limit and returns the list', async () => {
    let seen: unknown;
    const c = fakeClient({ listQrCodes: async (opts: unknown) => { seen = opts; return { qr_codes: [qr], total: 1 }; } } as Partial<IssueBadgeClient>);
    const r = await callTool(remoteTools, 'list_qr_codes', { type: 'url', limit: 5 }, c);
    expect(seen).toEqual({ type: 'url', limit: 5 });
    expect(r.structuredContent).toEqual({ qr_codes: [qr], total: 1 });
    expect(r.content).toHaveLength(1);
  });

  it('get_qr_code, update_qr_code, get_qr_code_scans and delete_qr_code forward the code', async () => {
    const seen: string[] = [];
    const c = fakeClient({
      getQrCode: async (code: string) => { seen.push('get:' + code); return { ...qr, image_base64: PNG }; },
      updateQrCode: async (code: string, input: unknown) => { seen.push('update:' + code + ':' + JSON.stringify(input)); return { ...qr, is_active: false }; },
      listQrScans: async (code: string, limit?: number) => { seen.push('scans:' + code + ':' + limit); return { code, scan_count: 2, scans: [{ scanned_at: '2026-10-01T00:00:00Z' }], total: 1 }; },
      deleteQrCode: async (code: string) => { seen.push('delete:' + code); return { deleted: true as const, code }; },
    } as Partial<IssueBadgeClient>);
    expect((await callTool(remoteTools, 'get_qr_code', { code: 'btools_qrcode_abc' }, c)).content[1]).toMatchObject({ type: 'image' });
    expect((await callTool(remoteTools, 'update_qr_code', { code: 'btools_qrcode_abc', is_active: false }, c)).structuredContent).toMatchObject({ is_active: false });
    expect((await callTool(remoteTools, 'get_qr_code_scans', { code: 'btools_qrcode_abc', limit: 10 }, c)).structuredContent).toMatchObject({ scan_count: 2 });
    expect((await callTool(remoteTools, 'delete_qr_code', { code: 'btools_qrcode_abc' }, c)).structuredContent).toEqual({ deleted: true, code: 'btools_qrcode_abc' });
    expect(seen).toEqual(['get:btools_qrcode_abc', 'update:btools_qrcode_abc:{"is_active":false}', 'scans:btools_qrcode_abc:10', 'delete:btools_qrcode_abc']);
  });

  it('update_qr_code with nothing to change throws InvalidParams', async () => {
    await expect(callTool(remoteTools, 'update_qr_code', { code: 'btools_qrcode_abc' }, fakeClient())).rejects.toBeInstanceOf(InvalidParams);
  });

  it('qr tools carry read/write scopes and delete is marked destructive', () => {
    const list = listTools(remoteTools);
    const byName = (n: string) => list.find(t => t.name === n) as { securitySchemes: unknown; annotations: Record<string, unknown> };
    expect(byName('list_qr_codes').securitySchemes).toEqual([{ type: 'oauth2', scopes: ['read'] }]);
    expect(byName('create_qr_code').securitySchemes).toEqual([{ type: 'oauth2', scopes: ['write'] }]);
    expect(byName('delete_qr_code').annotations).toMatchObject({ destructiveHint: true });
    expect(byName('get_qr_code').annotations).toMatchObject({ readOnlyHint: true });
  });
});
