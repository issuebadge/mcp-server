/**
 * Tool registry shared by the stdio host and the Cloudflare Worker.
 * Each tool has a hand-written JSON schema (what MCP clients see) and a zod schema (what we validate with).
 */
import { z, type ZodTypeAny } from 'zod';
import { IssueBadgeClient, IssueBadgeError, QR_TYPES, type QrType } from './issuebadge.js';

export type ContentBlock = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };

export interface ToolResult {
  [key: string]: unknown;
  content: ContentBlock[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Host hints (ChatGPT Apps SDK / MCP Apps: widget template, status text) — passed through tools/list as _meta. */
  meta?: Record<string, unknown>;
  /** MCP securitySchemes (mirrored into _meta for hosts that only read _meta). */
  securitySchemes?: { type: string; scopes?: string[] }[];
  /** MCP tool annotations (read-only / destructive / idempotent / open-world hints shown by hosts such as ChatGPT). */
  annotations?: Record<string, unknown>;
  /** JSON schema of structuredContent. */
  outputSchema?: Record<string, unknown>;
  schema: ZodTypeAny;
  run(client: IssueBadgeClient, args: unknown): Promise<Record<string, unknown>>;
}

export const CERTIFICATE_WIDGET_URI = 'ui://widget/certificate.html';

export class InvalidParams extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidParams';
  }
}

/**
 * Text (JSON) + structuredContent; when `value.image_base64` is a data URL the picture is also returned as an
 * MCP image block so hosts can show it, and the data URL is dropped from the text to keep it readable.
 */
export function toolResult(value: Record<string, unknown>): ToolResult {
  const m = typeof value.image_base64 === 'string' ? /^data:(image\/[a-z+]+);base64,([A-Za-z0-9+/=]+)$/.exec(value.image_base64) : null;
  const text = m ? { ...value, image_base64: '(returned as an image block)' } : value;
  const content: ContentBlock[] = [{ type: 'text', text: JSON.stringify(text, null, 2) }];
  if (m) content.push({ type: 'image', data: m[2], mimeType: m[1] });
  return { content, structuredContent: value };
}

