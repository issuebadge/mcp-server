/**
 * IssueBadge MCP — Cloudflare Worker (remote, stateless Streamable HTTP).
 *
 *   POST /mcp   JSON-RPC 2.0 (initialize, ping, tools/list, tools/call, resources/list, resources/read).
 *               resources serve the ChatGPT / MCP Apps certificate widget (ui://widget/certificate.html).
 *               Auth: Authorization: Bearer <IssueBadge API key | OAuth access token>.
 *   GET  /.well-known/oauth-protected-resource[/mcp]   RFC 9728 metadata → OAuth clients (ChatGPT, Claude) discover
 *               the IssueBadge authorization server; a 401 points here via WWW-Authenticate.
 *   GET  /.well-known/openai-apps-challenge   domain-verification token for the ChatGPT plugin directory (OPENAI_APPS_CHALLENGE var)
 *   GET  /health
 *   GET  /       → docs
 *
 * The bearer is forwarded to app.issuebadge.com per request and never stored or logged.
 */
import { IssueBadgeClient } from '../src/issuebadge.js';
import { callTool, InvalidParams, listTools, remoteTools } from '../src/tools.js';
import { CERTIFICATE_WIDGET_HTML, CERTIFICATE_WIDGET_URI, WIDGET_MIME } from './widget.js';

const VERSION = '2.1.0'; // not exported: workerd only allows handler/function exports from the entry module
const DOCS_URL = 'https://issuebadge.com/h/docs';
const KEY_URL = 'https://app.issuebadge.com/developer/index';
const DEFAULT_AUTH_SERVER = 'https://app.issuebadge.com';
const SCOPES = ['read', 'write'];

interface Env { AUTH_SERVER?: string; OPENAI_APPS_CHALLENGE?: string }
const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

type RpcId = string | number | null;
interface RpcMessage { jsonrpc?: string; id?: RpcId; method?: string; params?: Record<string, unknown> }

const JSON_HEADERS = { 'content-type': 'application/json' };
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
const rpcError = (id: RpcId, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });

function bearerKey(request: Request): string | null {
  const value = request.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(value.trim());
  const key = m ? m[1].trim() : '';
  return key ? key : null;
}

/** The certificate card ChatGPT renders after issue_badge (MCP Apps resource; openai/* keys are ChatGPT aliases). */
function widgetResource() {
  return {
    uri: CERTIFICATE_WIDGET_URI,
    name: 'Certificate card',
    description: 'Shows the issued certificate with its verification link.',
    mimeType: WIDGET_MIME,
    _meta: {
      ui: { prefersBorder: true },
      'openai/widgetDescription': 'Shows the issued certificate: recipient, certificate ID and a link to verify it.',
      'openai/widgetPrefersBorder': true,
      'openai/widgetCSP': { connect_domains: [], resource_domains: [] },
    },
  };
}

/** Handle one JSON-RPC message. Returns null for notifications (no id). */
export async function handleRpc(msg: RpcMessage, client: IssueBadgeClient): Promise<object | null> {
  if (msg.id === undefined) return null;
  const id = msg.id;
  const params = msg.params ?? {};

  switch (msg.method) {
    case 'initialize': {
      const requested = String(params.protocolVersion ?? '');
      return {
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: SUPPORTED_PROTOCOLS.includes(requested) ? requested : SUPPORTED_PROTOCOLS[0],
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: 'issuebadge', version: VERSION },
          instructions: 'Call get_all_badges to find a badge_id, then issue_badge with the recipient name and email. Certificates are emailed to the recipient and the returned certificate_url is public.',
        },
      };
    }
    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };
    case 'tools/list':
      return { jsonrpc: '2.0', id, result: { tools: listTools(remoteTools) } };
    case 'resources/list':
      return { jsonrpc: '2.0', id, result: { resources: [widgetResource()] } };
    case 'resources/templates/list':
      return { jsonrpc: '2.0', id, result: { resourceTemplates: [] } };
    case 'resources/read': {
      if (params.uri !== CERTIFICATE_WIDGET_URI) return rpcError(id, -32002, `Resource not found: ${String(params.uri ?? '')}`);
      return { jsonrpc: '2.0', id, result: { contents: [{ ...widgetResource(), text: CERTIFICATE_WIDGET_HTML }] } };
    }
    case 'tools/call': {
      try {
        const result = await callTool(remoteTools, String(params.name ?? ''), params.arguments ?? {}, client);
        return { jsonrpc: '2.0', id, result };
      } catch (err) {
        if (err instanceof InvalidParams) return rpcError(id, -32602, err.message);
        return rpcError(id, -32603, 'Internal error');
      }
    }
    default:
      return rpcError(id, -32601, `Method not found: ${msg.method ?? ''}`);
  }
}

