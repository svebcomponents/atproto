<script lang="ts">
  import { page } from "$app/state";
  import "atproto-comments";
  import { getThread } from "./thread.remote";

  // @bsky.app's v1.125 announcement — a lively thread. Override with
  // ?thread=<at-uri or bsky.app URL>.
  const DEFAULT_THREAD =
    "at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.post/3mojb23vtt22c";

  const threadUri = $derived(
    page.url.searchParams.get("thread") ?? DEFAULT_THREAD,
  );

  // Awaited during SSR (experimental.async): the component renders with the
  // thread already loaded — no client refetch, no flash — via the remote
  // `getThread` query. Null on failure → the component self-fetches (Tier 3).
  const threadData = $derived(await getThread(threadUri));
</script>

<main>
  <h1>atproto-comments showcase</h1>
  <p>
    Comments below are a live atmosphere thread, prefetched by a SvelteKit
    remote function, server-rendered into declarative shadow DOM, and hydrated
    in place. Pass <code>?thread=</code> an <code>at://</code> URI or bsky.app
    post URL to render another thread. Sign in with your atmosphere account to
    reply directly — the reply is posted to your own repo via the hosted bridge
    at
    <code>/atproto</code>.
  </p>

  <atproto-comments
    thread={threadUri}
    threadData={threadData ?? undefined}
    service="/atproto"
  ></atproto-comments>
</main>

<style>
  main {
    max-width: 42rem;
    margin: 0 auto;
    padding: 2rem 1rem;
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
  }
  code {
    background: light-dark(#f0f0f0, #2a2a2a);
    padding: 0.1em 0.3em;
    border-radius: 4px;
  }
</style>
