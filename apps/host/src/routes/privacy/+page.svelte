<script lang="ts">
  import { resolve } from "$app/paths";

  // Read this before changing what the service stores or logs — this page
  // has to keep matching the code, including the retention table below.
  // Two statements here are load-bearing and are true only as long as
  // nobody adds request logging: the service writes no access log, and no
  // IP address is ever written to disk. Deployment notes live in
  // apps/host/deploy/.
  const lastUpdated = "24 August 2026";
  const contact = "svebcomponents@theosteiner.de";

  const consentSnippet = `const comments = document.querySelector("atproto-comments");
comments.live = "off";
onConsent((granted) => (comments.live = granted ? "all" : "off"));`;
</script>

<svelte:head>
  <title>Privacy — atproto-comments bridge</title>
  <meta
    name="description"
    content="What the atproto-comments bridge at atproto.svebcomponents.dev receives, why, how long it keeps it, and how to have it deleted."
  />
  <meta name="robots" content="index" />
</svelte:head>

<main>
  <header class="masthead">
    <p class="eyebrow">atproto.svebcomponents.dev</p>
    <h1>Privacy</h1>
    <p class="standfirst">
      This page covers the hosted <strong>atproto-comments bridge</strong> — the
      service that handles sign-in, posting, and live updates for comment
      sections built with
      <a href={resolve("/")}>atproto-comments</a>. It is written for two
      audiences: people who read or comment on a site using it, and people who
      run such a site.
    </p>
    <p class="meta">Last updated {lastUpdated}</p>
  </header>

  <section>
    <h2>The short version</h2>
    <ul class="lede-list">
      <li>
        <strong>Your comments are never stored here.</strong> Replies, likes and reposts
        are written straight to your own ATProto repository through your own provider.
        The bridge passes them along and keeps no copy.
      </li>
      <li>
        <strong
          >If you don't sign in, the bridge usually never hears from you.</strong
        > On a default installation, a signed-out reader's browser makes no request
        to this service at all.
      </li>
      <li>
        <strong>Signing out actually signs you out.</strong> It ends your session
        and revokes the bridge's authorization to act on your account.
      </li>
      <li>
        <strong
          >No advertising, no analytics, no profiling, no sale of data.</strong
        >
      </li>
    </ul>
  </section>

  <section>
    <h2>Who is responsible</h2>
    <p>
      The bridge is operated by <strong>Theodor Baltus Steiner</strong>. For
      anything on this page, write to <a href="mailto:{contact}">{contact}</a>;
      that mailbox is monitored and is the fastest way to reach a person.
    </p>
    <p class="note">
      Under the GDPR, the operator of a site that embeds the component and the
      operator of this bridge are likely <strong>joint controllers</strong> for
      the data that reaches the bridge from that site — the site decided to
      embed it, this service receives the result. The essence of that
      arrangement is set out in <a href="#site-operators">For site operators</a>
      below.
    </p>
  </section>

  <section>
    <h2>What the bridge receives, and when</h2>

    <h3>If you only read comments</h3>
    <p>
      On a default installation (<code>live="signed-in"</code>) nothing is sent
      to this service. Comments are fetched from an AppView — Bluesky's public
      AppView unless the site sets another — or rendered by the site's own
      server before the page reaches you.
    </p>
    <p>
      A site can choose to switch live updates on for everyone (<code
        >live="all"</code
      >). Where it has, your browser holds an open connection to this service
      for as long as you're on the page, and we receive your
      <strong>IP address</strong>, your <strong>browser's user agent</strong>,
      and <strong>which discussion thread</strong> you are reading. That is enough
      to infer which page you're on. It is not used to build a profile and is not
      combined with anything else. Sites are asked to disclose this; if you'd rather
      not be included, this connection is what a site's consent banner should be controlling.
    </p>

    <h3>If you sign in</h3>
    <p>To let you post from the page, the bridge stores:</p>
    <ul>
      <li>
        your <strong>DID</strong>, handle, display name and avatar URL — the
        public parts of your ATProto profile;
      </li>
      <li>
        the <strong>website</strong> you signed in on, so a session for one site cannot
        be used on another;
      </li>
      <li>
        an <strong>authorization token set</strong> from your provider, which is what
        allows the bridge to post as you when you ask it to;
      </li>
    </ul>
    <p>
      Your password never reaches this service. Sign-in happens on your own
      provider's site, and the bridge only ever receives the authorization that
      results from it.
    </p>

    <h3>What is counted</h3>
    <p>
      The service keeps running totals so its operator can see how much it is
      being used: how many websites use it, and how many sign-ins, replies,
      reactions and live connections there have been, grouped by website and by
      day. These are counts about <em>sites</em>, not about people — there is no
      visitor count, because counting distinct people would need an identifier
      per person and that is precisely what is not kept.
    </p>
    <p>
      The totals are published on the
      <a href={resolve("/")}>front page</a>, without the list of which sites
      they came from.
    </p>

    <h3>What is never collected</h3>
    <p>
      No comment text, no cookies for advertising or analytics, no tracking
      across sites, no data about you from anywhere other than the requests your
      browser makes and the public profile attached to the account you sign in
      with.
    </p>
  </section>

  <section id="bases">
    <h2>Why — the legal bases</h2>
    <div class="table-scroll">
      <table>
        <thead>
          <tr><th>What</th><th>Why</th><th>Basis (GDPR Art. 6)</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Sign-in, sessions, posting</td>
            <td>You asked to sign in and post; it cannot work otherwise</td>
            <td>(b) performance of a service you requested</td>
          </tr>
          <tr>
            <td>Live updates for signed-in readers</td>
            <td>Part of the service you signed in to</td>
            <td>(b), and (f) legitimate interests</td>
          </tr>
          <tr>
            <td>Live updates where a site enabled them for everyone</td>
            <td
              >Delivering a feature the site chose, in a way that keeps the data
              minimal</td
            >
            <td
              >(f) legitimate interests — or consent, where the site collects it</td
            >
          </tr>
          <tr>
            <td>Counting sites and actions</td>
            <td
              >Knowing how much the service is used and whether it is coping.
              Counts websites, not people</td
            >
            <td>(f) legitimate interests</td>
          </tr>
          <tr>
            <td>Diagnostic output (crashes, restarts)</td>
            <td
              >Knowing when the service is broken. Contains no visitor data —
              see below</td
            >
            <td>(f) legitimate interests</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="note">
      Where a site's consent banner controls the comment section, that consent
      governs. You can object to processing based on legitimate interests at any
      time — see <a href="#rights">Your rights</a>.
    </p>
  </section>

  <section>
    <h2>How long it is kept</h2>
    <div class="table-scroll">
      <table>
        <thead><tr><th>Data</th><th>Kept for</th></tr></thead>
        <tbody>
          <tr
            ><td>Sign-in session</td><td
              >Access tokens last 1 hour each and are renewed automatically
              while you're active. The session record is deleted the moment you
              sign out, and expires on its own after 30 days without a visit.</td
            ></tr
          >
          <tr
            ><td>Authorization token set</td><td
              >Until you sign out, or 30 days unused — whichever comes first</td
            ></tr
          >
          <tr><td>Pending sign-in state</td><td>10 minutes</td></tr>
          <tr
            ><td>Sign-in handoff record</td><td
              >2 minutes, and deleted the moment it is collected</td
            ></tr
          >
          <tr
            ><td>Live-update connections</td><td
              >Held in memory only, for the length of the connection. Nothing is
              written to disk.</td
            ></tr
          >
          <tr
            ><td>Request and access logs</td><td
              >None are kept. The service writes no access log, and no IP
              address is ever written to disk.</td
            ></tr
          >
          <tr
            ><td>Operational counters</td><td
              >Kept indefinitely. One row per embedding site per day holding
              counts — no IP address, user agent, thread, or per-reader record.</td
            ></tr
          >
          <tr
            ><td>Diagnostic output</td><td
              >Crash and restart messages go to the system journal and are
              discarded after 30 days. They contain no visitor data.</td
            ></tr
          >
        </tbody>
      </table>
    </div>
  </section>

  <section id="recipients">
    <h2>Who else is involved</h2>
    <ul>
      <li>
        <strong>Your ATProto provider (PDS).</strong> Sign-in happens there and your
        posts are written there. Its own policy governs.
      </li>
      <li>
        <strong>An AppView — Bluesky's by default.</strong> Public comment
        content and profile pictures are fetched from an AppView and its CDN.
        Because avatars load directly in your browser, that AppView receives
        your IP address when a comment section renders — whether or not you sign
        in, and whether or not live updates are on. Sites choose which AppView
        via the component's
        <code>appview</code> property; unset, it is Bluesky's public AppView. This
        is inherent to displaying ATProto content and is not something this service
        mediates.
      </li>
      <li>
        <strong>Microcosm Spacedust.</strong> The bridge subscribes to this
        public firehose to learn when a reply appears. It is told which threads
        are being watched. It is <em>not</em> told anything about you — your browser
        never contacts it.
      </li>
      <li>
        <strong>exe.dev, hosting.</strong> Runs the server, and so processes data
        on the operator's behalf. Requests reach the server through exe.dev's own
        edge, which may record ordinary connection metadata under its own policy —
        that layer is outside this service's control.
      </li>
    </ul>
    <p class="note">
      No data is sold, shared for advertising, or handed to anyone else except
      where the law requires it.
    </p>
  </section>

  <section>
    <h2>Where the bridge runs</h2>
    <p>
      The service is operated from Japan and the server runs in
      <strong>Tokyo, Japan</strong>.
    </p>
    <p>
      Japan is recognised by the European Commission as providing an adequate
      level of data protection, so personal data reaching this service from the
      EU or EEA does not depend on Standard Contractual Clauses or any
      additional safeguard.
    </p>
  </section>

  <section id="rights">
    <h2>Your rights</h2>
    <p>
      If you are in the EU, EEA or UK you have the right to access a copy of
      your data, correct it, have it deleted, restrict or object to its
      processing, receive it in a portable form, and withdraw consent where
      consent was the basis. Exercising any of these costs nothing and will not
      make the service worse for you.
    </p>
    <p>
      <strong>The fastest route is the sign-out button.</strong> It deletes your
      session and revokes the bridge's authorization on your account in one
      step. To have anything else removed, write to
      <a href="mailto:{contact}">{contact}</a> — please include the handle or DID
      you signed in with.
    </p>
    <p>
      Deleting a comment is different: your replies live in your own repository,
      not here, so delete them the way you would any other post, from your
      ATProto client. Nothing needs to be asked of this service.
    </p>
    <p>
      You can also complain to a supervisory authority — in the EU, the one for
      the country you live or work in.
    </p>
    <p>
      This service is operated from Japan and is also subject to the Act on the
      Protection of Personal Information (APPI). If you are in Japan, requests
      to disclose, correct, or stop using your personal information go to the
      same address, and the purposes it is used for are the ones set out under
      <a href="#bases">the legal bases</a>. Nothing is provided to a third party
      except as described under <a href="#recipients">who else is involved</a>.
    </p>
  </section>

  <section id="site-operators">
    <h2>For site operators</h2>
    <p>
      If you embed <code>&lt;atproto-comments&gt;</code> pointed at this bridge,
      you are making a decision about your readers' data, and in the EU that
      most likely makes you a joint controller with the bridge operator for what
      reaches it from your site. Embedding a widget that calls a third party
      makes you a joint controller for what it sends (<em>Fashion ID</em>,
      C-40/17), and IP addresses are personal data (<em>Breyer</em>, C-582/14).
      The default keeps signed-out readers out of scope entirely.
    </p>
    <ul>
      <li>
        <strong>Keep the default.</strong> With <code>live="signed-in"</code>,
        signed-out readers never contact this service, and the readers who do
        have opted in by signing in. This is the configuration with the least
        for you to disclose.
      </li>
      <li>
        <strong>If you set <code>live="all"</code>,</strong> say so in your
        privacy policy: readers' IP addresses go to this service, and link here.
        Or wire the <code>live</code> attribute to your consent banner instead —
        it can be changed at runtime and takes effect immediately, in both
        directions.
        <pre><code>{consentSnippet}</code></pre>
      </li>
      <li>
        <strong>Mention the AppView either way.</strong> Avatars load from the
        AppView's CDN for every reader regardless of configuration — Bluesky's
        unless you set <code>appview</code>.
      </li>
      <li>
        <strong>Self-host to avoid all of this.</strong> Point
        <code>service</code> at your own deployment and no third party is
        involved. See <a href="{resolve('/')}#self-host">running your own</a>.
      </li>
      <li>
        <strong>Need a written arrangement?</strong> Write to
        <a href="mailto:{contact}">{contact}</a> and one can be provided.
      </li>
    </ul>
  </section>

  <section>
    <h2>Changes</h2>
    <p>
      If what the service collects changes, this page changes with it and the
      date at the top moves. Material changes will be noted in the project's
      release notes so they show up where developers will actually see them.
    </p>
  </section>

  <footer>
    <a href={resolve("/")}>← atproto-comments</a>
  </footer>
