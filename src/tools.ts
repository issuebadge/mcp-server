/**
 * Tool registry shared by the stdio host and the Cloudflare Worker.
 * Each tool has a hand-written JSON schema (what MCP clients see) and a zod schema (what we validate with).
 */
import { z, type ZodTypeAny } from 'zod';
import { IssueBadgeClient, IssueBadgeError } from './issuebadge.js';

export interface ToolResult {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
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

export function toolResult(value: Record<string, unknown>): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], structuredContent: value };
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
  annotations: { title: 'Issue certificate', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
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

export const remoteTools: ToolDef[] = [validateKey, getAllBadges, issueBadge];

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
