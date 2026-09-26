/**
 * create_badge — stdio-only tool (needs a local file path for the logo, so it is not exposed by the remote server).
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { z } from 'zod';
import type { IssueBadgeClient } from './issuebadge.js';
import type { ToolDef } from './tools.js';

const customField = z.object({
  name: z.string().min(1),
  type: z.enum(['text', 'email', 'number', 'date']).default('text'),
  required: z.boolean().default(false),
});

const schema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  issuing_organization_name: z.string().min(1),
  idempotency_key: z.string().min(1),
  nickname: z.string().optional(),
  left_panel_description: z.string().optional(),
  organization_id: z.string().optional(),
  comment: z.string().optional(),
  expire_date: z.string().optional(),
  badge_logo_path: z.string().optional(),
  custom_fields: z.array(customField).optional(),
});

type CreateBadgeInput = z.infer<typeof schema>;

export const createBadgeTool: ToolDef = {
  name: 'create_badge',
  description: 'Create a new badge / certificate template in IssueBadge. Optional badge_logo_path is a local file (png, jpg, gif, svg, max 2MB). Available in the local (stdio) server only.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Badge name' },
      description: { type: 'string', description: 'Badge description' },
      issuing_organization_name: { type: 'string', description: 'Name of the issuing organization' },
      idempotency_key: { type: 'string', description: 'Unique key to prevent duplicate badge creation' },
      nickname: { type: 'string', description: 'Optional badge nickname' },
      left_panel_description: { type: 'string', description: 'Additional description for the left panel' },
      organization_id: { type: 'string', description: 'Existing organization id (optional)' },
      comment: { type: 'string', description: 'Additional comments' },
      expire_date: { type: 'string', description: 'Badge expiration date (YYYY-MM-DD)' },
      badge_logo_path: { type: 'string', description: 'Local path to the badge logo file' },
      custom_fields: {
        type: 'array',
        description: 'Custom fields for this badge',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string', enum: ['text', 'email', 'number', 'date'], default: 'text' },
            required: { type: 'boolean', default: false },
          },
          required: ['name'],
        },
      },
    },
    required: ['name', 'description', 'issuing_organization_name', 'idempotency_key'],
    additionalProperties: false,
  },
  schema,
  run: async (client: IssueBadgeClient, args: unknown) => {
    const { badge_logo_path, ...fields } = args as CreateBadgeInput;

    if (!badge_logo_path) {
      return client.postJson('/badge/create', fields);
    }

    let bytes: Buffer;
    try {
      bytes = readFileSync(badge_logo_path);
    } catch (err) {
      throw new Error(`Failed to read badge logo file: ${(err as Error).message}`);
    }

    const fd = new FormData();
    fd.append('badge_logo', new Blob([new Uint8Array(bytes)]), basename(badge_logo_path) || 'badge_logo.png');
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      fd.append(key, key === 'custom_fields' ? JSON.stringify(value) : String(value));
    }
    return client.postForm('/badge/create', fd);
  },
};
