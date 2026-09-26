/**
 * Certificate card rendered by ChatGPT (Apps SDK / MCP Apps) after issue_badge.
 * Served via resources/read as ui://widget/certificate.html. Reads the tool's structuredContent from
 * window.openai.toolOutput (ChatGPT) or the MCP Apps bridge (ui/notifications/tool-result), no network calls.
 */
export const CERTIFICATE_WIDGET_URI = 'ui://widget/certificate.html';
export const WIDGET_MIME = 'text/html;profile=mcp-app';

export const CERTIFICATE_WIDGET_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Certificate issued</title>
<style>
  :root { color-scheme: light dark; --fg: #111827; --muted: #6b7280; --bg: #ffffff; --line: #e5e7eb; --ok: #059669; --btn: #4f46e5; }
  @media (prefers-color-scheme: dark) { :root { --fg: #f9fafb; --muted: #9ca3af; --bg: #111827; --line: #374151; } }
  html[data-theme="dark"] { --fg: #f9fafb; --muted: #9ca3af; --bg: #111827; --line: #374151; }
  body { margin: 0; font: 14px/1.5 -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--fg); background: var(--bg); }
  .card { padding: 16px 18px; }
  .row { display: flex; align-items: center; gap: 12px; }
  .badge { width: 40px; height: 40px; border-radius: 10px; background: rgba(5,150,105,.12); color: var(--ok); display: flex; align-items: center; justify-content: center; flex: none; }
  h1 { font-size: 16px; margin: 0; }
  .muted { color: var(--muted); font-size: 13px; margin: 2px 0 0; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 14px 0; padding-top: 12px; border-top: 1px solid var(--line); }
  dt { color: var(--muted); } dd { margin: 0; word-break: break-all; }
  .actions { display: flex; gap: 10px; flex-wrap: wrap; }
  a.btn { display: inline-block; padding: 8px 14px; border-radius: 8px; background: var(--btn); color: #fff; text-decoration: none; font-weight: 500; }
  a.link { color: var(--btn); text-decoration: none; padding: 8px 0; }
  .empty { color: var(--muted); }
</style></head>
<body><div class="card" id="root"><p class="empty">Waiting for the certificate…</p></div>
<script>
(function () {
  var root = document.getElementById('root');
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function open(href) { var o = window.openai; if (o && typeof o.openExternal === 'function') { o.openExternal({ href: href }); return false; } return true; }
  window.__ibOpen = open;
  function render(out) {
    if (!out) return;
    if (out.error) { root.innerHTML = '<p class="empty">' + esc(out.error) + '</p>'; return; }
    var url = out.certificate_url || '';
    root.innerHTML =
      '<div class="row"><div class="badge"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></div>' +
      '<div><h1>Certificate issued</h1><p class="muted">' + (out.email ? 'Emailed to ' + esc(out.email) : 'Ready to share') + '</p></div></div>' +
      '<dl>' + (out.name ? '<dt>Recipient</dt><dd>' + esc(out.name) + '</dd>' : '') +
      '<dt>Certificate ID</dt><dd>' + esc(out.issue_id) + '</dd>' +
      (url ? '<dt>Verify</dt><dd><a class="link" href="' + esc(url) + '" target="_blank" rel="noopener" onclick="return window.__ibOpen(this.href)">' + esc(url) + '</a></dd>' : '') + '</dl>' +
      (url ? '<div class="actions"><a class="btn" href="' + esc(url) + '" target="_blank" rel="noopener" onclick="return window.__ibOpen(this.href)">View certificate</a></div>' : '');
  }
  function theme() { var o = window.openai; if (o && o.theme) document.documentElement.setAttribute('data-theme', o.theme); }
  theme();
  if (window.openai && window.openai.toolOutput) render(window.openai.toolOutput);
  window.addEventListener('openai:set_globals', function () { theme(); if (window.openai && window.openai.toolOutput) render(window.openai.toolOutput); });
  window.addEventListener('message', function (ev) {
    var m = ev && ev.data; if (!m || typeof m !== 'object') return;
    if (m.method === 'ui/notifications/tool-result' && m.params) render(m.params.structuredContent || null);
  });
})();
</script></body></html>`;
