<script lang="ts">
  import { resolve } from "$app/paths";
  import "@svebcomponents/atproto.comments";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
  const threadUri = $derived(data.thread);

  /* The snippet is copied out of the DOM rather than kept as a second string,
     so the code on screen and the code on the clipboard cannot drift apart. */
  let snippetEl: HTMLElement;
  let copied = $state(false);
  let copiedTimer: ReturnType<typeof setTimeout>;

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippetEl.textContent ?? "");
    } catch {
      return;
    }
    copied = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copied = false), 2000);
  }

  const quickstart = `pnpm add @svebcomponents/atproto.comments

import "@svebcomponents/atproto.comments";`;

  const markup = `<atproto-comments
  thread="https://bsky.app/profile/bsky.app/post/…"
></atproto-comments>`;

  const selfHostedMarkup = `<atproto-comments
  thread="at://did:plc:…/app.bsky.feed.post/…"
  service="/atproto"
></atproto-comments>`;

  const consentSnippet = `const comments = document.querySelector("atproto-comments");
comments.live = "off";
onConsent((granted) => (comments.live = granted ? "all" : "off"));`;

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
  <title>atproto-comments — svebcomponents</title>
  <meta
    name="description"
    content="A web component that renders an AT Protocol thread as a comment section. Server-rendered and hydratable, with sign-in, replies, live updates, and a self-hostable backend."
  />
  <meta property="og:title" content="atproto-comments" />
  <meta
    property="og:description"
    content="Renders an AT Protocol thread as a comment section. Supports SSR, sign-in, replies, and live updates."
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
    <img class="brand-mark" src="/svebcomponents.svg" alt="" />
    <span>svebcomponents<span class="brand-muted">/atproto</span></span>
  </a>
  <nav aria-label="Main navigation">
    <a href="#tiers">Get started</a>
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
    <h1 class="sr-only">
      &lt;atproto-comments&gt;, a web component that renders an AT Protocol
      thread as a comment section
    </h1>

    <div class="thread-showcase">
      <div class="showcase-bar">
        <div class="live-label">
          <span class="pulse" aria-hidden="true"></span>
          <span>Live ATProto thread</span>
        </div>
      </div>
      <div
        class="thread-panel"
        aria-label="Live ATProto thread, rendered by this component"
      >
        {#if data.threadData}
          <!-- live="all" because this demo is first-party: the bridge it
               streams from is this same site, so a visitor's connection here
               tells us nothing they weren't already telling us. The default
               (live="signed-in") is the right one for a component embedded
               on someone else's blog against the hosted service. -->
          <atproto-comments
            thread={threadUri}
            threadData={data.threadData}
            service="/atproto"
            live="all"
            showRoot
          ></atproto-comments>
        {:else}
          <p class="demo-unavailable">
            The public AppView did not return this thread. Try another post with
            the query parameter below.
          </p>
        {/if}
      </div>
      <div class="showcase-foot">
        <a
          class="showcase-link"
          href="https://bsky.app/profile/theosteiner.de/post/3mreni33v7k2c"
          target="_blank"
          rel="noreferrer">Open original ↗</a
        >
      </div>
    </div>

    <div class="hero-code" aria-label="Code needed to render this thread">
      <div class="window-bar">
        <button class="copy-button" type="button" onclick={copySnippet}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect x="5.5" y="5.5" width="8" height="9" rx="1.5" />
            <path
              d="M10.5 3V2.5a1.5 1.5 0 0 0-1.5-1.5H4a1.5 1.5 0 0 0-1.5 1.5V10A1.5 1.5 0 0 0 4 11.5h.5"
            />
          </svg>
          {copied ? "Copied" : "Copy HTML"}
        </button>
      </div>
      <pre class="hero-demo-code"><code bind:this={snippetEl}
          >&lt;<span class="code-tag">script</span> <span class="code-attr"
            >type</span
          >=<span class="code-string">"module"</span>
  <span class="code-attr">src</span>=<span class="code-string"
            >"https://atproto.svebcomponents.dev/<wbr />cdn"</span
          >&gt;
&lt;/<span class="code-tag">script</span>&gt;

&lt;<span class="code-tag">atproto-comments</span>
  <span class="code-attr">thread</span>=<span class="code-string"
            >"https://bsky.app/profile/<wbr />theosteiner.de/post/<wbr
            />3mreni33v7k2c"</span
          >
&gt;&lt;/<span class="code-tag">atproto-comments</span>&gt;

&lt;<span class="code-tag">style</span>&gt;
  <span class="code-tag">atproto-comments</span> &lbrace;
    <span class="code-attr">--atproto-comments-accent</span>: <span
            class="code-string">#2563eb</span
          >;
    <span class="code-attr">--atproto-comments-radius</span>: <span
            class="code-string">4px</span
          >;
    <span class="code-attr">font-family</span>: <span class="code-string"
            >ui-monospace, monospace</span
          >;
  &rbrace;
&lt;/<span class="code-tag">style</span>&gt;</code
        ></pre>
      <div class="code-foot">
        <a class="code-foot-link" href="#start">More options ↓</a>
      </div>
    </div>
  </section>

  <section class="principles" aria-label="Design notes">
    <article>
      <span class="number">01</span>
      <h2>No data store</h2>
      <p>
        Comments are ordinary <code>app.bsky.feed.post</code> records written to each
        commenter's repo. Deleting the record deletes the comment.
      </p>
    </article>
    <article>
      <span class="number">02</span>
      <h2>Styleable</h2>
      <p>
        Styles are scoped by shadow DOM. CSS custom properties and parts adapt
        the component to the typography of the host page.
      </p>
    </article>
    <article>
      <span class="number">03</span>
      <h2>Event-driven updates</h2>
      <p>
        The component does not poll. Bridge events trigger one coalesced AppView
        refresh per change, retried briefly while new replies index.
      </p>
    </article>
  </section>

  <section id="tiers" class="section split-section">
    <div class="section-intro">
      <p class="kicker">Setup options</p>
      <h2>Four levels<br />of control.</h2>
      <p>
        Each level unlocks more fine-grained control over how you distribute the
        comment component and where data flows from.
      </p>
    </div>
    <div class="steps">
      <article class="step">
        <span class="step-number">1</span>
        <div>
          <h3>CDN script tag</h3>
          <p>Pasted into static HTML or a CMS. See the snippet above.</p>
        </div>
      </article>
      <article class="step">
        <span class="step-number">2</span>
        <div>
          <h3>npm install</h3>
          <p>
            Add the package and import it once into your own bundle. Type
            definitions and a custom elements manifest ship with it.
            <a class="text-link" href="#start">Install guide ↓</a>
          </p>
        </div>
      </article>
      <article class="step">
        <span class="step-number">3</span>
        <div>
          <h3>Server-rendered</h3>
          <p>
            The thread is rendered into declarative shadow DOM on the server and
            adopted in place on the client. SvelteKit, Vue, Astro & React are
            supported by svebcomponents as of today.
            <a class="text-link" href="#ssr">See the SSR guide ↓</a>
          </p>
        </div>
      </article>
      <article class="step">
        <span class="step-number">4</span>
        <div>
          <h3>Self-hosted backend</h3>
          <p>
            Run OAuth, posting, and live events on your own infrastructure
            instead of the hosted service.
            <a class="text-link" href="#self-host">See self-hosting ↓</a>
          </p>
        </div>
      </article>
    </div>
  </section>

  <section id="start" class="section split-section">
    <div class="section-intro">
      <p class="kicker">Quickstart</p>
      <h2>Install from npm & go.</h2>
      <p>
        The custom element works with Svelte, Astro, Eleventy, React, plain
        HTML, or anything else that can load an ES module.
      </p>
      <aside class="default-note">
        <span aria-hidden="true">✦</span>
        <p>
          <strong>svebcomponents/atproto is phoning home.</strong><br />
          the component uses <i>a hosted bridge</i> <br />
          (<code>https://atproto.svebcomponents.dev/atproto</code>)<br /> to
          receive live events and facilitate sign-in.<br />
          <a href="#self-host">self-host to make it run on your origin ↓</a>
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

  <section id="ssr" class="section split-section">
    <div class="section-intro">
      <p class="kicker">Server rendering</p>
      <h2>One recipe,<br />every host.</h2>
      <p>
        Server rendering works the same way everywhere: import the component's
        renderer entry (<code>@svebcomponents/atproto.comments/ssr</code>) once
        on the server, its browser entry on the client, and write
        <code>&lt;atproto-comments&gt;</code> like any other tag. A small adapter
        renders declarative shadow DOM during SSR — including the thread fetch — and
        the browser adopts it in place on hydration, so the first paint already shows
        comments.
      </p>
    </div>
    <div class="ssr-grid">
      <article class="ssr-card">
        <h3>Svelte</h3>
        <p><code>@svebcomponents/ssr</code></p>
        <p>
          Add the Vite plugin before Svelte's and import the renderer entry in
          <code>hooks.server.ts</code>.
        </p>
        <a
          class="text-link"
          href="https://svebcomponents.dev/server-rendering/sveltekit/"
          target="_blank"
          rel="noreferrer">Setup guide ↗</a
        >
      </article>
      <article class="ssr-card">
        <h3>React</h3>
        <p><code>@svebcomponents/ssr-react/rsc</code></p>
        <p>
          Point <code>jsxImportSource</code> at the adapter, load both entries, use
          the tag as JSX.
        </p>
        <a
          class="text-link"
          href="https://svebcomponents.dev/server-rendering/react/"
          target="_blank"
          rel="noreferrer">Setup guide ↗</a
        >
      </article>
      <article class="ssr-card">
        <h3>Vue</h3>
        <p><code>@svebcomponents/ssr-vue</code></p>
        <p>
          Add the Vite plugin before Vue's and <code>app.use()</code> the adapter
          on both app instances.
        </p>
        <a
          class="text-link"
          href="https://svebcomponents.dev/server-rendering/vue/"
          target="_blank"
          rel="noreferrer">Setup guide ↗</a
        >
      </article>
      <article class="ssr-card">
        <h3>Astro</h3>
        <p><code>@svebcomponents/ssr-astro</code></p>
        <p>
          Add the integration, import the renderer entry in frontmatter and the
          browser entry in a script.
        </p>
        <a
          class="text-link"
          href="https://svebcomponents.dev/server-rendering/astro/"
          target="_blank"
          rel="noreferrer">Setup guide ↗</a
        >
      </article>
    </div>
  </section>

  <section class="section architecture">
    <div class="section-intro">
      <p class="kicker">Architecture</p>
      <h2>Reads, writes,<br />and live updates.</h2>
      <p>
        Reads go straight from the browser to a public AppView. Writes run
        through the bridge's OAuth flow and land as ordinary posts in the
        commenter's own PDS repo. Live updates travel the other way: Spacedust
        signals the bridge, which fans out one SSE stream per viewer. The bridge
        coordinates all of this; it never stores or serves comment content.
      </p>
    </div>
    <div
      class="flow"
      role="img"
      aria-label="Diagram: the component reads thread snapshots directly from the public AppView; signs readers in and posts replies through the bridge into the commenter's PDS repo; and receives live update signals from Spacedust via one SSE stream per viewer. Relays carry repo commits from the commenter's PDS to both the AppView index and Spacedust."
    >
      <div class="flow-node source-node">
        <small>Your page</small>
        <strong>&lt;atproto-comments&gt;</strong>
        <span>renders · hydrates · refreshes</span>
      </div>

      <div class="flow-link reads-link">
        <span class="flow-arrow">→</span>
        <small>thread reads</small>
      </div>
      <div class="flow-node appview-node">
        <small>Public infra</small>
        <strong>AppView</strong>
        <span>direct from the browser, no auth</span>
      </div>

      <div class="flow-link writes-link">
        <span class="flow-arrow">→</span>
        <small>sign-in · post reply</small>
      </div>
      <div class="flow-node accent-node bridge-node">
        <small>Hosted or yours</small>
        <strong>Bridge</strong>
        <span>narrow OAuth scopes · SSE fan-out</span>
      </div>
      <div class="flow-link writes-far-link">
        <span class="flow-arrow">→</span>
        <small>createRecord</small>
      </div>
      <div class="flow-node pds-node">
        <small>Commenter's PDS</small>
        <strong>Their repo</strong>
        <span>replies live here, not on your server</span>
      </div>
      <div class="flow-link vertical-link relay-up-link">
        <span class="flow-arrow">↑</span>
        <small>indexed via relays</small>
      </div>
      <div class="flow-link vertical-link relay-down-link">
        <span class="flow-arrow">↓</span>
        <small>watched via relays</small>
      </div>

      <div class="flow-link updates-link">
        <span class="flow-arrow">←</span>
        <small>SSE per viewer</small>
      </div>
      <div class="flow-link updates-far-link">
        <span class="flow-arrow">←</span>
        <small>one filtered WebSocket</small>
      </div>
      <div class="flow-node spacedust-node">
        <small>Community infra</small>
        <strong>Spacedust</strong>
        <span>repo event firehose, via relays</span>
      </div>
    </div>
    <div class="architecture-notes">
      <p>
        <strong>One upstream.</strong> Each bridge process multiplexes every active
        thread over a single Spacedust connection.
      </p>
      <p>
        <strong>No polling.</strong> Refreshes follow connection and reply events.
      </p>
      <p>
        <strong>No replay dependency.</strong> A reconnect forces a fresh read.
      </p>
      <p>
        <strong>One origin.</strong> Replies live only in the commenter's PDS; relays
        carry those commits to the AppView's index and to Spacedust. Nothing in this
        chain holds a private copy.
      </p>
    </div>
  </section>

  <section id="reference" class="section reference">
    <div class="reference-heading">
      <div>
        <p class="kicker">Component reference</p>
        <h2>Properties<br />and events.</h2>
      </div>
      <p>
        Most pages only need to set <code>thread</code>. The remaining
        properties cover sorting, depth limits, moderation handling, and
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
          Call <code>element.revalidate()</code> to request a refresh outside the
          normal event path. Concurrent calls are deduplicated.
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
      <p class="kicker">Self-hosting</p>
      <h2>Hosted service by default,<br />or run your own.</h2>
      <p>
        The <code>service</code> property selects the backend used for OAuth, posting,
        and the SSE stream. One value switches between the hosted service and your
        own deployment.
      </p>
      <ul>
        <li>
          In cross-origin deployments the component holds a short-lived,
          origin-bound bridge JWT. ATProto OAuth tokens never leave the server.
        </li>
        <li>
          Same-origin deployments use an HttpOnly SameSite cookie instead, which
          page JavaScript cannot read.
        </li>
        <li>
          Both modes run the same open-source bridge code, which stores no
          comment bodies.
        </li>
      </ul>
      <div class="resource-note">
        <strong>Spacedust usage</strong>
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

  <section id="privacy" class="section split-section">
    <div class="section-intro">
      <p class="kicker">Reader privacy</p>
      <h2>Nobody is<br />counted at the door.</h2>
      <p>
        Rendering a comment section should not turn a page view into a record on
        someone else's server. By default it doesn't: a signed-out reader's
        browser never contacts the bridge.
      </p>
      <a class="text-link" href={resolve("/privacy")}>Bridge privacy policy →</a
      >
    </div>
    <div class="section-body">
      <dl class="privacy-grid">
        <dt><code>live="signed-in"</code> <span class="pill">default</span></dt>
        <dd>
          Only readers who signed in stream updates. Everyone else reads from
          the AppView, or from your own server via SSR, and makes no request to
          the bridge at all.
        </dd>
        <dt><code>live="all"</code></dt>
        <dd>
          Every reader streams. Livelier, and a disclosure: reader IP addresses
          and the thread being read reach the bridge. Fine when the bridge is
          yours — this page uses it, because the bridge is this same origin.
        </dd>
        <dt><code>live="off"</code></dt>
        <dd>
          No streaming. Comments still render and still refresh after you post.
        </dd>
      </dl>

      <div class="resource-note">
        <strong>In the EU</strong>
        <p>
          Embedding a widget that calls a third party makes you a joint
          controller for what it sends (<em>Fashion ID</em>, C-40/17), and IP
          addresses are personal data (<em>Breyer</em>, C-582/14). The default
          keeps signed-out readers out of scope entirely. If you want
          <code>live="all"</code>, either disclose it or wire the attribute to
          your consent banner — it takes effect immediately, in both directions.
        </p>
      </div>

      <p class="code-label">Consent-managed</p>
      <pre><code>{consentSnippet}</code></pre>

      <p class="footnote">
        Note that avatars load from Bluesky's CDN in the reader's browser
        whatever you choose, so Bluesky sees reader IPs either way. Self-host
        the bridge to remove the remaining third party.
      </p>
    </div>
  </section>
</main>

<footer>
  <a class="brand" href="#top">
    <img class="brand-mark" src="/svebcomponents.svg" alt="" />
    <span>svebcomponents<span class="brand-muted">/atproto</span></span>
  </a>
  <p>MIT licensed.</p>
  <div>
    <a href="https://github.com/svebcomponents/atproto">Source</a>
    <a href="https://www.npmjs.com/org/svebcomponents">npm</a>
    <a href={resolve("/privacy")}>Privacy</a>
    <a href="https://www.microcosm.blue/">Microcosm</a>
  </div>
</footer>

<style>
  .section-body {
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
    min-width: 0;
  }
  #privacy .section-intro > p {
    max-width: 500px;
    margin-top: 1.8rem;
  }
  #privacy .section-intro > .text-link {
    margin-top: 1.1rem;
    display: inline-block;
  }
  .privacy-grid {
    margin: 0;
    display: grid;
    gap: 0.4rem 1rem;
  }
  .privacy-grid dt {
    font-weight: 600;
    color: var(--ink-strong);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .privacy-grid dt:not(:first-of-type) {
    margin-top: 0.9rem;
  }
  .privacy-grid dd {
    margin: 0;
    color: var(--text);
  }
  .pill {
    font-size: 0.66rem;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    font-weight: 600;
    color: var(--accent-deep);
    background: var(--accent-wash);
    border-radius: 999px;
    padding: 0.1rem 0.5rem;
  }
  .footnote {
    font-size: 0.9rem;
    color: var(--text-meta);
  }

  /* One palette for the page. Every colour below is a role, not a shade: the
     surfaces step down from --page, the text steps down from --ink, and the
     accent family is the only hue that carries meaning. The dark card and the
     syntax colours are the one place a second, deeper ground is used. */
  :global(:root) {
    --page: #f2f5fb;
    --surface-raised: #e8eef9;
    --surface-sunken: #e3ebf7;

    --ink: #111a2b;
    --ink-strong: #162033;
    --text: #55637d;
    --text-meta: #6d7c96;

    --line: #d5deee;
    --line-strong: #c2ccdf;

    --accent: #2563eb;
    --accent-deep: #1d4ed8;
    --accent-soft: #7fa4ee;
    --accent-wash: #e3ecfd;
    --accent-band: #c7d9f7;

    --dark: #141b2b;
    --dark-line: #28324a;
    --dark-hover: #222c42;
    --dark-text: #eef2fb;
    --dark-meta: #8d9bb8;
    --dark-link: #8ab4ff;
  }
  :global(*) {
    box-sizing: border-box;
  }

  :global(html) {
    scroll-behavior: smooth;
    color-scheme: light;
  }

  :global(body) {
    margin: 0;
    background: var(--page);
    color: var(--ink);
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
    background: var(--accent);
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
    border-bottom: 1px solid var(--line);
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
    width: auto;
    height: 1.9rem;
  }

  .brand-muted {
    color: var(--text-meta);
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
    color: var(--accent-deep);
  }

  .github-link {
    padding: 0.55rem 0.85rem;
    border: 1px solid var(--line-strong);
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
    min-height: 720px;
    display: grid;
    grid-template-columns: minmax(0, 1.08fr) minmax(0, 0.92fr);
    /* Stretch rather than centre: the thread panel absorbs whatever height the
       snippet needs, so the two cards stay level as the copy changes instead of
       being matched by hand. */
    align-items: stretch;
    gap: clamp(1.25rem, 3vw, 2.5rem);
    padding: 4.5rem 0 6rem;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .kicker {
    margin: 0 0 1.15rem;
    color: var(--accent-deep);
    font-size: 0.76rem;
    font-weight: 800;
    letter-spacing: 0.13em;
    text-transform: uppercase;
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
    max-width: 420px;
    font-size: clamp(2.75rem, 4.6vw, 4.25rem);
  }

  h2 {
    font-size: clamp(3rem, 5vw, 5rem);
  }

  .thread-showcase,
  .hero-code {
    overflow: hidden;
    border-radius: 18px;
    box-shadow: 0 28px 70px rgb(17 26 43 / 0.18);
  }

  .thread-showcase {
    order: 1;
    display: flex;
    flex-direction: column;
    /* A thread only grows. The card stops here and the panel inside it scrolls,
       so the hero keeps its proportions however long the conversation gets.
       The floor is what gives a short thread presence. */
    min-height: 500px;
    max-height: min(80vh, 820px);
    border: 1px solid var(--line);
    background: #fff;
    transform: rotate(-0.7deg);
  }

  .hero-code {
    order: 2;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--dark-line);
    background: var(--dark);
    color: var(--dark-text);
    transform: rotate(0.7deg);
  }

  .showcase-bar,
  .showcase-foot {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.9rem 1rem;
    color: var(--text-meta);
    font:
      0.72rem ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
  }

  .showcase-bar {
    border-bottom: 1px solid var(--line);
  }

  .live-label {
    display: flex;
    align-items: center;
    gap: 0.55rem;
  }

  .showcase-foot {
    border-top: 1px solid var(--line);
  }

  .showcase-link {
    color: var(--accent-deep);
    text-decoration: none;
  }

  .window-bar {
    display: flex;
    justify-content: flex-end;
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid var(--dark-line);
  }

  .copy-button {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.5rem 0.6rem;
    border: none;
    border-radius: 8px;
    background: none;
    color: var(--dark-meta);
    font:
      0.72rem ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
    cursor: pointer;
  }

  .copy-button:hover {
    background: var(--dark-hover);
    color: var(--dark-text);
  }

  .copy-button svg {
    width: 13px;
    height: 13px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  pre {
    margin: 0;
    overflow-x: auto;
    background: var(--dark);
    color: var(--dark-text);
    font:
      0.95rem/1.75 ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
  }

  .thread-panel {
    flex: 1;
    /* Flex items refuse to shrink past their content without this, which would
       push the bar and the footer out through the card's cap. */
    min-height: 0;
    overflow-y: auto;
    background: #f7f8fc;
    color: #172033;
    scrollbar-color: var(--line-strong) transparent;
  }

  /* The demo's own theming, and the values the snippet on the right prints.
     Change one and change the other. */
  .thread-panel :global(atproto-comments) {
    max-height: none;
    overflow: visible;
    padding: clamp(1rem, 3vw, 1.75rem);
    color: #172033;
    font-family:
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    --atproto-comments-accent: #2563eb;
    --atproto-comments-on-accent: #fff;
    --atproto-comments-bg: #fbfcff;
    --atproto-comments-fg: #172033;
    --atproto-comments-muted: #58637a;
    --atproto-comments-border: #ccd7ed;
    --atproto-comments-radius: 4px;
    --atproto-comments-font-size: 0.82rem;
  }

  .thread-panel .demo-unavailable {
    margin: 0;
    padding: clamp(1.4rem, 4vw, 2.5rem);
    color: var(--text);
    font-size: 0.88rem;
    line-height: 1.6;
  }

  .hero-demo-code {
    flex: 1;
    padding: clamp(1.2rem, 3.5vw, 2rem);
    /* Tighter than the page's other code blocks: this one carries three
       snippets, and at the shared 0.95rem/1.75 it towered over the thread. */
    font-size: 0.85rem;
    line-height: 1.62;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .code-tag {
    color: #b99bfa;
  }

  .code-attr {
    color: #7cc3ff;
  }

  .code-string {
    color: #7ddccb;
  }

  .code-foot {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.85rem 1rem;
    border-top: 1px solid var(--dark-line);
    color: var(--dark-meta);
    font:
      0.72rem ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
  }

  .code-foot-link {
    color: var(--dark-link);
    text-decoration: none;
  }

  .pulse {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #65d58d;
    box-shadow: 0 0 0 4px rgb(101 213 141 / 0.12);
  }

  .principles {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
  }

  .principles article {
    padding: 2.6rem clamp(1rem, 3vw, 2.5rem);
  }

  .principles article + article {
    border-left: 1px solid var(--line);
  }

  .number {
    color: var(--accent);
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
  .reference-heading > p {
    color: var(--text);
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
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--surface-raised);
    font-size: 0.87em;
  }

  .default-note {
    display: flex;
    gap: 0.9rem;
    margin-top: 2rem;
    padding: 1rem;
    border-left: 3px solid var(--accent);
    background: var(--surface-raised);
  }

  .default-note > span {
    color: var(--accent);
  }

  .default-note p {
    margin: 0;
    color: var(--text);
    font-size: 0.84rem;
    line-height: 1.6;
  }

  .steps {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: var(--line);
    border: 1px solid var(--line);
  }

  .step {
    display: grid;
    grid-template-columns: 38px 1fr;
    gap: 1rem;
    padding: 1.5rem;
    background: #fff;
  }

  .step-number {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border: 1px solid var(--line-strong);
    border-radius: 50%;
    color: var(--text-meta);
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

  .ssr-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1px;
    align-content: start;
    background: var(--line);
    border: 1px solid var(--line);
  }

  .ssr-card {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 1.5rem;
    background: #fff;
  }

  .ssr-card h3 {
    margin: 0;
  }

  .ssr-card p {
    margin: 0;
    color: var(--text);
    font-size: 0.87rem;
    line-height: 1.55;
  }

  .ssr-card code {
    color: var(--accent-deep);
    font-size: 0.82em;
  }

  .ssr-card .text-link {
    margin-top: auto;
    padding-top: 0.75rem;
  }

  .reference-heading {
    display: grid;
    grid-template-columns: 1fr 0.8fr;
    align-items: end;
    gap: 3rem;
    margin-bottom: 3rem;
  }

  :global(atproto-comments) {
    display: block;
    max-height: min(68vh, 660px);
    overflow: auto;
    padding: clamp(1rem, 4vw, 2.5rem);
    scrollbar-color: var(--line-strong) transparent;
    --atproto-comments-font-size: 0.9rem;
  }

  .architecture {
    display: grid;
    grid-template-columns: 0.65fr 1.35fr;
    gap: clamp(3rem, 7vw, 7rem);
  }

  .flow {
    display: grid;
    grid-template-columns:
      minmax(0, 1.15fr)
      auto
      minmax(0, 1fr)
      auto
      minmax(0, 0.9fr);
    grid-template-rows:
      auto
      minmax(2.75rem, auto)
      auto
      minmax(2.75rem, auto)
      auto;
    gap: 1.25rem 0;
    align-items: center;
  }

  .source-node {
    grid-column: 1;
    grid-row: 1 / span 5;
    align-self: stretch;
  }

  .reads-link {
    grid-column: 2;
    grid-row: 1;
  }

  .appview-node {
    grid-column: 3 / span 3;
    grid-row: 1;
  }

  .writes-link {
    grid-column: 2;
    grid-row: 3;
  }

  .bridge-node {
    grid-column: 3;
    grid-row: 2 / span 4;
    align-self: stretch;
  }

  .writes-far-link {
    grid-column: 4;
    grid-row: 3;
  }

  .pds-node {
    grid-column: 5;
    grid-row: 3;
  }

  .updates-link {
    grid-column: 2;
    grid-row: 5;
  }

  .updates-far-link {
    grid-column: 4;
    grid-row: 5;
  }

  .spacedust-node {
    grid-column: 5;
    grid-row: 5;
  }

  .relay-up-link {
    grid-column: 5;
    grid-row: 2;
    align-self: center;
  }

  .relay-down-link {
    grid-column: 5;
    grid-row: 4;
    align-self: center;
  }

  .flow-link {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    padding: 0 0.6rem;
    text-align: center;
  }

  .flow-link small {
    color: var(--text-meta);
    font-size: 0.66rem;
    line-height: 1.35;
    max-width: 11ch;
  }

  .flow-node {
    min-height: 180px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 1.2rem;
    border: 1px solid var(--line-strong);
    background: #fff;
    text-align: center;
  }

  .flow-node small,
  .flow-node span {
    color: var(--text-meta);
    font-size: 0.7rem;
  }

  .flow-node strong {
    margin: 0.55rem 0;
    letter-spacing: -0.03em;
  }

  .accent-node {
    border-color: var(--accent-soft);
    background: var(--accent-wash);
  }

  .flow-arrow {
    padding: 0 0.6rem;
    color: var(--accent);
  }
  .architecture-notes {
    grid-column: 2;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
    color: var(--text-meta);
    font-size: 0.77rem;
    line-height: 1.5;
  }

  .architecture-notes p {
    margin: 0;
  }

  .architecture-notes strong {
    display: block;
    color: var(--ink-strong);
  }

  .reference {
    width: auto;
    padding-inline: max(1.5rem, calc((100vw - 1180px) / 2));
    background: var(--surface-sunken);
  }

  .table-wrap {
    overflow-x: auto;
    border-top: 1px solid var(--line-strong);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.83rem;
  }

  th,
  td {
    padding: 1rem;
    border-bottom: 1px solid var(--line-strong);
    text-align: left;
    vertical-align: top;
  }

  th {
    color: var(--text-meta);
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  td:nth-child(2),
  td:nth-child(3) {
    white-space: nowrap;
    color: var(--text-meta);
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
    color: var(--text);
    line-height: 1.65;
  }

  .event-list p {
    display: grid;
    grid-template-columns: minmax(180px, 0.7fr) 1fr;
    gap: 1rem;
    margin: 0;
    padding: 0.7rem 0;
    border-bottom: 1px solid var(--line-strong);
    color: var(--text);
    font-size: 0.78rem;
  }

  .event-list code {
    color: var(--accent-deep);
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
    border-left: 1px solid var(--accent-soft);
    color: var(--text);
    font-size: 0.87rem;
    line-height: 1.6;
  }

  .resource-note {
    margin-top: 2rem;
    padding: 1.2rem;
    border: 1px solid var(--line-strong);
    background: var(--surface-raised);
  }

  .resource-note p {
    margin-bottom: 0;
    color: var(--text);
    font-size: 0.8rem;
    line-height: 1.6;
  }

  .self-host-code {
    align-self: start;
    padding: 1.5rem;
    border-radius: 14px;
    background: var(--dark);
    color: var(--dark-text);
    box-shadow: 0 24px 60px rgb(17 26 43 / 0.16);
  }

  .self-host-code pre {
    border: 1px solid var(--dark-line);
  }

  .code-label {
    margin: 0.8rem 0 0.6rem;
    color: var(--dark-meta);
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
    color: var(--accent);
    font-size: 0.82rem;
    font-weight: 700;
    text-decoration: none;
  }

  .self-host-code .text-link {
    color: var(--dark-link);
  }

  footer {
    min-height: 130px;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 2rem;
  }

  footer p {
    color: var(--text-meta);
    font-size: 0.75rem;
    text-align: center;
  }

  footer div {
    justify-content: flex-end;
  }

  /* The flow diagram needs width for its five columns; stack the architecture
     intro above it much earlier than the page's other split sections. */
  @media (max-width: 1180px) {
    .architecture {
      grid-template-columns: 1fr;
      gap: 3rem;
    }

    .architecture-notes {
      grid-column: auto;
    }
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

    .thread-showcase,
    .hero-code {
      transform: none;
    }

    .principles {
      grid-template-columns: 1fr;
    }

    .principles article + article {
      border-top: 1px solid var(--line);
      border-left: 0;
    }

    .reference-heading,
    .events-grid {
      grid-template-columns: 1fr;
    }

    .flow {
      grid-template-columns: 1fr;
      grid-template-rows: none;
      gap: 0;
    }

    .flow > * {
      grid-area: auto;
    }

    .source-node,
    .bridge-node {
      align-self: auto;
    }

    .bridge-node {
      grid-row: auto / span 1;
    }

    .appview-node {
      grid-column: auto / span 1;
    }

    .flow-node {
      min-height: 0;
    }

    .flow-link {
      padding: 0.6rem 0;
    }

    .flow-link {
      padding: 0.35rem 0;
    }

    .flow-arrow {
      padding: 0.35rem;
      transform: rotate(90deg);
      text-align: center;
    }

    /* The relay connectors only make sense in the multi-column layout; the
       notes below the diagram carry that information on small screens. */
    .vertical-link {
      display: none;
    }

    .ssr-grid {
      grid-template-columns: 1fr;
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

    .hero-demo-code {
      font-size: 0.68rem;
    }

    .reference {
      width: auto;
      padding-inline: 1rem;
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
