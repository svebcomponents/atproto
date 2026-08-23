const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/**
 * The svebcomponents mark, inlined so the page stays self-contained. A
 * self-hosted bridge serves these pages from its own origin, where a
 * `/svebcomponents.svg` would 404 — and a sign-in screen should not depend on
 * a second request to render its own branding.
 */
const BRAND_MARK = `<svg xmlns="http://www.w3.org/2000/svg" width="737" height="794" fill="none" viewBox="0 0 737 794"><path fill="#c7e23b" d="M338.543 586.969c-25.73 16.373-59.955 9.555-76.294-15.199a54.295 54.295 0 0 1-8.423-21.633 197.5 197.5 0 0 1-31.495-4.64 194.8 194.8 0 0 1-39.39-13.662c-2.17 27.013 4.419 53.809 19.194 77.028q.58.91 1.175 1.812c37.435 56.715 115.109 72.809 173.148 35.875l47.436-30.187-37.915-59.581zM576.2 373.381q-.55-.895-1.113-1.78c-17.797-27.967-45.23-47.396-77.553-54.863-13.966-3.226-28.092-4.019-41.911-2.515 2.29 27.459 2.105 50.788-.626 71.799 8.599-2.343 17.696-2.541 26.642-.474 14.093 3.256 26.078 11.723 33.839 23.921q.261.41.517.827c15.504 25.285 7.184 59.177-18.545 75.55l-47.436 30.186 37.915 59.581 47.436-30.186c58.039-36.933 76.357-114.114 40.835-172.046"/><path fill="#000" d="M659.581 483.588c12.064-50.826 3.833-103.076-23.175-147.123a198.25 198.25 0 0 0-21.022-28.28 203 203 0 0 0 3.255-12.002c12.064-50.826 3.833-103.075-23.175-147.122a197 197 0 0 0-1.748-2.798l-.002-.002c-27.547-43.286-70.16-73.465-119.987-84.976-51.587-11.916-104.805-2.691-149.851 25.975q-.036.025-.073.048L163.72 189.18c-43.663 27.785-74.312 70.906-86.301 121.42-12.064 50.826-3.833 103.076 23.176 147.124q.862 1.407 1.76 2.817a197 197 0 0 0 18.039 24.068 200 200 0 0 0-4.145 16.069c-10.799 50.588-1.458 102.473 26.305 146.1.596.936 1.203 1.873 1.815 2.801 28.463 43.122 72.309 72.707 123.461 83.305 50.837 10.533 102.881 1.032 146.543-26.753l38.498-24.499 22.33-14.21 59.582-37.915 38.498-24.499c43.662-27.785 74.311-70.906 86.3-121.42M376.458 646.55c-58.039 36.934-135.713 20.84-173.148-35.875q-.596-.902-1.175-1.812c-14.775-23.219-21.364-50.015-19.194-77.028a194.8 194.8 0 0 0 39.39 13.662 197.5 197.5 0 0 0 31.495 4.64 54.3 54.3 0 0 0 8.423 21.633c16.339 24.754 50.564 31.572 76.294 15.199l47.436-30.187 37.915 59.581zm111.471-70.937-37.915-59.581 47.436-30.186c25.729-16.373 34.049-50.265 18.545-75.55q-.255-.416-.517-.827c-7.761-12.198-19.746-20.665-33.839-23.921-8.946-2.067-18.043-1.869-26.642.474 2.731-21.011 2.916-44.34.626-71.799 13.819-1.504 27.945-.711 41.911 2.515 32.323 7.467 59.756 26.896 77.553 54.863q.563.885 1.113 1.78c35.522 57.932 17.204 135.112-40.835 172.046zM201.635 248.761l39.053-24.852c-2.78 23.805-2.402 50.584 1.112 83.002l-2.25 1.431c-25.729 16.373-34.048 50.265-18.544 75.55q.272.446.551.885c7.526 11.827 19.069 19.983 32.564 23.1 14.39 3.325 29.388.655 42.229-7.517 11.564-7.359 25.956-16.517 16.63-92.676-8.85-72.268-3.936-127.277 48.811-160.843 28.944-18.419 63.052-24.366 96.039-16.746 31.742 7.333 58.753 26.504 76.304 54.083.38.597.753 1.194 1.124 1.799 14.326 23.364 19.883 49.857 17.621 75.579a197.4 197.4 0 0 0-39.448-13.628 199 199 0 0 0-31.09-4.632 52.76 52.76 0 0 0-7.759-21.158c-7.538-11.844-19.101-20.104-32.647-23.232-14.39-3.325-29.387-.655-42.228 7.516-11.564 7.359-25.955 16.517-16.629 92.678 8.849 72.266 3.935 127.274-48.812 160.841-28.945 18.419-63.053 24.366-96.04 16.746-31.732-7.33-58.747-26.495-76.29-54.061-.384-.604-.761-1.207-1.136-1.819-35.523-57.932-17.204-135.112 40.835-172.046"/><path fill="#2980c2" d="M161.936 422.626c17.543 27.566 44.558 46.731 76.29 54.061 32.987 7.62 67.095 1.673 96.04-16.746 52.747-33.566 57.661-88.574 48.812-160.841-9.326-76.161 5.065-85.319 16.628-92.678 12.842-8.171 27.839-10.841 42.229-7.516 13.546 3.128 25.109 11.388 32.647 23.232q.237.375.471.754a52.8 52.8 0 0 1 7.288 20.404 199 199 0 0 1 31.09 4.632 197.4 197.4 0 0 1 39.448 13.628c2.262-25.722-3.295-52.215-17.621-75.579-.371-.605-.744-1.202-1.124-1.799-17.551-27.579-44.562-46.75-76.304-54.083-32.987-7.62-67.095-1.673-96.039 16.746-52.746 33.566-57.661 88.575-48.811 160.843 9.326 76.159-5.066 85.317-16.63 92.676-12.841 8.172-27.839 10.842-42.229 7.517-13.495-3.117-25.038-11.273-32.564-23.1q-.28-.439-.551-.885c-15.504-25.285-7.185-59.177 18.544-75.55l2.25-1.431c-3.514-32.418-3.892-59.197-1.112-83.002l-39.053 24.852c-58.039 36.934-76.358 114.114-40.835 172.046.375.612.752 1.215 1.136 1.819"/></svg>`;