/** RFC 9728 protected-resource metadata: tells OAuth-capable MCP clients which authorization server guards /mcp. */
export function protectedResourceMetadata(origin: string, authServer: string): Record<string, unknown> {
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [authServer],
    bearer_methods_supported: ['header'],
    scopes_supported: SCOPES,
    resource_name: 'IssueBadge MCP server',
    resource_documentation: 'https://issuebadge.com/h/integration/mcp',
  };
}

async function handleMcp(request: Request, origin: string): Promise<Response> {
  if (request.method === 'DELETE') return new Response(null, { status: 204 });
  if (request.method !== 'POST') return json(rpcError(null, -32000, 'Method not allowed. POST JSON-RPC to /mcp.'), 405, { allow: 'POST, DELETE' });

  const key = bearerKey(request);
  if (!key) {
    return json(
      rpcError(null, -32001, `Missing credentials. Send "Authorization: Bearer <IssueBadge API key>" (create one at ${KEY_URL}) or sign in with OAuth.`),
      401,
      { 'www-authenticate': `Bearer realm="IssueBadge", resource_metadata="${origin}/.well-known/oauth-protected-resource", scope="${SCOPES.join(' ')}"` },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(rpcError(null, -32700, 'Parse error: body must be JSON-RPC 2.0'), 400);
  }

  const client = new IssueBadgeClient(key);
  const isMessage = (m: unknown): m is RpcMessage => typeof m === 'object' && m !== null && !Array.isArray(m);
  if (!Array.isArray(body) && !isMessage(body)) return json(rpcError(null, -32600, 'Invalid Request: expected a JSON-RPC object or array'), 400);

  const items: unknown[] = Array.isArray(body) ? body : [body];
  const responses = (
    await Promise.all(items.map((m) => (isMessage(m) ? handleRpc(m, client) : rpcError(null, -32600, 'Invalid Request'))))
  ).filter((r): r is object => r !== null);

  if (responses.length === 0) return new Response(null, { status: 202 });
  return json(Array.isArray(body) ? responses : responses[0]);
}

export default {
  async fetch(request: Request, env: Env = {}): Promise<Response> {
    const { pathname, origin } = new URL(request.url);
    if (pathname === '/mcp') return handleMcp(request, origin);
    if (pathname === '/.well-known/oauth-protected-resource' || pathname === '/.well-known/oauth-protected-resource/mcp') {
      return json(protectedResourceMetadata(origin, env.AUTH_SERVER || DEFAULT_AUTH_SERVER), 200, { 'cache-control': 'public, max-age=3600' });
    }
    if (pathname === '/.well-known/openai-apps-challenge') {
      const token = env.OPENAI_APPS_CHALLENGE?.trim();
      return token ? new Response(token, { headers: { 'content-type': 'text/plain' } }) : json({ error: 'Not found' }, 404);
    }
    if (pathname === '/health') return json({ ok: true, name: 'issuebadge-mcp', version: VERSION });
    if (pathname === '/') return Response.redirect(DOCS_URL, 302);
    return json({ error: 'Not found' }, 404);
  },
};
