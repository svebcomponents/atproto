<!-- threadData is rich data: never reflect it back to an attribute, and use
the Object converter so `thread-data` attribute usage (inline JSON) works.
auto-options preserves these explicit options and infers the rest. -->
<svelte:options
  customElement={{
    props: {
      threadData: { attribute: "thread-data", reflect: false, type: "Object" },
    },
  }}
/>

<script lang="ts">
  import { BROWSER } from "esm-env";
  import {
    fetchCommentTree,
    parseThreadRef,
    sortComments,
    type CommentNode,
    type CommentSort,
    type CommentTree,
  } from "@atproto-comments/client";

  interface Props {
    /** AT URI (at://…) or bsky.app post URL of the discussion root */
    thread?: string;
    /** preloaded thread (SSR / build-time prefetch) — skips client fetching */
    threadData?: CommentTree | undefined;
    /** maximum nested reply depth to render */
    maxDepth?: number;
    /** comment ordering */
    sort?: CommentSort;
    /** policy for posts carrying moderation labels */
    labels?: "hide" | "collapse" | "show";
    /** AppView base URL override */
    appview?: string;
  }

  let {
    thread = "",
    threadData = undefined,
    maxDepth = 6,
    sort = "oldest",
    labels = "collapse",
    appview = "",
  }: Props = $props();

  let fetched = $state<CommentTree | undefined>(undefined);
  let errorMessage = $state<string | undefined>(undefined);
  let loading = $state(false);
  let retryToken = $state(0);
  let revealedLabeled = $state<string[]>([]);
  let container = $state<HTMLElement | undefined>(undefined);

  const tree = $derived(threadData ?? fetched);
  const comments = $derived(tree ? sortComments(tree.comments, sort) : []);

  // events dispatched from an inner node with composed: true retarget to the
  // host element, so consumers listen on <atproto-comments> as documented.
  // ($host() is unavailable here: the SSR build compiles with customElement
  // disabled.)
  const emit = (type: string, detail: unknown) => {
    container?.dispatchEvent(
      new CustomEvent(type, { detail, bubbles: true, composed: true }),
    );
  };

  $effect(() => {
    // reference so the retry button can re-trigger this effect
    void retryToken;
    if (!BROWSER || threadData || !thread) return;
    if (!parseThreadRef(thread)) {
      errorMessage = `Not a valid AT URI or bsky.app post URL: ${thread}`;
      return;
    }
    const controller = new AbortController();
    loading = true;
    errorMessage = undefined;
    fetchCommentTree(thread, {
      signal: controller.signal,
      ...(appview ? { appView: appview } : {}),
    })
      .then((result) => {
        fetched = result;
        emit("atproto-comments:loaded", { tree: result });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        errorMessage =
          error instanceof Error ? error.message : "Failed to load comments";
        emit("atproto-comments:error", { message: errorMessage });
      })
      .finally(() => {
        if (!controller.signal.aborted) loading = false;
      });
    return () => controller.abort();
  });

  const compactNumber = new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  });

  const relativeFormat = new Intl.RelativeTimeFormat(undefined, {
    numeric: "auto",
  });

  const DIVISIONS: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "seconds"],
    [60, "minutes"],
    [24, "hours"],
    [7, "days"],
    [4.34524, "weeks"],
    [12, "months"],
    [Number.POSITIVE_INFINITY, "years"],
  ];

  const relativeTime = (iso: string): string => {
    const timestamp = Date.parse(iso);
    if (Number.isNaN(timestamp)) return "";
    let duration = (timestamp - Date.now()) / 1000;
    for (const [amount, unit] of DIVISIONS) {
      if (Math.abs(duration) < amount) {
        return relativeFormat.format(Math.round(duration), unit);
      }
      duration /= amount;
    }
    return "";
  };

  const absoluteTime = (iso: string): string => {
    const timestamp = Date.parse(iso);
    return Number.isNaN(timestamp) ? "" : new Date(timestamp).toLocaleString();
  };

  const isCollapsed = (node: CommentNode): boolean =>
    node.kind === "comment" &&
    node.labels.length > 0 &&
    labels === "collapse" &&
    !revealedLabeled.includes(node.uri);

  const isHidden = (node: CommentNode): boolean =>
    node.kind === "comment" && node.labels.length > 0 && labels === "hide";
