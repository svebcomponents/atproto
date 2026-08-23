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
<meta name="referrer" content="origin" />
<title>${escapeHtml(title)}</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: light-dark(#f4f6fb, #101319);
    --card: light-dark(#fff, #171b23);
    --ink: light-dark(#111a2b, #eef2fb);
    --muted: light-dark(#5c687f, #97a2b8);
    --line: light-dark(#dbe2ee, #2a323f);
    --accent: light-dark(#2563eb, #6d94ff);
    --accent-ink: #fff;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem 1rem;
    background: var(--bg);
    color: var(--ink);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    line-height: 1.55;
  }
  main { width: 100%; max-width: 26rem; }
  .card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 1.75rem;
    box-shadow: 0 1px 2px light-dark(rgb(17 26 43 / .05), rgb(0 0 0 / .4)),
                0 12px 32px -18px light-dark(rgb(17 26 43 / .35), rgb(0 0 0 / .8));
  }
  h1 { margin: 0 0 .5rem; font-size: 1.4rem; line-height: 1.25; letter-spacing: -.015em; }
  p { margin: 0 0 .9rem; }
  p.hint { color: var(--muted); font-size: .9rem; }
  p.hint:last-child { margin-bottom: 0; }
  .site {
    margin: 0 0 1.1rem;
    padding: .7rem .85rem;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--bg);
  }
  .site .label {
    display: block;
    font-size: .68rem;
    letter-spacing: .09em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: .15rem;
  }
  .site .origin {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: .92rem;
    word-break: break-all;
  }
  .grants { margin: 0 0 1.2rem; padding-left: 1.1rem; font-size: .9rem; color: var(--muted); }
  .grants li { margin-bottom: .3rem; }
  .grants li:last-child { margin-bottom: 0; }
  label { display: block; font-size: .9rem; font-weight: 600; margin-bottom: .35rem; }
  input, button {
    font: inherit;
    width: 100%;
    padding: .6rem .8rem;
    border-radius: 9px;
    border: 1px solid var(--line);
    background: var(--card);
    color: inherit;
  }
  input:focus-visible, button:focus-visible, a:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  button {
    margin-top: .9rem;
    background: var(--accent);
    color: var(--accent-ink);
    border: none;
    font-weight: 600;
    cursor: pointer;
  }
  button:hover { filter: brightness(1.07); }
  .error {
    margin: 0 0 .9rem;
    padding: .6rem .8rem;
    border-radius: 9px;
    font-size: .9rem;
    color: light-dark(#8c1d1d, #f5a3a3);
    background: light-dark(#fdecec, #2a1618);
    border: 1px solid light-dark(#f3c9c9, #4a2426);
  }
  footer { margin-top: 1rem; text-align: center; font-size: .82rem; color: var(--muted); }
  a { color: var(--accent); }
</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>`;

/**
 * Handle-input form shown when the popup opens without a handle.
 *
 * This is the screen where someone decides to hand over authority, so the
 * copy has to describe the authorization they are actually about to grant,
 * not the narrower thing this service chooses to do with it. ATProto's OAuth
 * scopes are collection + action — there is no way to ask for "replies to
 * this thread only" — so the grant covers creating posts, likes and reposts
 * in their repo generally. That the bridge only ever writes replies is its
 * own restraint, enforced in replyValidation, and not something the
 * authorization itself limits. Overstating the narrowness here would be
 * misleading at the one moment it matters.
 */
export const signInPage = ({
  clientName,
  actionUrl,
  origin,
  claim,
  returnTo,
  privacyUrl,
  error,
}: {
  clientName: string;
  actionUrl: string;
  origin: string;
  /** claim nonce the opener polls with — must survive the form submission */
  claim?: string;
  /** no-JS redirect flow: page to bounce back to after sign-in — must survive the form submission */
  returnTo?: string;
  /** the operator's privacy policy, linked from the footer when configured */
  privacyUrl?: string;
  error?: string;
}): string =>
  page(
    `Sign in — ${clientName}`,
    `<div class="card">
<h1>Sign in to comment</h1>
<p class="hint">You will be sent to your own account provider to approve this. Your password is never seen by ${escapeHtml(clientName)}.</p>
<div class="site">
  <span class="label">Comment section on</span>
  <span class="origin">${escapeHtml(origin)}</span>
</div>
<p class="hint" style="margin-bottom:.4rem">Approving lets ${escapeHtml(clientName)}:</p>
<ul class="grants">
  <li>create posts, likes and reposts in your repository, as you</li>
  <li>keep doing so on any site using this service, until you sign out</li>
</ul>
<p class="hint">This service only ever posts replies to the thread you are reading, but the permission your provider grants is broader than that — it will show you the exact scopes before you approve.</p>
${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
<form method="get" action="${escapeHtml(actionUrl)}">
  <input type="hidden" name="origin" value="${escapeHtml(origin)}" />
  ${claim ? `<input type="hidden" name="claim" value="${escapeHtml(claim)}" />` : ""}
  ${returnTo ? `<input type="hidden" name="return" value="${escapeHtml(returnTo)}" />` : ""}
  <label for="handle">Your handle</label>
  <input id="handle" name="handle" placeholder="you.bsky.social" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required autofocus />
  <button type="submit">Continue</button>
</form>
</div>
${privacyUrl ? `<footer><a href="${escapeHtml(privacyUrl)}">What this service stores</a></footer>` : ""}`,
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
    `<div class="card">
<h1>✓ Signed in</h1>
<p class="hint">This window should close by itself. If it doesn't, close it and return to the page you were on — it picks up your session automatically.</p>
</div>
<script>
  (function () {
    var data = ${json};
    // Fast path for same-origin popups. OAuth providers set COOP, which often
    // severs window.opener, so the opener also polls for the session by nonce
    // — this is best-effort only.
    try {
      if (window.opener) {
        window.opener.postMessage(data, ${JSON.stringify(origin).replaceAll("<", "\\u003C")});
      }
    } catch (e) {}
    // Close this window unconditionally — NOT gated on window.opener: the
    // COOP swap that severs the opener reference does not stop a
    // script-opened window from closing itself, and the session claim was
    // stored server-side before this page was served, so the opener recovers
    // it by polling whether or not this tab sticks around. Brief delay so
    // the success state paints and any postMessage lands; the hint text
    // stays as the fallback where the browser refuses the close.
    setTimeout(function () {
      try {
        window.close();
      } catch (e) {}
    }, 500);
  })();
</script>`,
  );
};

export const errorPage = (message: string): string =>
  page(
    "Something went wrong",
    `<div class="card"><h1>Something went wrong</h1><p class="hint">${escapeHtml(message)}</p></div>`,
  );

/** shown after a no-JS form submission succeeds with no return url to bounce back to */
export const successPage = (): string =>
  page(
    "Done",
    `<div class="card"><h1>✓ Done</h1><p class="hint">You can close this tab and return to the page you were on.</p></div>`,
  );