/**
 * Renders a `name/qualifier` product name with the qualifier muted, matching
 * the documentation site's header. A name with no slash renders plain.
 */
const wordmark = (name: string): string => {
  const slash = name.indexOf("/");
  if (slash === -1) return escapeHtml(name);
  return `${escapeHtml(name.slice(0, slash))}<span class="muted">${escapeHtml(name.slice(slash))}</span>`;
};

/**
 * Shared shell for the bridge's own pages, using the documentation site's
 * palette and type so the sign-in screen reads as part of the same project.
 * Inter is only named, never fetched: the docs site relies on the same system
 * fallbacks, and loading a webfont from a third party on a consent screen for
 * a privacy-preserving service would be a poor look.
 */
const page = ({
  title,
  body,
  brand,
  nav = [],
  wide = false,
}: {
  title: string;
  body: string;
  brand?: { name: string; url?: string };
  /** header links, laid out like the documentation site's nav */
  nav?: readonly { href: string; label: string }[];
  wide?: boolean;
}): string => `<!doctype html>
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
    --page: light-dark(#f2f5fb, #141b2b);
    --card: light-dark(#fff, #1b2436);
    --ink: light-dark(#111a2b, #eef2fb);
    --text: light-dark(#55637d, #b3bfd6);
    --meta: light-dark(#6d7c96, #8d9bb8);
    --line: light-dark(#d5deee, #28324a);
    --wash: light-dark(#e3ecfd, #202b42);
    --accent: light-dark(#2563eb, #8ab4ff);
    --accent-deep: light-dark(#1d4ed8, #a9c6ff);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2rem 1rem 3rem;
    background: var(--page);
    color: var(--ink);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system,
      BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-synthesis: none;
    line-height: 1.55;
  }
  .shell { width: 100%; max-width: 27rem; margin: auto; }
  /* Wide viewports get the documentation site's two-column split rather than
     a narrow column adrift in the middle: the explanation on the left, the
     action panel on the right, both visible at once instead of the grants
     scrolling away above the button. */
  /* Single column stays at a readable measure; the split below widens it
     only once there is room for two columns. */
  .shell.wide { max-width: 32rem; }
  .split { display: flex; flex-direction: column; gap: 1rem; }
  .intro > *:last-child { margin-bottom: 0; }
  @media (min-width: 58rem) {
    body { padding: 3rem 2rem; }
    .shell.wide { max-width: 60rem; }
    .split {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 26rem;
      gap: 2rem 4rem;
      align-items: start;
    }
    .shell.wide h1 { font-size: 2.9rem; }
    .intro { padding-top: .35rem; }
    .action { position: sticky; top: 3rem; }
  }
  .site-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding-bottom: 1rem;
    margin-bottom: 1.75rem;
    border-bottom: 1px solid var(--line);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: .5rem;
    font-size: .95rem;
    font-weight: 600;
    color: var(--ink);
    text-decoration: none;
  }
  .brand svg { width: 1.35rem; height: 1.45rem; flex: none; }
  .brand .muted { color: var(--meta); font-weight: 500; }
  .site-header nav { display: flex; align-items: center; gap: 1.25rem; margin-left: auto; }
  .site-header nav a {
    font-size: .86rem;
    font-weight: 600;
    color: var(--ink);
    text-decoration: none;
  }
  .site-header nav a:hover { color: var(--accent-deep); }
  .card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 1.75rem;
    box-shadow: 0 1px 2px light-dark(rgb(17 26 43 / .05), rgb(0 0 0 / .45)),
                0 18px 44px -26px light-dark(rgb(17 26 43 / .4), rgb(0 0 0 / .9));
  }
  h1 {
    margin: 0 0 .55rem;
    font-family: Georgia, "Times New Roman", serif;
    font-weight: 400;
    font-size: 2rem;
    line-height: 1.05;
    letter-spacing: -.04em;
  }
  p { margin: 0 0 .9rem; color: var(--text); }
  p.hint { font-size: .92rem; }
  p.hint:last-child { margin-bottom: 0; }
  .site {
    margin: 0 0 1.1rem;
    padding: .7rem .85rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--page);
  }
  .site .label {
    display: block;
    font-size: .68rem;
    letter-spacing: .09em;
    text-transform: uppercase;
    color: var(--meta);
    margin-bottom: .1rem;
  }
  .site .origin {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: .92rem;
    color: var(--ink);
    word-break: break-all;
  }
  label { display: block; font-size: .9rem; font-weight: 600; margin-bottom: .35rem; }
  input, button {
    font: inherit;
    width: 100%;
    padding: .62rem .8rem;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: var(--card);
    color: inherit;
  }
  input::placeholder { color: var(--meta); }
  input:focus-visible, button:focus-visible, a:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  button {
    margin-top: .9rem;
    background: var(--accent);
    color: light-dark(#fff, #141b2b);
    border: none;
    font-weight: 600;
    cursor: pointer;
  }
  button:hover { background: var(--accent-deep); }
  .error {
    margin: 0 0 .9rem;
    padding: .6rem .8rem;
    border-radius: 10px;
    font-size: .9rem;
    color: light-dark(#8c1d1d, #f5a3a3);
    background: light-dark(#fdecec, #2a1618);
    border: 1px solid light-dark(#f3c9c9, #4a2426);
  }
  .action { display: flex; flex-direction: column; }
  .promo {
    margin-top: 1.5rem;
    padding: .95rem 1.05rem;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--wash);
    font-size: .87rem;
    color: var(--text);
  }
  .promo p { margin: 0 0 .5rem; color: inherit; }
  .promo strong { color: var(--ink); }
  .promo a { color: var(--accent-deep); font-weight: 600; text-decoration: none; }
  .promo a:hover { text-decoration: underline; }
  a { color: var(--accent-deep); }
</style>
</head>
<body>
<div class="shell${wide ? " wide" : ""}">
${
  brand || nav.length > 0
    ? `<header class="site-header">${
        brand
          ? `<${brand.url ? `a class="brand" href="${escapeHtml(brand.url)}"` : `div class="brand"`}>${BRAND_MARK}<span>${wordmark(brand.name)}</span></${brand.url ? "a" : "div"}>`
          : ""
      }${
        nav.length > 0
          ? `<nav>${nav.map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`).join("")}</nav>`
          : ""
      }</header>`
    : ""
}
${body}
</div>
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
 *
 * The project pitch sits after the card, deliberately: someone reading this
 * page is midway through a security decision, and an advert has no business
 * competing with it for attention. Below the fold, visually distinct, no
 * button — it reads as a footer note, which is what it is.
 */
