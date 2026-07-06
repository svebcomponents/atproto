<script lang="ts">
  import { onMount } from "svelte";

  // Import the client build only in the browser: the compiled custom-element
  // code needs DOM globals at module-eval time, and importing it statically
  // here lands it in a server chunk that evaluates before hooks.server.ts can
  // install @svebcomponents/ssr's DOM shim (rollup chunk-order hazard).
  onMount(() => void import("atproto-comments"));

  // Placeholder discussion root; replaced with a real post during Phase 1.
  const thread =
    "at://did:plc:ewvi7nxzyoun6zhxrhs64oiz/app.bsky.feed.post/3k44deefqdk2g";
</script>

<h1>atproto-comments showcase</h1>

<atproto-comments {thread}></atproto-comments>
