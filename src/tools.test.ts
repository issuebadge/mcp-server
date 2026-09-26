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
  it('lists the three remote tools in order with JSON schemas', () => {
    const list = listTools(remoteTools);
    expect(list.map(t => t.name)).toEqual(['validate_key', 'get_all_badges', 'issue_badge']);
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
    expect(r.content[0].text).toContain('"valid": true');
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
    expect(r.content[0].text).toBe('Unknown tool: nope');
  });

  it('wrong argument types throw InvalidParams', async () => {
    await expect(callTool(remoteTools, 'get_all_badges', { limit: '5' }, fakeClient())).rejects.toBeInstanceOf(InvalidParams);
    await expect(callTool(remoteTools, 'issue_badge', { badge_id: 'B1' }, fakeClient())).rejects.toBeInstanceOf(InvalidParams);
  });

  it('IssueBadgeError from the client becomes an isError result with the API message', async () => {
    const c = fakeClient({ listBadges: async () => { throw new IssueBadgeError('Unauthenticated.', 401); } } as Partial<IssueBadgeClient>);
    const r = await callTool(remoteTools, 'get_all_badges', {}, c);
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toBe('IssueBadge error: Unauthenticated.');
  });
});
