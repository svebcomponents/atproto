<script lang="ts">
  import "@svebcomponents/atproto.comments";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
  const threadUri = $derived(data.thread);

  const quickstart = `pnpm add @svebcomponents/atproto.comments

import "@svebcomponents/atproto.comments";`;

  const markup = `<atproto-comments
  thread="https://bsky.app/profile/bsky.app/post/…"
></atproto-comments>`;

  const selfHostedMarkup = `<atproto-comments
  thread="at://did:plc:…/app.bsky.feed.post/…"
  service="/atproto"
></atproto-comments>`;

  const selfHostedConfig = `createAtprotoCommentsService({
  publicUrl: "https://your.blog",
  basePath: "/atproto",
  sessionMode: "cookie",
  sessionSecret,
  keys,
  stateStore,
  sessionStore,
  serviceSessionStore,
});`;

  const properties = [
    {
      name: "thread",
      type: "string",
      default: "—",
      description: "An AT URI or bsky.app post URL.",
    },
    {
      name: "service",
      type: "string",
      default: "hosted",
      description:
        "One backend URL for OAuth, posting, and live events. Set /atproto to self-host.",
    },
    {
      name: "readonly",
      type: "boolean",
      default: "false",
      description:
        "Hides in-page sign-in and posting. Live updates remain enabled.",
    },
    {
      name: "sort",
      type: "oldest | newest | likes",
      default: "oldest",
      description: "How comments are ordered at each level.",
    },
    {
      name: "max-depth",
      type: "number",
      default: "6",
      description: "Maximum nested reply depth rendered inline.",
    },
    {
      name: "labels",
      type: "hide | collapse | show",
      default: "collapse",
      description: "Treatment for moderation-labelled posts.",
    },
    {
      name: "viewer",
      type: "URL",
      default: "bsky.app",
      description: "Viewer used for profile and post links.",
    },
    {
      name: "appview",
      type: "URL",
      default: "public.api.bsky.app",
      description: "Public AppView used to fetch thread snapshots.",
    },
  ];

  const events = [
    ["atproto-comments:loaded", "The first client-side snapshot loaded."],
    [
      "atproto-comments:revalidated",
      "A connected or comment event refreshed the snapshot.",
    ],
    ["atproto-comments:comment", "The live service observed a new reply URI."],
    [
      "atproto-comments:live-status",
      "The upstream changed between connected and reconnecting.",
    ],
    ["atproto-comments:signed-in", "The reader completed ATProto OAuth."],
    ["atproto-comments:posted", "The reader published a reply."],
    ["atproto-comments:error", "A load or background refresh failed."],
  ];
</script>

<svelte:head>
  <title>ATProto comments for any site — svebcomponents</title>
  <meta
    name="description"
    content="A drop-in, server-renderable web component for ATProto comments, with free hosted OAuth and live updates."
  />
  <meta property="og:title" content="ATProto comments for any site" />
  <meta
    property="og:description"
    content="One web component. Public ATProto threads, in-page replies, SSR, and live updates."
  />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://atproto.svebcomponents.dev/" />
  <meta
    property="og:image"
    content="https://atproto.svebcomponents.dev/og-atproto-comments.png"
  />
  <meta
    property="og:image:alt"
    content="A network of conversations flowing into a website comment thread"
  />
  <meta name="twitter:card" content="summary_large_image" />
  <meta
    name="twitter:image"
    content="https://atproto.svebcomponents.dev/og-atproto-comments.png"
  />
</svelte:head>

<header class="site-header">
  <a class="brand" href="#top" aria-label="svebcomponents atproto home">
    <span class="brand-mark" aria-hidden="true">✦</span>
    <span>svebcomponents<span class="brand-muted">/atproto</span></span>
  </a>
  <nav aria-label="Main navigation">
    <a href="#start">Quickstart</a>
    <a href="#reference">Reference</a>
    <a href="#self-host">Self-host</a>
    <a
      class="github-link"
      href="https://github.com/svebcomponents/atproto"
      target="_blank"
      rel="noreferrer">GitHub ↗</a
    >
  </nav>
</header>