export function toolError(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

const validateKey: ToolDef = {
  name: 'validate_key',
  description: 'Check that the configured IssueBadge API key is valid. Call this first if another tool reports an authentication problem.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  securitySchemes: [{ type: 'oauth2', scopes: ['read'] }],
  annotations: { title: 'Validate IssueBadge key', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  outputSchema: {
    type: 'object',
    properties: { valid: { type: 'boolean' }, message: { type: 'string' } },
    required: ['valid'],
  },
  meta: { 'openai/toolInvocation/invoking': 'Checking IssueBadge access…', 'openai/toolInvocation/invoked': 'Access checked' },
  schema: z.object({}).passthrough(),
  run: async (client) => client.validateKey(),
};

const getAllBadges: ToolDef = {
  name: 'get_all_badges',
  description: 'List the badge / certificate templates available to this IssueBadge account. Use the returned id as badge_id when issuing.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'integer', minimum: 1, description: 'Maximum number of badges to return (default: all).' },
    },
    additionalProperties: false,
  },
  securitySchemes: [{ type: 'oauth2', scopes: ['read'] }],
  annotations: { title: 'List badge templates', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  outputSchema: {
    type: 'object',
    properties: {
      badges: {
        type: 'array',
        items: {
          type: 'object',
          properties: { id: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, created_at: { type: 'string' } },
          required: ['id', 'name'],
        },
      },
    },
    required: ['badges'],
  },
  meta: { 'openai/toolInvocation/invoking': 'Loading badge templates…', 'openai/toolInvocation/invoked': 'Templates loaded' },
  schema: z.object({ limit: z.number().int().positive().optional() }),
  run: async (client, args) => {
    const { limit } = args as { limit?: number };
    return { badges: await client.listBadges(limit) };
  },
};

const issueBadge: ToolDef = {
  name: 'issue_badge',
  description:
    'Issue a certificate or badge to one recipient. IssueBadge emails the certificate to the recipient and returns a public verification URL. Each call with a new idempotency_key issues a new certificate; a reused key is rejected by the API, so do not retry a failed call with the same key without checking whether it already issued.',
  inputSchema: {
    type: 'object',
    properties: {
      badge_id: { type: 'string', description: 'Badge template id from get_all_badges.' },
      name: { type: 'string', description: 'Recipient full name as it should appear on the certificate.' },
      email: { type: 'string', format: 'email', description: 'Recipient email address (the certificate is sent here).' },
      phone: { type: 'string', description: 'Recipient phone number (optional).' },
      idempotency_key: { type: 'string', description: 'Unique key for this issuance (must not be reused). Generated as mcp-<uuid> if omitted.' },
      metadata: { type: 'object', description: 'Custom field values for the badge template (key → value).', additionalProperties: true },
    },
    required: ['badge_id', 'name'],
    additionalProperties: false,
  },
  securitySchemes: [{ type: 'oauth2', scopes: ['write'] }],
  annotations: { title: 'Issue certificate', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  outputSchema: {
    type: 'object',
    properties: {
      issue_id: { type: 'string', description: 'Certificate id.' },
      certificate_url: { type: 'string', description: 'Public verification URL.' },
      idempotency_key: { type: 'string' },
      badge_id: { type: 'string' },
      name: { type: 'string' },
      email: { type: 'string' },
    },
    required: ['issue_id', 'certificate_url', 'idempotency_key', 'badge_id', 'name'],
  },
  meta: {
    ui: { resourceUri: CERTIFICATE_WIDGET_URI },
    'openai/outputTemplate': CERTIFICATE_WIDGET_URI,
    'openai/toolInvocation/invoking': 'Issuing certificate…',
    'openai/toolInvocation/invoked': 'Certificate issued',
  },
  schema: z.object({
    badge_id: z.string().min(1),
    name: z.string().min(1),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    idempotency_key: z.string().min(1).optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
  run: async (client, args) => {
    const input = args as Parameters<IssueBadgeClient['issueBadge']>[0];
    const result = await client.issueBadge(input);
    // Echo the recipient so a host widget can render the card without a second call.
    return { ...result, badge_id: input.badge_id, name: input.name, ...(input.email ? { email: input.email } : {}) };
  },
};

// ---- Dynamic QR codes ----

const QR_DATA_HELP =
  'Payload for the chosen type. url/facebook/youtube: {url}. text: {text}. email: {to, subject?, body?}. phone: {phone}. ' +
  'sms: {phone, message?}. wifi: {ssid, password?, security? (WPA|WEP|nopass)}. vcard: {name, organization?, phone?, email?, website?, address?}. ' +
  'mecard: {name, phone?, email?, memo?}. maps: {latitude, longitude, name?}. event: {title, start (date), end?, location?, description?}. ' +
  'paypal: {paypal_id, amount?, currency? (3 letters)}. twitter: {username}. Links must start with http:// or https://.';

const qrCodeOutput = {
  type: 'object',
  properties: {
    code: { type: 'string', description: 'QR code id, e.g. btools_qrcode_ab12cd34ef. Use it with the other qr tools.' },
    name: { type: 'string' },
    type: { type: 'string' },
    data: { type: 'object', additionalProperties: true },
    is_active: { type: 'boolean' },
    scan_count: { type: 'integer' },
    scan_url: { type: 'string', description: 'The URL encoded in the image; redirects to the current destination.' },
    image_url: { type: 'string', description: 'PNG/SVG endpoint (needs the API key): add ?size=100..2000&format=png|svg.' },
    image_base64: { type: 'string', description: 'data:image/png;base64 of the QR image (create and get only).' },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
  required: ['code', 'name', 'type', 'is_active', 'scan_url', 'image_url'],
};

const qrRead = { securitySchemes: [{ type: 'oauth2', scopes: ['read'] }] as { type: string; scopes?: string[] }[] };
const qrWrite = { securitySchemes: [{ type: 'oauth2', scopes: ['write'] }] as { type: string; scopes?: string[] }[] };
const dataSchema = z.record(z.unknown());

const createQrCode: ToolDef = {
  name: 'create_qr_code',
  description:
    'Create a dynamic QR code in IssueBadge. The image encodes a short IssueBadge redirect link, so the destination (data) can be changed later with update_qr_code without reprinting. Returns the QR image (PNG) plus its scan_url.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Internal label, e.g. "Spring workshop sign-in".' },
      type: { type: 'string', enum: [...QR_TYPES], description: 'What the code opens when scanned.' },
      data: { type: 'object', additionalProperties: true, description: QR_DATA_HELP },
      is_active: { type: 'boolean', description: 'Inactive codes show a disabled page when scanned. Default true.' },
    },
    required: ['name', 'type', 'data'],
    additionalProperties: false,
  },
  ...qrWrite,
  annotations: { title: 'Create QR code', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  outputSchema: qrCodeOutput,
  meta: { 'openai/toolInvocation/invoking': 'Creating QR code…', 'openai/toolInvocation/invoked': 'QR code created' },
  schema: z.object({
    name: z.string().min(1).max(255),
    type: z.enum(QR_TYPES),
    data: dataSchema,
    is_active: z.boolean().optional(),
  }),
  run: async (client, args) => client.createQrCode(args as { name: string; type: QrType; data: Record<string, unknown>; is_active?: boolean }),
};

const listQrCodes: ToolDef = {
  name: 'list_qr_codes',
  description: 'List the dynamic QR codes in this IssueBadge account (newest first) with their scan counts and destinations.',
  inputSchema: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: [...QR_TYPES], description: 'Only codes of this type.' },
      limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Maximum number to return (default 20).' },
    },
    additionalProperties: false,
  },
  ...qrRead,
  annotations: { title: 'List QR codes', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  outputSchema: {
    type: 'object',
    properties: { qr_codes: { type: 'array', items: qrCodeOutput }, total: { type: 'integer' } },
    required: ['qr_codes', 'total'],
  },
  meta: { 'openai/toolInvocation/invoking': 'Loading QR codes…', 'openai/toolInvocation/invoked': 'QR codes loaded' },
  schema: z.object({ type: z.enum(QR_TYPES).optional(), limit: z.number().int().min(1).max(100).optional() }),
  run: async (client, args) => client.listQrCodes(args as { type?: string; limit?: number }),
};

const getQrCode: ToolDef = {
  name: 'get_qr_code',
  description: 'Get one dynamic QR code by its code id, including the PNG image and current destination.',
  inputSchema: {
    type: 'object',
    properties: { code: { type: 'string', description: 'QR code id from create_qr_code or list_qr_codes.' } },
    required: ['code'],
    additionalProperties: false,
  },
  ...qrRead,
  annotations: { title: 'Get QR code', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  outputSchema: qrCodeOutput,
  meta: { 'openai/toolInvocation/invoking': 'Loading QR code…', 'openai/toolInvocation/invoked': 'QR code loaded' },
  schema: z.object({ code: z.string().min(1) }),
  run: async (client, args) => client.getQrCode((args as { code: string }).code),
};

const updateQrCode: ToolDef = {
  name: 'update_qr_code',
  description:
    'Change where a dynamic QR code points (data), rename it, or activate/deactivate it. Printed codes keep working because the image encodes the redirect link. The type cannot change.',
  inputSchema: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'QR code id.' },
      name: { type: 'string' },
      data: { type: 'object', additionalProperties: true, description: 'New payload for the code\'s existing type. ' + QR_DATA_HELP },
      is_active: { type: 'boolean' },
    },
    required: ['code'],
    additionalProperties: false,
  },
  ...qrWrite,
  annotations: { title: 'Update QR code', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  outputSchema: qrCodeOutput,
  meta: { 'openai/toolInvocation/invoking': 'Updating QR code…', 'openai/toolInvocation/invoked': 'QR code updated' },
  schema: z
    .object({ code: z.string().min(1), name: z.string().min(1).max(255).optional(), data: dataSchema.optional(), is_active: z.boolean().optional() })
    .refine((v) => v.name !== undefined || v.data !== undefined || v.is_active !== undefined, { message: 'Provide name, data or is_active' }),
  run: async (client, args) => {
    const { code, ...rest } = args as { code: string; name?: string; data?: Record<string, unknown>; is_active?: boolean };
    return client.updateQrCode(code, rest);
  },
};

