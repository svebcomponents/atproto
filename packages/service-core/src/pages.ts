const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const page = (title: string, body: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 24rem; margin: 15vh auto; padding: 0 1rem; color: light-dark(#111, #eee); background: light-dark(#fff, #111); }
  input, button { font: inherit; padding: 0.5rem 0.75rem; border-radius: 8px; border: 1px solid light-dark(#ccc, #444); width: 100%; box-sizing: border-box; }
  button { background: #2864ff; color: #fff; border: none; margin-top: 0.75rem; cursor: pointer; }
  p.hint { color: light-dark(#666, #999); font-size: 0.875rem; }
</style>
</head>
<body>
${body}
</body>
</html>`;

/** handle-input form shown when the popup opens without a handle */
export const signInPage = ({
  clientName,
  actionUrl,
  origin,
  error,
}: {
  clientName: string;
  actionUrl: string;
  origin: string;
  error?: string;
}): string =>
  page(
    `Sign in — ${clientName}`,
    `<h1>Sign in with Bluesky</h1>
<p class="hint">${escapeHtml(clientName)} will send you to your account provider to approve posting replies on your behalf for <strong>${escapeHtml(origin)}</strong>.</p>
${error ? `<p class="hint" style="color:#c00">${escapeHtml(error)}</p>` : ""}
<form method="get" action="${escapeHtml(actionUrl)}">
  <input type="hidden" name="origin" value="${escapeHtml(origin)}" />
  <label for="handle">Your handle</label>
  <input id="handle" name="handle" placeholder="you.bsky.social" autocomplete="username" required autofocus />
  <button type="submit">Continue</button>
</form>`,
  );

/**
 * Callback landing page: posts the freshly minted session to the opener with
 * an exact targetOrigin (the origin the token is bound to), then closes.
 */
export const callbackPage = ({
  origin,
  payload,
}: {
  origin: string;
  payload: Record<string, unknown>;
}): string => {
  const json = JSON.stringify({
    type: "atproto-comments:session",
    ...payload,
  }).replaceAll("<", "\\u003C");
  return page(
    "Signed in",
    `<h1>✓ Signed in</h1>
<p class="hint">You can close this tab and return to the page you were on — it will pick up your session automatically.</p>
<script>
  (function () {
    var data = ${json};
    // Fast path for same-origin popups. OAuth providers set COOP, which often
    // severs window.opener, so the opener also polls for the session by nonce
    // — this is best-effort only.
    try {
      if (window.opener) {
        window.opener.postMessage(data, ${JSON.stringify(origin).replaceAll("<", "\\u003C")});
        window.close();
      }
    } catch (e) {}
  })();
</script>`,
  );
};

export const errorPage = (message: string): string =>
  page(
    "Something went wrong",
    `<h1>Something went wrong</h1><p class="hint">${escapeHtml(message)}</p>`,
  );