<main id="top">
  <section class="hero">
    <div class="hero-copy">
      <div class="eyebrow"><span></span> Open social comments</div>
      <h1>Your post.<br /><em>Their voices.</em></h1>
      <p class="lede">
        Turn any ATProto thread into a native comment section. Readers reply
        with their own accounts, posts stay in their own repos, and your site
        stays refreshingly database-free.
      </p>
      <div class="hero-actions">
        <a class="button primary" href="#start">Add to your site</a>
        <a class="button secondary" href="#demo">See it live</a>
      </div>
      <p class="microcopy">
        MIT licensed · framework-agnostic · hosted backend included
      </p>
    </div>

    <div class="hero-code" aria-label="Minimal usage example">
      <div class="window-bar">
        <span></span><span></span><span></span>
        <small>article.html</small>
      </div>
      <pre><code
          ><span class="code-muted">&lt;!-- one import --&gt;</span>
&lt;<span class="code-pink">script</span> <span class="code-blue">type</span
          >=<span class="code-green">"module"</span>
  <span class="code-blue">src</span>=<span class="code-green"
            >"/atproto-comments.js"</span
          >&gt;
&lt;/<span class="code-pink">script</span>&gt;

<span class="code-muted">&lt;!-- one component --&gt;</span>
&lt;<span class="code-pink">atproto-comments</span>
  <span class="code-blue">thread</span>=<span class="code-green"
            >"https://bsky.app/…"</span
          >