</main>

<style>
  :global(:root) {
    --page: #f2f5fb;
    --ink: #111a2b;
    --text: #55637d;
    --text-meta: #6d7c96;
    --line: #d5deee;
    --accent: #2563eb;
    --accent-deep: #1d4ed8;
    --accent-wash: #e3ecfd;
  }
  :global(*) {
    box-sizing: border-box;
  }
  :global(html) {
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
    line-height: 1.65;
  }

  main {
    max-width: 46rem;
    margin: 0 auto;
    padding: 4rem 1.5rem 6rem;
    display: flex;
    flex-direction: column;
    gap: 3rem;
  }

  .masthead {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    border-bottom: 2px solid var(--ink);
    padding-bottom: 1.75rem;
  }
  .eyebrow {
    margin: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.78rem;
    letter-spacing: 0.08em;
    color: var(--text-meta);
  }
  h1 {
    margin: 0;
    font-size: clamp(2.2rem, 6vw, 3rem);
    line-height: 1.1;
    letter-spacing: -0.02em;
  }
  .standfirst {
    margin: 0;
    font-size: 1.08rem;
    color: var(--text);
  }
  .meta {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-meta);
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  h2 {
    margin: 0;
    font-size: 1.5rem;
    letter-spacing: -0.01em;
    line-height: 1.2;
  }
  h3 {
    margin: 0.6rem 0 0;
    font-size: 1.05rem;
    letter-spacing: -0.005em;
  }
  p {
    margin: 0;
    color: var(--text);
  }
  ul {
    margin: 0;
    padding-left: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    color: var(--text);
  }
  .lede-list {
    padding-left: 1.1rem;
  }
  strong {
    color: var(--ink);
    font-weight: 600;
  }
  a {
    color: var(--accent-deep);
  }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.88em;
    background: var(--accent-wash);
    border-radius: 3px;
    padding: 0.08em 0.32em;
  }

  pre {
    margin: 0.7rem 0 0;
    overflow-x: auto;
    background: var(--accent-wash);
    border-radius: 4px;
    padding: 0.75rem 0.9rem;
    font-size: 0.84rem;
    line-height: 1.55;
  }
  pre code {
    background: none;
    padding: 0;
    font-size: inherit;
  }

  .note {
    border-left: 3px solid var(--accent);
    padding: 0.55rem 0 0.55rem 0.95rem;
    font-size: 0.94rem;
  }

  .table-scroll {
    overflow-x: auto;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: #fff;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    min-width: 32rem;
  }
  th {
    text-align: left;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-meta);
    font-weight: 600;
    padding: 0.7rem 0.9rem;
    border-bottom: 1px solid var(--line);
  }
  td {
    padding: 0.7rem 0.9rem;
    border-bottom: 1px solid var(--line);
    vertical-align: top;
    font-size: 0.92rem;
    color: var(--text);
  }
  tr:last-child td {
    border-bottom: none;
  }

  footer {
    border-top: 1px solid var(--line);
    padding-top: 1.25rem;
    font-size: 0.9rem;
  }
</style>