export const signInPage = ({
  clientName,
  actionUrl,
  origin,
  claim,
  returnTo,
  privacyUrl,
  productUrl,
  error,
}: {
  clientName: string;
  actionUrl: string;
  origin: string;
  /** claim nonce the opener polls with — must survive the form submission */
  claim?: string;
  /** no-JS redirect flow: page to bounce back to after sign-in — must survive the form submission */
  returnTo?: string;
  /** the operator's privacy policy, linked under the card when configured */
  privacyUrl?: string;
  /** the project's own site — enables the brand header and the footer pitch */
  productUrl?: string;
  error?: string;
}): string =>
  page({
    title: `Sign in to ${clientName}`,
    ...(productUrl ? { brand: { name: clientName, url: productUrl } } : {}),
    ...(privacyUrl ? { nav: [{ href: privacyUrl, label: "Privacy" }] } : {}),
    wide: true,
    body: `<div class="split">
<div class="intro">
<h1>Sign in to the ATmosphere to comment</h1>
<p class="hint">Your provider will show what you are approving. Your password is never sent here.</p>
</div>
<div class="action">
<div class="card">
<div class="site">
  <span class="label">Comment section on</span>
  <span class="origin">${escapeHtml(origin)}</span>
</div>
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
</div>
${
  productUrl
    ? `<div class="promo">
  <p><strong>Comments for your own site.</strong> Replies are stored in each commenter's own account, not here. Readers who do not sign in never contact the service.</p>
  <a href="${escapeHtml(productUrl)}">Documentation &rarr;</a>
</div>`
    : ""
}
</div>`,
  });

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
  return page({
    title: "Signed in",
    body: `<div class="card">
<h1>✓ Signed in</h1>
<p class="hint">This window should close by itself. If it does not, close it and return to the page you were on. It picks up your session automatically.</p>
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
  });
};

export const errorPage = (message: string): string =>
  page({
    title: "Something went wrong",
    body: `<div class="card"><h1>Something went wrong</h1><p class="hint">${escapeHtml(message)}</p></div>`,
  });

/** shown after a no-JS form submission succeeds with no return url to bounce back to */
export const successPage = (): string =>
  page({
    title: "Done",
    body: `<div class="card"><h1>✓ Done</h1><p class="hint">You can close this tab and return to the page you were on.</p></div>`,
  });
