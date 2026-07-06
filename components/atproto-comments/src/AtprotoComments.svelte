<script lang="ts">
  import { parseThreadRef } from "@atproto-comments/client";

  let {
    thread = "",
  }: {
    /** AT URI (at://…) or bsky.app post URL identifying the discussion root */
    thread: string;
  } = $props();

  const threadRef = $derived(thread ? parseThreadRef(thread) : undefined);
</script>

<section part="container">
  {#if threadRef}
    <p part="header">
      Comments for <code>{threadRef.uri ?? thread}</code> — thread rendering
      lands in Phase 1.
    </p>
  {:else if thread}
    <p part="header">
      Could not parse <code>{thread}</code> as an AT URI or bsky.app post URL.
    </p>
  {/if}
</section>

<style>
  section {
    font-family: inherit;
    color: inherit;
  }
  code {
    font-size: 0.875em;
    color: var(--atproto-comments-muted, light-dark(#666, #999));
  }
</style>