const getQrCodeScans: ToolDef = {
  name: 'get_qr_code_scans',
  description: 'Scan analytics for a dynamic QR code: total scan count and the most recent scans (time and referer). No scanner IP addresses or user agents are returned.',
  inputSchema: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'QR code id.' },
      limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Number of recent scans to return (default 50).' },
    },
    required: ['code'],
    additionalProperties: false,
  },
  ...qrRead,
  annotations: { title: 'QR code scans', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  outputSchema: {
    type: 'object',
    properties: {
      code: { type: 'string' },
      scan_count: { type: 'integer' },
      total: { type: 'integer' },
      scans: {
        type: 'array',
        items: { type: 'object', properties: { scanned_at: { type: 'string' }, referer: { type: 'string' } } },
      },
    },
    required: ['code', 'scan_count', 'scans'],
  },
  meta: { 'openai/toolInvocation/invoking': 'Loading scans…', 'openai/toolInvocation/invoked': 'Scans loaded' },
  schema: z.object({ code: z.string().min(1), limit: z.number().int().min(1).max(200).optional() }),
  run: async (client, args) => {
    const { code, limit } = args as { code: string; limit?: number };
    return client.listQrScans(code, limit);
  },
};

const deleteQrCode: ToolDef = {
  name: 'delete_qr_code',
  description: 'Permanently delete a dynamic QR code. Printed copies stop working. Confirm with the user first.',
  inputSchema: {
    type: 'object',
    properties: { code: { type: 'string', description: 'QR code id.' } },
    required: ['code'],
    additionalProperties: false,
  },
  ...qrWrite,
  annotations: { title: 'Delete QR code', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  outputSchema: { type: 'object', properties: { deleted: { type: 'boolean' }, code: { type: 'string' } }, required: ['deleted', 'code'] },
  meta: { 'openai/toolInvocation/invoking': 'Deleting QR code…', 'openai/toolInvocation/invoked': 'QR code deleted' },
  schema: z.object({ code: z.string().min(1) }),
  run: async (client, args) => client.deleteQrCode((args as { code: string }).code),
};

export const remoteTools: ToolDef[] = [validateKey, getAllBadges, issueBadge, createQrCode, listQrCodes, getQrCode, updateQrCode, getQrCodeScans, deleteQrCode];

export function listTools(tools: ToolDef[]): Record<string, unknown>[] {
  return tools.map(({ name, description, inputSchema, meta, securitySchemes, annotations, outputSchema }) => ({
    name,
    description,
    inputSchema,
    ...(annotations ? { annotations } : {}),
    ...(outputSchema ? { outputSchema } : {}),
    ...(securitySchemes ? { securitySchemes } : {}),
    ...(meta || securitySchemes ? { _meta: { ...(securitySchemes ? { securitySchemes } : {}), ...(meta ?? {}) } } : {}),
  }));
}

export async function callTool(tools: ToolDef[], name: string, rawArgs: unknown, client: IssueBadgeClient): Promise<ToolResult> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return toolError(`Unknown tool: ${name}`);

  const parsed = tool.schema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw new InvalidParams(`Invalid arguments for ${name}: ${issues}`);
  }

  try {
    return toolResult(await tool.run(client, parsed.data));
  } catch (err) {
    if (err instanceof IssueBadgeError) return toolError(`IssueBadge error: ${err.message}`);
    throw err;
  }
}