</script>

{#snippet commentBody(node: Extract<CommentNode, { kind: "comment" }>)}
  <div class="comment-main">
    {#if node.author.avatarUrl}
      <img
        class="avatar"
        part="avatar"
        src={node.author.avatarUrl}
        alt=""
        loading="lazy"
        decoding="async"
      />
    {:else}
      <span class="avatar avatar-fallback" part="avatar" aria-hidden="true"
        >{(node.author.displayName ?? node.author.handle).slice(0, 1)}</span
      >
    {/if}
    <div class="comment-content">
      <p class="comment-meta">
        <a
          class="author"
          part="author"
          href={node.author.profileUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {node.author.displayName || node.author.handle}
        </a>
        <span class="handle" part="handle">@{node.author.handle}</span>
        <a
          class="timestamp"
          part="timestamp"
          href={node.url}
          target="_blank"
          rel="noopener noreferrer"
          title={absoluteTime(node.createdAt)}
        >
          <time datetime={node.createdAt}>{relativeTime(node.createdAt)}</time>
        </a>
      </p>
      <p class="body" part="body">
        {#each node.segments as segment, i (i)}
          {#if segment.type === "text"}{segment.text}{:else}<a
              href={segment.href}
              target="_blank"
              rel="noopener noreferrer nofollow">{segment.text}</a
            >{/if}
        {/each}
      </p>
      <p class="actions" part="actions">
        {#if node.likeCount > 0}
          <span class="likes">♡ {compactNumber.format(node.likeCount)}</span>
        {/if}
        <a
          class="reply-link"
          part="reply-button"
          href={node.url}
          target="_blank"
          rel="noopener noreferrer">Reply on Bluesky</a
        >
      </p>
    </div>
  </div>
{/snippet}

{#snippet commentNode(node: CommentNode, depth: number)}
  {#if !isHidden(node)}
    <li class="comment" part="comment">
      {#if node.kind === "blocked"}
        <p class="tombstone" part="tombstone">Comment unavailable</p>
      {:else if node.kind === "not-found"}
        <p class="tombstone" part="tombstone">Comment deleted</p>
      {:else if isCollapsed(node)}
        <p class="tombstone labeled" part="moderation-label">
          Hidden by moderation label ({node.labels.join(", ")})
          <button
            type="button"
            onclick={() => (revealedLabeled = [...revealedLabeled, node.uri])}
            >Show anyway</button
          >
        </p>
      {:else}
        {@render commentBody(node)}
        {#if node.kind === "comment"}
          {#if node.replies.length > 0 && depth < maxDepth}
            <ul class="replies">
              {#each node.replies as reply (reply.kind === "comment" ? reply.uri : `${reply.kind}-${reply.uri}`)}
                {@render commentNode(reply, depth + 1)}
              {/each}
            </ul>
          {:else if node.hasMoreReplies || (node.replies.length > 0 && depth >= maxDepth)}
            <p class="continue">
              <a href={node.url} target="_blank" rel="noopener noreferrer"
                >Continue this thread on Bluesky →</a
              >
            </p>
          {/if}
        {/if}
      {/if}
    </li>
  {/if}
{/snippet}

<section class="container" part="container" bind:this={container}>
  {#if tree}
    <header class="header" part="header">
      <span class="stats">
        ♡ {compactNumber.format(tree.root.likeCount)}
        · 🔁 {compactNumber.format(tree.root.repostCount + tree.root.quoteCount)}
        · 💬 {compactNumber.format(tree.root.replyCount)}
      </span>
      <a
        class="reply-cta"
        part="reply-button"
        href={tree.root.url}
        target="_blank"
        rel="noopener noreferrer">Reply on Bluesky</a
      >
    </header>
    {#if comments.length === 0}
      <p class="empty" part="empty">
        No comments yet.
        <a href={tree.root.url} target="_blank" rel="noopener noreferrer"
          >Be the first to reply on Bluesky</a
        >
      </p>
    {:else}
      <ul class="comments" part="comments">
        {#each comments as node (node.kind === "comment" ? node.uri : `${node.kind}-${node.uri}`)}
          {@render commentNode(node, 1)}
        {/each}
      </ul>
    {/if}
  {:else if errorMessage}
    <p class="error" part="error">
      Could not load comments: {errorMessage}
      <button type="button" onclick={() => (retryToken += 1)}>Retry</button>
    </p>
  {:else if loading || thread}
    <div class="skeleton" part="skeleton" aria-hidden="true">
      {#each [0, 1, 2] as i (i)}
        <div class="skeleton-row">
          <span class="avatar skeleton-block"></span>
          <span class="skeleton-lines">
            <span class="skeleton-block line"></span>
            <span class="skeleton-block line short"></span>
          </span>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .container {
    font-family: inherit;
    color: inherit;
    font-size: var(--atproto-comments-font-size, 0.9375rem);
    line-height: 1.5;
  }
  a {
    color: var(--atproto-comments-accent, #2864ff);
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding-block: 0.5rem;
    border-bottom: 1px solid
      var(--atproto-comments-border, light-dark(#e0e0e0, #333));
  }
  .stats {
    color: var(--atproto-comments-muted, light-dark(#666, #999));
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .replies {
    margin-inline-start: 1rem;
    padding-inline-start: 1rem;
    border-inline-start: 2px solid
      var(--atproto-comments-border, light-dark(#e0e0e0, #333));
  }
  .comment {
    margin-block: 1rem;
  }
  .comment-main {
    display: flex;
    gap: 0.625rem;
  }
  .avatar {
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    flex-shrink: 0;
    background: var(--atproto-comments-border, light-dark(#e0e0e0, #333));
    object-fit: cover;
  }
  .avatar-fallback {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-transform: uppercase;
    color: var(--atproto-comments-muted, light-dark(#666, #999));
  }
  .comment-content {
    min-width: 0;
  }
  .comment-meta,
  .body,
  .actions,
  .continue,
  .tombstone,
  .empty,
  .error {
    margin: 0;
  }
  .comment-meta {
    display: flex;
    flex-wrap: wrap;
    column-gap: 0.5rem;
    align-items: baseline;
  }
  .author {
    font-weight: 600;
    color: inherit;
  }
  .handle,
  .timestamp,
  .likes {
    color: var(--atproto-comments-muted, light-dark(#666, #999));
    font-size: 0.875em;
  }
  .body {
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
  .actions {
    display: flex;
    gap: 0.75rem;
    font-size: 0.875em;
    margin-block-start: 0.25rem;
  }
  .tombstone {
    color: var(--atproto-comments-muted, light-dark(#666, #999));
    font-style: italic;
  }
  .tombstone button,
  .error button {
    font: inherit;
    font-style: normal;
    color: var(--atproto-comments-accent, #2864ff);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .continue {
    margin-block-start: 0.25rem;
    font-size: 0.875em;
  }
  .empty,
  .error {
    padding-block: 1rem;
    color: var(--atproto-comments-muted, light-dark(#666, #999));
  }
  .skeleton {
    padding-block: 1rem;
  }
  .skeleton-row {
    display: flex;
    gap: 0.625rem;
    margin-block-end: 1rem;
  }
  .skeleton-lines {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding-block: 0.25rem;
  }
  .skeleton-block {
    background: var(--atproto-comments-border, light-dark(#e8e8e8, #2a2a2a));
    border-radius: 4px;
    animation: atproto-comments-pulse 1.4s ease-in-out infinite;
  }
  .line {
    height: 0.75rem;
    width: 100%;
  }
  .line.short {
    width: 55%;
  }
  @keyframes atproto-comments-pulse {
    50% {
      opacity: 0.45;
    }
  }
</style>