&gt;&lt;/<span class="code-pink">atproto-comments</span>&gt;</code
        ></pre>
      <div class="code-foot">
        <span class="pulse" aria-hidden="true"></span>
        Live updates connected
      </div>
    </div>
  </section>

  <section class="principles" aria-label="Product principles">
    <article>
      <span class="number">01</span>
      <h2>Own nothing</h2>
      <p>
        Comments are ordinary ATProto replies. No proprietary comment database,
        no export story, no lock-in.
      </p>
    </article>
    <article>
      <span class="number">02</span>
      <h2>Feel native</h2>
      <p>
        Shadow DOM keeps it reliable; CSS variables and parts let it settle into
        the typography of your site.
      </p>
    </article>
    <article>
      <span class="number">03</span>
      <h2>Stay current</h2>
      <p>
        Live signals replace polling. A new reply triggers one focused AppView
        refresh, with coalescing and retry built in.
      </p>
    </article>
  </section>

  <section id="start" class="section split-section">
    <div class="section-intro">
      <p class="kicker">Quickstart</p>
      <h2>Two snippets.<br />That’s the setup.</h2>
      <p>
        The custom element works with Svelte, Astro, Eleventy, React, plain
        HTML, or anything else that can load an ES module.
      </p>
      <aside class="default-note">
        <span aria-hidden="true">✦</span>
        <p>
          <strong>The hosted service is the default.</strong> Leave off
          <code>service</code> and the component uses
          <code>https://atproto.svebcomponents.dev/atproto</code> for live events
          and optional sign-in.
        </p>
      </aside>
    </div>
    <div class="steps">
      <article class="step">
        <span class="step-number">1</span>
        <div>
          <h3>Install and import</h3>
          <pre><code>{quickstart}</code></pre>
        </div>
      </article>
      <article class="step">
        <span class="step-number">2</span>
        <div>
          <h3>Point at a post</h3>
          <pre><code>{markup}</code></pre>
        </div>
      </article>
    </div>
  </section>

  <section id="demo" class="section demo-section">
    <div class="demo-heading">
      <div>
        <p class="kicker">The real component</p>
        <h2>Not a screenshot.</h2>
      </div>
      <p>
        This thread is server-rendered below, hydrated in place, and subscribed
        to the same hosted event bridge your site gets by default.
      </p>
    </div>
    <div class="demo-frame">
      <div class="demo-toolbar">
        <span><i></i> Live ATProto thread</span>
        <a
          href="https://bsky.app/profile/bsky.app/post/3mojb23vtt22c"
          target="_blank"
          rel="noreferrer">Open original ↗</a
        >
      </div>
      {#if data.threadData}
        <atproto-comments
          thread={threadUri}
          threadData={data.threadData}
          service="/atproto"
        ></atproto-comments>
      {:else}
        <p class="demo-unavailable">
          The public AppView did not return this thread. Try another post with
          the query parameter below.
        </p>
      {/if}
    </div>
    <p class="demo-hint">
      Try another post with <code>?thread=&lt;AT URI or bsky.app URL&gt;</code>.
    </p>
  </section>

  <section class="section architecture">
    <div class="section-intro">
      <p class="kicker">Designed for the public web</p>
      <h2>A signal, not another source of truth.</h2>
      <p>
        Reads go straight to a public AppView. The backend only coordinates
        OAuth, publishes replies, and tells the component when the public
        snapshot may have changed.
      </p>
    </div>
    <div class="flow" aria-label="Live update architecture">
      <div class="flow-node">
        <small>Your page</small>
        <strong>&lt;atproto-comments&gt;</strong>
        <span>renders + refreshes</span>
      </div>
      <span class="flow-arrow">⇄</span>
      <div class="flow-node accent-node">
        <small>Hosted or yours</small>
        <strong>Event bridge</strong>
        <span>one SSE per viewer</span>
      </div>
      <span class="flow-arrow">⇄</span>
      <div class="flow-node">
        <small>Community infra</small>
        <strong>Microcosm</strong>
        <span>one filtered WebSocket</span>
      </div>
    </div>
    <div class="architecture-notes">
      <p><strong>One upstream.</strong> Threads are multiplexed per process.</p>
      <p>
        <strong>No polling.</strong> Refreshes happen on connection or reply.
      </p>
      <p>
        <strong>No replay dependency.</strong> Reconnect forces a fresh read.
      </p>
    </div>
  </section>

  <section id="reference" class="section reference">
    <div class="reference-heading">
      <div>
        <p class="kicker">Component reference</p>
        <h2>Small surface.<br />Useful escape hatches.</h2>
      </div>
      <p>
        Defaults are intentionally complete. Most sites only set
        <code>thread</code>; everything else exists for policy, presentation, or
        infrastructure choices.
      </p>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Property</th>
            <th>Type</th>
            <th>Default</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          {#each properties as property (property.name)}
            <tr>
              <td><code>{property.name}</code></td>
              <td>{property.type}</td>
              <td>{property.default}</td>
              <td>{property.description}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="events-grid">
      <div>
        <h3>Imperative refresh</h3>
        <p>
          Call <code>element.revalidate()</code> whenever your application knows more
          than the live stream does. Concurrent calls are deduplicated.
        </p>
      </div>
      <div class="event-list">
        <h3>DOM events</h3>
        {#each events as event (event[0])}
          <p><code>{event[0]}</code><span>{event[1]}</span></p>
        {/each}
      </div>
    </div>
  </section>

  <section id="self-host" class="section self-host">
    <div class="self-host-copy">
      <p class="kicker">One backend switch</p>
      <h2>Hosted by default.<br />Yours when you want it.</h2>
      <p>
        The <code>service</code> property is the only backend setting in the component.
        Change it once and OAuth, posting, and live SSE all move together.
      </p>
      <ul>
        <li>
          <strong>Cross-origin hosted mode</strong> uses a short-lived, origin-bound
          bridge JWT. ATProto OAuth tokens never leave the server.
        </li>
        <li>
          <strong>Same-origin self-hosted mode</strong> uses an HttpOnly, SameSite
          cookie instead—no browser-readable session credential.
        </li>
        <li>
          Both modes run the exact same open-source bridge and store no comment
          bodies.
        </li>
      </ul>
      <div class="resource-note">
        <strong>Being gentle with Microcosm</strong>
        <p>
          A process opens one filtered Spacedust connection only while someone
          is watching. It updates the subject set as threads come and go,
          applies jittered reconnect backoff, and enforces bounded viewer and
          thread capacity.
        </p>
      </div>
    </div>
    <div class="self-host-code">
      <p class="code-label">Component</p>
      <pre><code>{selfHostedMarkup}</code></pre>
      <p class="code-label">Server</p>
      <pre><code>{selfHostedConfig}</code></pre>
      <a
        class="text-link"
        href="https://github.com/svebcomponents/atproto/blob/main/03-oauth-service.md#self-hosting"
        target="_blank"
        rel="noreferrer">Read the deployment guide ↗</a
      >
    </div>
  </section>

  <section class="closing">
    <span class="closing-star" aria-hidden="true">✦</span>
    <p class="kicker">Comments should belong to the conversation</p>
    <h2>Make the social web<br />feel like the web again.</h2>
    <a class="button primary" href="#start">Start with one thread</a>
  </section>
</main>

<footer>
  <a class="brand" href="#top">
    <span class="brand-mark" aria-hidden="true">✦</span>
    <span>svebcomponents<span class="brand-muted">/atproto</span></span>
  </a>
  <p>Open source, MIT licensed, and built on the atmosphere.</p>
  <div>
    <a href="https://github.com/svebcomponents/atproto">Source</a>
    <a href="https://www.npmjs.com/org/svebcomponents">npm</a>
    <a href="https://www.microcosm.blue/">Microcosm</a>
  </div>
</footer>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(html) {
    scroll-behavior: smooth;
    color-scheme: light;
  }

  :global(body) {
    margin: 0;
    background: #f6f4ef;
    color: #1b1b1d;
    font-family:
      Inter,
      ui-sans-serif,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;
    font-synthesis: none;
  }

  :global(::selection) {
    background: #ff4f8b;
    color: #fff;
  }

  :global(a) {
    color: inherit;
  }

  .site-header,
  footer {
    width: min(100% - 3rem, 1180px);
    margin: 0 auto;
  }

  .site-header {
    height: 78px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #d9d5cd;
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    font-weight: 750;
    letter-spacing: -0.03em;
    text-decoration: none;
  }

  .brand-mark {
    width: 1.8rem;
    height: 1.8rem;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: #ff4f8b;
    color: #fff;
    font-size: 0.9rem;
  }

  .brand-muted {
    color: #77736b;
    font-weight: 500;
  }

  nav,
  footer div {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }

  nav a,
  footer a {
    font-size: 0.86rem;
    font-weight: 600;
    text-decoration: none;
  }

  nav a:hover,
  footer a:hover,
  .text-link:hover {
    color: #dc2868;
  }

  .github-link {
    padding: 0.55rem 0.85rem;
    border: 1px solid #c7c2b9;
    border-radius: 999px;
  }

  main {
    overflow: hidden;
  }

  .hero,
  .section,
  .principles {
    width: min(100% - 3rem, 1180px);
    margin: 0 auto;
  }

  .hero {
    min-height: 670px;
    display: grid;
    grid-template-columns: 1.02fr 0.98fr;
    align-items: center;
    gap: clamp(3rem, 8vw, 7rem);
    padding: 5.5rem 0 6.5rem;
  }

  .eyebrow,
  .kicker {
    margin: 0 0 1.15rem;
    color: #7d405b;
    font-size: 0.76rem;
    font-weight: 800;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }

  .eyebrow {
    display: flex;
    align-items: center;
    gap: 0.55rem;
  }

  .eyebrow span {
    width: 28px;
    height: 1px;
    background: #ff4f8b;
  }

  h1,
  h2 {
    margin: 0;
    font-family: Georgia, "Times New Roman", serif;
    font-weight: 400;
    letter-spacing: -0.055em;
    line-height: 0.95;
  }

  h1 {
    max-width: 700px;
    font-size: clamp(4rem, 7.2vw, 6.5rem);
  }

  h1 em {
    color: #e73476;
    font-weight: inherit;
  }

  h2 {
    font-size: clamp(3rem, 5vw, 5rem);
  }

  .lede {
    max-width: 590px;
    margin: 2rem 0 0;
    color: #514e49;
    font-size: clamp(1.08rem, 1.8vw, 1.3rem);
    line-height: 1.62;
  }

  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
    margin-top: 2rem;
  }

  .button {
    display: inline-flex;
    min-height: 48px;
    align-items: center;
    justify-content: center;
    padding: 0.75rem 1.25rem;
    border-radius: 999px;
    font-size: 0.9rem;
    font-weight: 750;
    text-decoration: none;
  }

  .button.primary {
    background: #1b1b1d;
    color: #fff;
  }

  .button.primary:hover {
    background: #e73476;
  }

  .button.secondary {
    border: 1px solid #bdb8ae;
  }

  .button.secondary:hover {
    border-color: #1b1b1d;
  }

  .microcopy {
    color: #817c73;
    font-size: 0.78rem;
    margin-top: 1.2rem;
  }

  .hero-code {
    overflow: hidden;
    border: 1px solid #34343a;
    border-radius: 18px;
    background: #202025;
    color: #f7f5f0;
    box-shadow: 0 28px 70px rgb(25 20 22 / 0.18);
    transform: rotate(1.2deg);
  }

  .window-bar {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.9rem 1rem;
    border-bottom: 1px solid #34343a;
  }

  .window-bar > span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ff4f8b;
  }

  .window-bar > span:nth-child(2) {
    background: #e2b33c;
  }

  .window-bar > span:nth-child(3) {
    background: #65be87;
  }

  .window-bar small {
    margin-left: auto;
    color: #8d8d99;
  }

  pre {
    margin: 0;
    overflow-x: auto;
    background: #202025;
    color: #f7f5f0;
    font:
      0.84rem/1.75 ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
  }

  .hero-code pre {
    min-height: 300px;
    display: flex;
    align-items: center;
    padding: clamp(1.4rem, 4vw, 2.5rem);
  }

  .code-muted {
    color: #797984;
  }

  .code-pink {
    color: #ff7eab;
  }

  .code-blue {
    color: #75bbff;
  }

  .code-green {
    color: #9bd9ae;
  }

  .code-foot {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.85rem 1rem;
    border-top: 1px solid #34343a;
    color: #aaaab3;
    font:
      0.72rem ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
  }

  .pulse,
  .demo-toolbar i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #65d58d;
    box-shadow: 0 0 0 4px rgb(101 213 141 / 0.12);
  }

  .principles {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    border-top: 1px solid #d9d5cd;
    border-bottom: 1px solid #d9d5cd;
  }

  .principles article {
    padding: 2.6rem clamp(1rem, 3vw, 2.5rem);
  }

  .principles article + article {
    border-left: 1px solid #d9d5cd;
  }

  .number {
    color: #d94b7e;
    font:
      0.75rem ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
  }

  h3 {
    margin: 0;
    letter-spacing: -0.025em;
  }

  .principles h2,
  .steps h3 {
    margin-top: 1rem;
    font-family: inherit;
    font-size: 1.15rem;
    font-weight: 750;
    letter-spacing: -0.025em;
  }

  .principles p,
  .section-intro > p:last-child,
  .reference-heading > p,
  .demo-heading > p {
    color: #656159;
    line-height: 1.65;
  }

  .principles p {
    margin-bottom: 0;
    font-size: 0.9rem;
  }

  .section {
    padding: clamp(6rem, 10vw, 10rem) 0;
  }

  .split-section,
  .self-host {
    display: grid;
    grid-template-columns: 0.8fr 1.2fr;
    gap: clamp(3rem, 8vw, 8rem);
  }

  .section-intro > p:last-child {
    max-width: 500px;
    margin-top: 1.8rem;
  }

  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  p code,
  td code {
    padding: 0.1em 0.32em;
    border: 1px solid #ddd7cd;
    border-radius: 4px;
    background: #ebe8e1;
    font-size: 0.87em;
  }

  .default-note {
    display: flex;
    gap: 0.9rem;
    margin-top: 2rem;
    padding: 1rem;
    border-left: 3px solid #ff4f8b;
    background: #eeebe4;
  }

  .default-note > span {
    color: #e73476;
  }

  .default-note p {
    margin: 0;
    color: #555149;
    font-size: 0.84rem;
    line-height: 1.6;
  }

  .steps {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: #d9d5cd;
    border: 1px solid #d9d5cd;
  }

  .step {
    display: grid;
    grid-template-columns: 38px 1fr;
    gap: 1rem;
    padding: 1.5rem;
    background: #f6f4ef;
  }

  .step-number {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border: 1px solid #c7c2b9;
    border-radius: 50%;
    color: #817c73;
    font-size: 0.75rem;
  }

  .step h3 {
    margin: 0.25rem 0 1rem;
  }

  .step pre,
  .self-host pre {
    padding: 1.25rem;
    border-radius: 9px;
  }

  .demo-section {
    width: auto;
    padding-inline: max(1.5rem, calc((100vw - 1180px) / 2));
    background: #222228;
    color: #f8f6f1;
  }

  .demo-heading,
  .reference-heading {
    display: grid;
    grid-template-columns: 1fr 0.8fr;
    align-items: end;
    gap: 3rem;
    margin-bottom: 3rem;
  }

  .demo-heading .kicker {
    color: #ff83ad;
  }

  .demo-heading > p {
    color: #b6b4bd;
  }

  .demo-frame {
    overflow: hidden;
    max-width: 900px;
    margin: 0 auto;
    border: 1px solid #44444d;
    border-radius: 18px;
    background: #fff;
    color: #202025;
  }

  .demo-toolbar {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.9rem 1.1rem;
    border-bottom: 1px solid #e5e1da;
    color: #67635d;
    font-size: 0.76rem;
  }

  .demo-toolbar span {
    display: flex;
    align-items: center;
    gap: 0.55rem;
  }

  .demo-toolbar a {
    text-decoration: none;
  }

  :global(atproto-comments) {
    display: block;
    max-height: min(68vh, 660px);
    overflow: auto;
    padding: clamp(1rem, 4vw, 2.5rem);
    scrollbar-color: #c7c2b9 transparent;
    --atproto-comments-accent: #e73476;
    --atproto-comments-radius: 999px;
    --atproto-comments-font-size: 0.9rem;
  }

  .demo-hint {
    color: #8f8d96;
    font-size: 0.78rem;
    text-align: center;
  }

  .demo-hint code {
    border-color: #414149;
    background: #2b2b31;
  }

  .architecture {
    display: grid;
    grid-template-columns: 0.65fr 1.35fr;
    gap: clamp(3rem, 7vw, 7rem);
  }

  .flow {
    display: grid;
    grid-template-columns: 1fr auto 1fr auto 1fr;
    align-items: center;
  }

  .flow-node {
    min-height: 180px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 1.2rem;
    border: 1px solid #cdc8bf;
    text-align: center;
  }

  .flow-node small,
  .flow-node span {
    color: #7a756d;
    font-size: 0.7rem;
  }

  .flow-node strong {
    margin: 0.55rem 0;
    letter-spacing: -0.03em;
  }

  .accent-node {
    border-color: #ff8db5;
    background: #ffe5ee;
  }

  .flow-arrow {
    padding: 0 0.6rem;
    color: #c33d70;
  }

  .architecture-notes {
    grid-column: 2;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    color: #6a665f;
    font-size: 0.77rem;
    line-height: 1.5;
  }

  .architecture-notes p {
    margin: 0;
  }

  .architecture-notes strong {
    display: block;
    color: #222;
  }

  .reference {
    width: auto;
    padding-inline: max(1.5rem, calc((100vw - 1180px) / 2));
    background: #eae6de;
  }

  .table-wrap {
    overflow-x: auto;
    border-top: 1px solid #bdb7ad;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.83rem;
  }

  th,
  td {
    padding: 1rem;
    border-bottom: 1px solid #cec8be;
    text-align: left;
    vertical-align: top;
  }

  th {
    color: #6e6961;
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  td:nth-child(2),
  td:nth-child(3) {
    white-space: nowrap;
    color: #6c675f;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.75rem;
  }

  .events-grid {
    display: grid;
    grid-template-columns: 0.65fr 1.35fr;
    gap: clamp(3rem, 8vw, 8rem);
    margin-top: 4rem;
  }

  .events-grid > div:first-child p,
  .self-host-copy > p {
    color: #656159;
    line-height: 1.65;
  }

  .event-list p {
    display: grid;
    grid-template-columns: minmax(180px, 0.7fr) 1fr;
    gap: 1rem;
    margin: 0;
    padding: 0.7rem 0;
    border-bottom: 1px solid #cec8be;
    color: #68635c;
    font-size: 0.78rem;
  }

  .event-list code {
    color: #bd2d63;
  }

  .self-host {
    grid-template-columns: 1fr 1fr;
  }

  .self-host-copy > p {
    max-width: 560px;
  }

  .self-host ul {
    display: grid;
    gap: 1rem;
    padding: 0;
    list-style: none;
  }

  .self-host li {
    padding-left: 1.2rem;
    border-left: 1px solid #d9a1b5;
    color: #625e57;
    font-size: 0.87rem;
    line-height: 1.6;
  }

  .self-host li strong {
    color: #222;
  }

  .resource-note {
    margin-top: 2rem;
    padding: 1.2rem;
    border: 1px solid #d4cec4;
    background: #efebe4;
  }

  .resource-note p {
    margin-bottom: 0;
    color: #676159;
    font-size: 0.8rem;
    line-height: 1.6;
  }

  .self-host-code {
    align-self: start;
    padding: 1.5rem;
    border-radius: 14px;
    background: #202025;
    color: #f8f6f1;
    box-shadow: 0 24px 60px rgb(31 25 27 / 0.14);
  }

  .self-host-code pre {
    border: 1px solid #37373e;
  }

  .code-label {
    margin: 0.8rem 0 0.6rem;
    color: #93929c;
    font:
      0.7rem ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
    text-transform: uppercase;
  }

  .code-label:first-child {
    margin-top: 0;
  }

  .text-link {
    display: inline-block;
    margin-top: 1.4rem;
    color: #ff8fb6;
    font-size: 0.82rem;
    font-weight: 700;
    text-decoration: none;
  }

  .closing {
    padding: clamp(7rem, 13vw, 12rem) 1.5rem;
    background: #f7c9d9;
    text-align: center;
  }

  .closing-star {
    width: 46px;
    height: 46px;
    display: grid;
    place-items: center;
    margin: 0 auto 1.5rem;
    border-radius: 50%;
    background: #e73476;
    color: #fff;
  }

  .closing h2 {
    margin-bottom: 2rem;
  }

  footer {
    min-height: 130px;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 2rem;
  }

  footer p {
    color: #777169;
    font-size: 0.75rem;
    text-align: center;
  }

  footer div {
    justify-content: flex-end;
  }

  @media (max-width: 850px) {
    .site-header nav a:not(.github-link) {
      display: none;
    }

    .hero,
    .split-section,
    .architecture,
    .self-host {
      grid-template-columns: 1fr;
    }

    .hero {
      padding-top: 4rem;
    }

    .hero-code {
      transform: none;
    }

    .principles {
      grid-template-columns: 1fr;
    }

    .principles article + article {
      border-top: 1px solid #d9d5cd;
      border-left: 0;
    }

    .demo-heading,
    .reference-heading,
    .events-grid {
      grid-template-columns: 1fr;
    }

    .flow {
      grid-template-columns: 1fr;
      gap: 0;
    }

    .flow-arrow {
      padding: 0.35rem;
      transform: rotate(90deg);
      text-align: center;
    }

    .architecture-notes {
      grid-column: auto;
    }

    footer {
      grid-template-columns: 1fr;
      padding: 2rem 0;
      text-align: center;
    }

    footer p {
      margin: 0;
    }

    footer div {
      justify-content: center;
    }
  }

  @media (max-width: 560px) {
    .site-header,
    footer,
    .hero,
    .section,
    .principles {
      width: min(100% - 2rem, 1180px);
    }

    h1 {
      font-size: 3.7rem;
    }

    h2 {
      font-size: 2.75rem;
    }

    .hero {
      gap: 3rem;
      min-height: 0;
    }

    .hero-code pre {
      font-size: 0.68rem;
    }

    .demo-section,
    .reference {
      width: auto;
      padding-inline: 1rem;
    }

    .demo-toolbar {
      align-items: flex-start;
      flex-direction: column;
    }

    .architecture-notes {
      grid-template-columns: 1fr;
    }

    .event-list p {
      grid-template-columns: 1fr;
      gap: 0.35rem;
    }
  }
</style>
