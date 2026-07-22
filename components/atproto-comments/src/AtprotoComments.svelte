<!-- The tag is declared here (not only in the build) so svelte's tooling
compiles this as a custom element — required for $host() below to pass
svelte-check. auto-options merges the inferred props in; the SSR build strips
the option (and neutralizes $host()) before its plain-component compile. -->
<svelte:options customElement={{ tag: "atproto-comments" }} />

<script lang="ts">
  import { tick } from "svelte";
  import { BROWSER } from "esm-env";
  import {
    viewerPostUrl,
    viewerProfileUrl,
    fetchCommentTree,
    parseThreadRef,
    sortComments,
    ServiceClient,
    ServiceError,
    type CommentNode,
    type CommentSort,
    type CommentTree,
    type ServiceSessionInfo,
  } from "@svebcomponents/atproto.client";

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
    /** web viewer base URL for outbound links (bsky.app by default) — any
     * viewer using bsky.app's URL scheme works (e.g. deer.social). URLs in a
     * preloaded threadData are baked at normalization: pass the same viewer
     * to fetchCommentTree when prefetching. */
    viewer?: string;
    /** hosted OAuth/posting bridge URL — enables in-page sign-in and replies */
    service?: string;
    /** force read-only rendering even when a service is configured */
    readonly?: boolean;
  }

  let {
    thread = "",
    threadData = undefined,
    maxDepth = 6,
    sort = "oldest",
    labels = "collapse",
    appview = "",
    viewer = "",
    service = "",
    readonly = false,
  }: Props = $props();

  let fetched = $state<CommentTree | undefined>(undefined);
  let errorMessage = $state<string | undefined>(undefined);
  let loading = $state(false);
  let retryToken = $state(0);
  let revealedLabeled = $state<string[]>([]);
  /** locally posted replies not yet reflected in a refetched thread, keyed
   * by the uri of the post they reply to (the thread root or any comment) */
  let optimistic = $state<Record<string, CommentNode[]>>({});

  const tree = $derived(threadData ?? fetched);

  /** label for outbound links: "Bluesky" for the default viewer, else its hostname */
  const viewerName = $derived.by(() => {
    if (!viewer) return "Bluesky";
    try {
      return new URL(viewer).hostname;
    } catch {
      return "Bluesky";
    }
  });
  const comments = $derived(
    tree
      ? [
          ...sortComments(tree.comments, sort),
          // locally-posted top-level replies, always last
          ...(optimistic[tree.root.uri] ?? []),
        ]
      : [],
  );

  // --- authenticated posting (only when `service` is set and not readonly) ---
  const MAX_GRAPHEMES = 300;
  const graphemeSegmenter = new Intl.Segmenter(undefined, {
    granularity: "grapheme",
  });
  const countGraphemes = (text: string): number => {
    let count = 0;
    for (const _ of graphemeSegmenter.segment(text)) count += 1;
    return count;
  };

  const writable = $derived(Boolean(service) && !readonly);
  let client = $state<ServiceClient | undefined>(undefined);
  let session = $state<ServiceSessionInfo | null>(null);
  /** the post the composer dialog is replying to; undefined = dialog closed */
  interface ReplyTarget {
    uri: string;
    cid: string;
    /** author handle, for the "Replying to @…" context line; undefined = the thread root */
    handle?: string;
  }
  let replyTarget = $state<ReplyTarget | undefined>(undefined);
  let dialogElement = $state<HTMLDialogElement | undefined>(undefined);
  let draft = $state("");
  let posting = $state(false);
  let postError = $state<string | undefined>(undefined);

  const openComposer = (target: ReplyTarget) => {
    postError = undefined;
    replyTarget = target;
    dialogElement?.showModal();
  };

  // state is cleared via the dialog's `close` event so Esc stays in sync
  const closeComposer = () => dialogElement?.close();

  // the dialog's content renders a tick after showModal(), so the autofocus
  // attribute can't take effect — focus the textarea once it exists (also
  // covers the composer appearing after an in-dialog sign-in)
  $effect(() => {
    if (!replyTarget || !session) return;
    void tick().then(() => dialogElement?.querySelector("textarea")?.focus());
  });

  const rootTarget = (): ReplyTarget | undefined =>
    tree ? { uri: tree.root.uri, cid: tree.root.cid } : undefined;

  const remaining = $derived(MAX_GRAPHEMES - countGraphemes(draft));

  $effect(() => {
    if (!BROWSER || !writable) return;
    const c = new ServiceClient(service);
    client = c;
    c.getSession()
      .then((s) => {
        session = s;
      })
      .catch(() => {
        session = null;
      });
  });

  const signIn = async () => {
    if (!client) return;
    postError = undefined;
    try {
      session = await client.signIn();
      // opened from the header (no target yet): compose a top-level reply.
      // opened from a comment's Reply button: keep that comment as target.
      if (!replyTarget) {
        const target = rootTarget();
        if (target) openComposer(target);
      }
      emit("atproto-comments:signed-in", { session });
    } catch (error) {
      if (error instanceof ServiceError && error.code === "Cancelled") return;
      postError = error instanceof Error ? error.message : "Sign-in failed";
    }
  };

  const signOut = async () => {
    await client?.signOut();
    session = null;
    closeComposer();
  };

  const submitReply = async () => {
    if (
      !client ||
      !tree ||
      !replyTarget ||
      draft.trim().length === 0 ||
      remaining < 0
    )
      return;
    posting = true;
    postError = undefined;
    const text = draft.trim();
    const parent = replyTarget;
    try {
      const posted = await client.postReply({
        root: { uri: tree.root.uri, cid: tree.root.cid },
        parent: { uri: parent.uri, cid: parent.cid },
        text,
      });
      // optimistic append under the parent so the user sees it immediately
      optimistic = {
        ...optimistic,
        [parent.uri]: [
          ...(optimistic[parent.uri] ?? []),
          {
            kind: "comment",
            uri: posted.uri,
            cid: posted.cid,
            author: {
              did: session?.did ?? "",
              handle: session?.handle ?? "you",
              displayName: session?.displayName,
              avatarUrl: session?.avatarUrl,
              profileUrl: viewerProfileUrl(
                session?.handle ?? session?.did ?? "",
                viewer || undefined,
              ),
            },
            text,
            segments: [{ type: "text", text }],
            createdAt: new Date().toISOString(),
            likeCount: 0,
            replyCount: 0,
            labels: [],
            url: viewerPostUrl(posted.uri, session?.handle, viewer || undefined),
            replies: [],
            hasMoreReplies: false,
          },
        ],
      };
      draft = "";
      closeComposer();
      emit("atproto-comments:posted", {
        uri: posted.uri,
        cid: posted.cid,
        parent: parent.uri,
      });
    } catch (error) {
      postError =
        error instanceof Error ? error.message : "Could not post your reply";
    } finally {
      posting = false;
    }
  };

  // dispatched on the host element itself, so consumers listen on
  // <atproto-comments> as documented ($host() is undefined during SSR;
  // emit only runs from client-side effects and handlers)
  const emit = (type: string, detail: unknown) => {
    $host()?.dispatchEvent(new CustomEvent(type, { detail, bubbles: true }));
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
      ...(viewer ? { viewer } : {}),
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
        {#if writable}
          <button
            type="button"
            class="reply-link link-button"
            part="reply-button"
            onclick={() =>
              openComposer({
                uri: node.uri,
                cid: node.cid,
                handle: node.author.handle,
              })}>Reply</button
          >
        {:else}
          <a
            class="reply-link"
            part="reply-button"
            href={node.url}
            target="_blank"
            rel="noopener noreferrer">Reply</a
          >
        {/if}
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
          {@const optimisticReplies = optimistic[node.uri] ?? []}
          {#if (node.replies.length > 0 && depth < maxDepth) || optimisticReplies.length > 0}
            <ul class="replies">
              {#if depth < maxDepth}
                {#each node.replies as reply (reply.kind === "comment" ? reply.uri : `${reply.kind}-${reply.uri}`)}
                  {@render commentNode(reply, depth + 1)}
                {/each}
              {/if}
              <!-- locally posted replies render even past the depth cap: the
                   user must see the comment they just published -->
              {#each optimisticReplies as reply (reply.uri)}
                {@render commentNode(reply, depth + 1)}
              {/each}
            </ul>
          {/if}
          {#if node.hasMoreReplies || (node.replies.length > 0 && depth >= maxDepth)}
            <p class="continue">
              <a href={node.url} target="_blank" rel="noopener noreferrer"
                >Continue this thread on {viewerName} →</a
              >
            </p>
          {/if}
        {/if}
      {/if}
    </li>
  {/if}
{/snippet}

<section class="container" part="container">
  {#if tree}
    <header class="header" part="header">
      <span class="stats">
        ♡ {compactNumber.format(tree.root.likeCount)}
        · 🔁 {compactNumber.format(
          tree.root.repostCount + tree.root.quoteCount,
        )}
        · 💬 {compactNumber.format(tree.root.replyCount)}
      </span>
      {#if writable && session}
        <span class="signed-in" part="signed-in">
          <button
            type="button"
            class="link-button"
            onclick={() => {
              const target = rootTarget();
              if (target) openComposer(target);
            }}
          >
            Reply
          </button>
          <span class="as-handle">@{session.handle ?? "you"}</span>
          <button type="button" class="link-button muted" onclick={signOut}>
            Sign out
          </button>
        </span>
      {:else if writable}
        <button
          type="button"
          class="signin-button"
          part="reply-button"
          onclick={signIn}
        >
          Sign in to comment
        </button>
      {:else}
        <a
          class="reply-cta"
          part="reply-button"
          href={tree.root.url}
          target="_blank"
          rel="noopener noreferrer">Reply on {viewerName}</a
        >
      {/if}
    </header>
    {#if comments.length === 0}
      <p class="empty" part="empty">
        No comments yet.
        <a href={tree.root.url} target="_blank" rel="noopener noreferrer"
          >Be the first to reply on {viewerName}</a
        >
      </p>
    {:else}
      <ul class="comments" part="comments">
        {#each comments as node (node.kind === "comment" ? node.uri : `${node.kind}-${node.uri}`)}
          {@render commentNode(node, 1)}
        {/each}
      </ul>
    {/if}
    <!-- one composer for every reply target (thread root or any comment):
         a modal dialog gives focus trapping, Esc, and a backdrop for free -->
    <dialog
      class="composer-dialog"
      part="dialog"
      bind:this={dialogElement}
      onclose={() => (replyTarget = undefined)}
    >
      {#if replyTarget}
        {#if session}
          <form
            class="composer"
            part="composer"
            onsubmit={(e) => {
              e.preventDefault();
              void submitReply();
            }}
          >
            <p class="composer-context">
              {#if replyTarget.handle}
                Replying to <strong>@{replyTarget.handle}</strong>
              {:else}
                Replying to the post
              {/if}
            </p>
            <textarea
              part="composer-input"
              bind:value={draft}
              rows="3"
              placeholder="Write a reply…"
              disabled={posting}
            ></textarea>
            <p class="composer-notice">
              Posting publicly as <strong>@{session.handle ?? "you"}</strong> from
              your atmosphere account.
            </p>
            {#if postError}
              <p class="composer-error" part="error">{postError}</p>
            {/if}
            <div class="composer-actions">
              <span class="counter" class:over={remaining < 0}>{remaining}</span
              >
              <button
                type="button"
                class="link-button muted"
                onclick={closeComposer}
              >
                Cancel
              </button>
              <button
                type="submit"
                class="post-button"
                disabled={posting || draft.trim().length === 0 || remaining < 0}
              >
                {posting ? "Posting…" : "Post reply"}
              </button>
            </div>
          </form>
        {:else}
          <div class="composer signin-prompt" part="composer">
            <p class="composer-notice">
              {#if replyTarget.handle}
                Sign in with your atmosphere account to reply to
                <strong>@{replyTarget.handle}</strong>.
              {:else}
                Sign in with your atmosphere account to join the conversation.
              {/if}
            </p>
            {#if postError}
              <p class="composer-error" part="error">{postError}</p>
            {/if}
            <div class="composer-actions">
              <button
                type="button"
                class="link-button muted"
                onclick={closeComposer}
              >
                Cancel
              </button>
              <button type="button" class="signin-button" onclick={signIn}>
                Sign in
              </button>
            </div>
          </div>
        {/if}
      {/if}
    </dialog>
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
  .signed-in {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875em;
  }
  .as-handle {
    color: var(--atproto-comments-muted, light-dark(#666, #999));
  }
  .signin-button,
  .post-button {
    font: inherit;
    font-size: 0.875em;
    padding: 0.4em 0.9em;
    border-radius: var(--atproto-comments-radius, 8px);
    border: none;
    background: var(--atproto-comments-accent, #2864ff);
    color: var(--atproto-comments-on-accent, #fff);
    cursor: pointer;
  }
  .signin-button:disabled,
  .post-button:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .link-button {
    font: inherit;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: var(--atproto-comments-accent, #2864ff);
  }
  .link-button.muted {
    color: var(--atproto-comments-muted, light-dark(#666, #999));
  }
  .composer-dialog {
    /* the dialog inherits nothing from the page by default — restate the
       component's typography so the composer matches the comment list */
    font-family: inherit;
    font-size: var(--atproto-comments-font-size, 0.9375rem);
    color: var(--atproto-comments-fg, light-dark(#1a1a1a, #ececec));
    width: min(92vw, 32rem);
    box-sizing: border-box;
    padding: 1rem;
    border: 1px solid var(--atproto-comments-border, light-dark(#e0e0e0, #333));
    border-radius: var(--atproto-comments-radius, 8px);
    background: var(--atproto-comments-bg, light-dark(#fff, #1c1c1e));
    box-shadow: 0 12px 40px light-dark(rgb(0 0 0 / 0.18), rgb(0 0 0 / 0.6));
  }
  .composer-dialog::backdrop {
    background: light-dark(rgb(0 0 0 / 0.3), rgb(0 0 0 / 0.55));
  }
  .composer {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .composer-context {
    margin: 0;
    font-size: 0.875em;
    color: var(--atproto-comments-muted, light-dark(#666, #999));
  }
  .composer-context strong {
    color: inherit;
  }
  .composer textarea {
    font: inherit;
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    padding: 0.6em;
    border-radius: var(--atproto-comments-radius, 8px);
    border: 1px solid var(--atproto-comments-border, light-dark(#ccc, #444));
    background: transparent;
    color: inherit;
  }
  .composer-notice {
    margin: 0;
    font-size: 0.8125em;
    color: var(--atproto-comments-muted, light-dark(#666, #999));
  }
  .composer-error {
    margin: 0;
    font-size: 0.8125em;
    color: var(--atproto-comments-error, #c0392b);
  }
  .composer-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    justify-content: flex-end;
  }
  .counter {
    margin-right: auto;
    font-size: 0.8125em;
    color: var(--atproto-comments-muted, light-dark(#666, #999));
    font-variant-numeric: tabular-nums;
  }
  .counter.over {
    color: var(--atproto-comments-error, #c0392b);
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
