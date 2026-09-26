import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBadgeTool } from './createBadge.js';
import { IssueBadgeClient } from './issuebadge.js';

describe('create_badge (stdio only)', () => {
  const base = { name: 'Course Cert', description: 'd', issuing_organization_name: 'Acme', idempotency_key: 'k1' };

  it('posts JSON when no logo path is given', async () => {
    let seen: { path: string; body: unknown } | undefined;
    const client = { postJson: async (path: string, body: unknown) => { seen = { path, body }; return { success: true, badge_id: 'NEW' }; } } as unknown as IssueBadgeClient;
    const out = await createBadgeTool.run(client, createBadgeTool.schema.parse({ ...base, custom_fields: [{ name: 'Score' }] }));
    expect(seen?.path).toBe('/badge/create');
    expect(seen?.body).toMatchObject({ ...base, custom_fields: [{ name: 'Score', type: 'text', required: false }] });
    expect(out).toEqual({ success: true, badge_id: 'NEW' });
  });

  it('posts multipart with the logo file when badge_logo_path is given', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ib-'));
    const logo = join(dir, 'logo.png');
    writeFileSync(logo, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    let seen: FormData | undefined;
    const client = { postForm: async (_p: string, fd: FormData) => { seen = fd; return { success: true }; } } as unknown as IssueBadgeClient;
    await createBadgeTool.run(client, createBadgeTool.schema.parse({ ...base, badge_logo_path: logo, custom_fields: [{ name: 'X' }] }));
    expect(seen?.get('name')).toBe('Course Cert');
    expect(seen?.get('custom_fields')).toBe(JSON.stringify([{ name: 'X', type: 'text', required: false }]));
    const file = seen?.get('badge_logo') as File;
    expect(file.name).toBe('logo.png');
    expect(file.size).toBe(4);
  });

  it('reports a readable error when the logo path does not exist', async () => {
    const client = {} as IssueBadgeClient;
    await expect(createBadgeTool.run(client, createBadgeTool.schema.parse({ ...base, badge_logo_path: '/nope/missing.png' })))
      .rejects.toThrow(/Failed to read badge logo file/);
  });
});
