<script lang="ts">
  import "atproto-comments";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<main>
  <h1>atproto-comments showcase</h1>
  <p>
    Comments below are a live Bluesky thread, server-rendered into declarative
    shadow DOM and hydrated in place. Pass <code>?thread=</code> an
    <code>at://</code> URI or bsky.app post URL to render another thread.
  </p>

  <atproto-comments
    thread={data.thread}
    threadData={data.threadData ?? undefined}
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
