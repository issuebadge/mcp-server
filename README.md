# IssueBadge MCP server

Issue verifiable certificates and badges from any AI agent. This [Model Context Protocol](https://modelcontextprotocol.io) server lets Cursor, Claude, VS Code and other MCP clients list your [IssueBadge](https://issuebadge.com) badge templates and send a certificate to a recipient by name and email.

Two ways to run it:

| | Remote (recommended) | Local (stdio) |
|---|---|---|
| Endpoint | `https://issuebadge-mcp.issuebadge.workers.dev/mcp` | `npx issuebadge-mcp-server` |
| Auth | `Authorization: Bearer <API key>` header | `ISSUEBADGE_API_KEY` env var |
| Tools | `validate_key`, `get_all_badges`, `issue_badge` | the same + `create_badge` |
| Storage | none, stateless | none |

You need an IssueBadge API key: **app.issuebadge.com → Developer → API key** (https://app.issuebadge.com/developer/index).

## Install

### Cursor

Install **IssueBadge** from the [Cursor Marketplace](https://cursor.com/marketplace) and paste your API key when prompted. Or add it by hand in *Settings → MCP*:

```json
{
  "mcpServers": {
    "issuebadge": {
      "type": "streamable-http",
      "url": "https://issuebadge-mcp.issuebadge.workers.dev/mcp",
      "headers": { "Authorization": "Bearer YOUR_ISSUEBADGE_API_KEY" }
    }
  }
}
```

### Claude Code

```bash
claude mcp add --transport http issuebadge https://issuebadge-mcp.issuebadge.workers.dev/mcp \
  --header "Authorization: Bearer YOUR_ISSUEBADGE_API_KEY"
```

This repo is also a Claude Code plugin (`.claude-plugin/plugin.json`) and ships an `issuebadge` skill that teaches the agent the list → confirm → issue workflow. The plugin's `.mcp.json` reads the key from the `ISSUEBADGE_API_KEY` environment variable, so export it before starting Claude Code.

### Claude Desktop / any stdio client

```json
{
  "mcpServers": {
    "issuebadge": {
      "command": "npx",
      "args": ["-y", "issuebadge-mcp-server"],
      "env": { "ISSUEBADGE_API_KEY": "YOUR_ISSUEBADGE_API_KEY" }
    }
  }
}
```

### VS Code (Copilot agent mode)

`.vscode/mcp.json`:

```json
{
  "servers": {
    "issuebadge": {
      "type": "http",
      "url": "https://issuebadge-mcp.issuebadge.workers.dev/mcp",
      "headers": { "Authorization": "Bearer YOUR_ISSUEBADGE_API_KEY" }
    }
  }
}
```

## Tools

| Tool | Input | Returns |
|---|---|---|
| `validate_key` | – | `{ valid, message }` |
| `get_all_badges` | `limit?` | `{ badges: [{ id, name, description?, created_at? }] }` |
| `issue_badge` | `badge_id`, `name`, `email?`, `phone?`, `idempotency_key?`, `metadata?` | `{ issue_id, certificate_url, idempotency_key }` |
| `create_badge` (stdio only) | `name`, `description`, `issuing_organization_name`, `idempotency_key`, optional `badge_logo_path`, `custom_fields`, … | IssueBadge API response |

`issue_badge` emails the certificate to the recipient and returns a public verification URL. Every call with a new `idempotency_key` issues a new certificate (one is generated as `mcp-<uuid>` if you omit it). The API rejects a reused key, so after a failed call check whether the certificate was issued before calling again with a new key.

Example prompt once installed: *"Issue the Course Completion certificate to Jane Doe, jane@example.com."*

## ChatGPT and OAuth

The remote server also speaks OAuth 2.1 for hosts that cannot send an API key (ChatGPT apps, Claude connectors): a
request without a bearer gets `401` + `WWW-Authenticate: Bearer resource_metadata=…`, `/.well-known/oauth-protected-resource`
points at `https://app.issuebadge.com` (PKCE S256, dynamic client registration), and the issued access token is forwarded
exactly like an API key. `issue_badge` carries a widget (`ui://widget/certificate.html`, MCP Apps / ChatGPT Apps SDK)
that renders the certificate card. See `CHATGPT.md`.

## Privacy and security

- The remote server is stateless. Your API key is read from the `Authorization` header of each request, forwarded to `app.issuebadge.com`, and never stored or logged. Requests without a key get `401`.
- The only host contacted is `app.issuebadge.com`. Recipient name, email and the badge id are sent there to create the certificate.
- Privacy policy: https://issuebadge.com/h/policy · Terms: https://issuebadge.com/h/terms · Support: https://issuebadge.com/h/contact

## Self-host the remote server

```bash
git clone https://github.com/issuebadge/mcp-server && cd mcp-server
npm install
npm test
npx wrangler deploy --config worker/wrangler.toml   # needs a Cloudflare account
```

`GET /health` returns `{ ok: true }`. Point `ISSUEBADGE_BASE_URL` at a different API host for the stdio server if you run IssueBadge elsewhere.

## Development

```bash
npm install
npm test          # vitest: client, tools, worker (mocked IssueBadge API)
npm run build     # tsc → dist/ (stdio bin)
npm run dev:worker
```

Layout: `src/issuebadge.ts` (API client), `src/tools.ts` (tool registry shared by both hosts), `src/stdio.ts` (npm bin), `src/createBadge.ts` (stdio-only tool), `worker/index.ts` (Cloudflare Worker), `.cursor-plugin/` + `mcp.json` (Cursor plugin), `.claude-plugin/` + `.mcp.json` (Claude Code plugin), `skills/issuebadge/SKILL.md`, `server.json` (MCP Registry).

## License

MIT
