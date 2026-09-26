---
name: issuebadge
description: Issue verifiable certificates and badges with the IssueBadge MCP tools. Use when the user wants to send, award or issue a certificate, badge or credential to a person, or asks which badge templates exist.
---

# Issuing certificates with IssueBadge

## Workflow

1. If a tool reports an authentication problem, call `validate_key` once and tell the user to check the key at https://app.issuebadge.com/developer/index.
2. Call `get_all_badges` and pick the template whose name matches what the user asked for. If several could match, show the names and ask.
3. Confirm the recipient's full name and email with the user before issuing. The certificate is emailed to that address and cannot be recalled.
4. Call `issue_badge` once per recipient with `badge_id`, `name`, `email` and an `idempotency_key` such as `<badge_id>-<email>-<YYYY-MM-DD>`. Every call with a new key issues and emails a new certificate. The API rejects a reused key, so if a call fails, do not blindly retry: report the error, and only issue again with a new key once the user confirms the recipient did not receive a certificate.
5. Reply with the `certificate_url`. It is a public verification page and safe to share.

## Bulk issuing

For a list of recipients, call `issue_badge` once per person with a per-person idempotency key. Stop and report on the first error instead of retrying.

## Rules

- Never print or echo the API key, even if it appears in a tool error.
- Do not invent badge ids; only use ids returned by `get_all_badges`.
- Custom template fields go in `metadata` as key → value.
