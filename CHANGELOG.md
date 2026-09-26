# Changelog

## 2.1.0 — 2026-09-25

- OAuth 2.1 support for ChatGPT / Claude connectors: RFC 9728 protected-resource metadata, `WWW-Authenticate`
  with `resource_metadata` on 401, `AUTH_SERVER` var for self-hosters.
- ChatGPT Apps SDK / MCP Apps widget: `resources/list|read` serve `ui://widget/certificate.html`; `issue_badge`
  carries `openai/outputTemplate`, status text and `securitySchemes`; `issue_badge` output now echoes `badge_id`,
  `name`, `email`.
- `initialize` advertises `resources: {}`.

## 2.0.0 — 2026-09-23

- Remote server: stateless MCP Streamable HTTP endpoint on Cloudflare Workers (`https://issuebadge-mcp.issuebadge.workers.dev/mcp`), authenticated per request with `Authorization: Bearer <IssueBadge API key>`. Nothing is stored.
- Cursor Marketplace plugin (`.cursor-plugin/plugin.json` + `mcp.json`) and Claude Code plugin (`.claude-plugin/plugin.json` + `.mcp.json`), with an `issuebadge` skill.
- npm package `issuebadge-mcp-server` (stdio) published with provenance; `npx issuebadge-mcp-server`.
- Tools: `validate_key`, `get_all_badges`, `issue_badge` everywhere; `create_badge` in the stdio server only.
- Rewritten on `fetch` (no axios/dotenv/form-data), MCP SDK 1.x, 46 tests.

## 1.0.0 — 2025-07

- Initial stdio server: `validate_key`, `get_all_badges`, `issue_badge`, `create_badge`.
