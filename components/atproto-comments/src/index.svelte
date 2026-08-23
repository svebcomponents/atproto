<svelte:options customElement="atproto-comments" />

<!-- @component
Renders an ATProto/Bluesky post thread as a live comment section.

Every event below is dispatched on the host element through one shared helper,
so the build's source scan cannot see them; they are declared here instead.
Their `detail` is therefore typed `unknown` — the shapes are documented in the
package README.

@event atproto-comments:loaded - The first thread snapshot finished loading. `detail: { tree: CommentTree }`
@event atproto-comments:revalidated - A background refresh replaced the snapshot. `detail: { tree: CommentTree }`
@event atproto-comments:comment - The live stream announced a new reply. `detail: { uri: string, thread?: string }`
@event atproto-comments:live-status - The live stream's upstream connection changed. `detail: { upstream?: string }`
@event atproto-comments:signed-in - A visitor completed ATProto sign-in. `detail: { session: ServiceSessionInfo }`
@event atproto-comments:posted - A reply was created from the in-page composer. `detail: { uri: string, cid: string, parent: string }`
@event atproto-comments:error - An operation failed. `detail: { message: string, background?: boolean }`
-->

<script lang="ts">
  import { tick, untrack } from "svelte";
  import { BROWSER } from "esm-env";
  import {
    DEFAULT_SERVICE_URL,
    viewerPostUrl,
    viewerProfileUrl,
    fetchCommentTree,
    parseThreadRef,
    sortComments,
    ServiceClient,
    ServiceError,
    type Comment,
    type CommentNode,
    type CommentSort,
    type CommentTree,
    type ServiceSessionInfo,
  } from "@svebcomponents/atproto.client";
  import {
    DEFAULT_STALE_TIME_MS,
    LiveRefreshScheduler,
    reconcileOptimisticReplies,
    RefreshCoordinator,
    snapshotIsStale,
    type OptimisticReplies,
  } from "./revalidation.js";

  interface Props {
    /** AT URI (at://…) or bsky.app post URL of the discussion root */
    thread?: string;
    /** preloaded thread (SSR / build-time prefetch) — used as the initial snapshot */
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
    /** OAuth, posting, and live-event backend. Defaults to the free hosted
     * service; set one URL here to self-host both auth and live updates. */
    service?: string;
    /** force read-only rendering even when a service is configured */
    readonly?: boolean;
    /**
     * Who gets live updates, which is the only thing that makes a reader's
     * browser hold an open connection to the service.
     *
     * - `"signed-in"` (default) — only readers who have signed in. Everyone
     *   else reads the thread straight from the AppView and never contacts
     *   the service at all, so a passing visitor's IP address and the page
     *   they are on stay between them and Bluesky.
     * - `"all"` — every reader, signed in or not. Choose this when the
     *   service is your own, or when you are willing to tell your readers
     *   that a third party sees their visit; it is the livelier experience.
     * - `"off"` — nobody. The thread still renders and still refreshes when
     *   someone posts from this page.
     */
    live?: "signed-in" | "all" | "off";
    /** render the discussion root's own text above the replies — useful
     * standalone (e.g. a landing page demo), redundant when the host page
     * already displays that post's content itself */
    showRoot?: boolean;
    /** the embedding page's own canonical URL (e.g. `$page.url.href`).
     * Reply/like/repost forms already work without JavaScript via a same-
     * origin, cookie-mode service — but completing sign-in without JS also
     * needs a page to redirect back to once it's done, and there's no way to
     * discover that from inside the component. Omit it and everything still
     * works with JS; a no-JS visitor's sign-in link just can't be rendered
     * (falls back to needing JS for that one step). */
    pageUrl?: string;
    /**
     * When the preloaded snapshot was fetched: epoch milliseconds or an ISO
     * date string. The component's own SSR prefetch sets this automatically;
     * hosts supplying their own `threadData` can pass when they fetched it.
     * Without it, the snapshot's age is unknown, which counts as stale (see
     * `staleTime`).
     */
    fetchedAt?: string | number;
    /**
     * How long (milliseconds) a preloaded snapshot is trusted before the
     * client runs one background revalidation on mount. Default 60_000. The
     * refresh reads the public AppView directly — never the service — so
     * signed-out visitors get current comments without a live connection or
     * any polling. Set `Infinity` (property only) to trust the snapshot until
     * a live event says otherwise.
     */
    staleTime?: number;
  }

  let {
    thread = "",
    threadData = undefined,
    maxDepth = 6,
    sort = "oldest",
    labels = "collapse",
    appview = "",
    viewer = "",
    service = DEFAULT_SERVICE_URL,
    readonly = false,
    live = "signed-in",
    showRoot = false,
    pageUrl = "",
    fetchedAt = "",
    staleTime = DEFAULT_STALE_TIME_MS,
  }: Props = $props();

  let fetched = $state<CommentTree | undefined>(undefined);
  let errorMessage = $state<string | undefined>(undefined);
  let loading = $state(false);
  let retryToken = $state(0);
  let revealedLabeled = $state<string[]>([]);
  /** locally posted replies not yet reflected in a refetched thread, keyed
   * by the uri of the post they reply to (the thread root or any comment) */
  let optimistic = $state<OptimisticReplies>({});
  const refreshes = new RefreshCoordinator<CommentTree>();
  let optimisticThread = "";

  const tree = $derived(fetched ?? threadData);

  /**
   * `fetchedAt` normalized to epoch ms. Accepts a number (epoch ms), an ISO
   * date string (the attribute form), or empty/invalid = unknown age, which
   * {@link snapshotIsStale} treats as unboundedly old.
   */
  const snapshotFetchedAt = $derived.by((): number | undefined => {
    if (typeof fetchedAt === "number") {
      return Number.isFinite(fetchedAt) ? fetchedAt : undefined;
    }
    if (fetchedAt === "") return undefined;
    const parsed = Date.parse(fetchedAt);
    return Number.isNaN(parsed) ? undefined : parsed;
  });

  /** label for outbound links: "Bluesky" for the default viewer, else its hostname */
  const viewerName = $derived.by(() => {
    if (!viewer) return "Bluesky";
    try {
      return new URL(viewer).hostname;
    } catch {
      return "Bluesky";
    }
  });

  /** origin of `pageUrl`, for the no-JS sign-in link — empty when `pageUrl`
   * is unset or malformed, in which case that link falls back to needing JS */
  const pageOrigin = $derived.by(() => {
    if (!pageUrl) return "";
    try {
      return new URL(pageUrl).origin;
    } catch {
      return "";
    }
  });

  /**
   * `pageUrl` reduced to origin + path, for the no-JS flows that hand the
   * service somewhere to send the reader back to.
   *
   * The query string and fragment are dropped deliberately. They are no use
   * as a redirect target and they are the part of a URL most likely to carry
   * something private — a search term, a share token, a session id — which
   * would otherwise travel to the service and land in its access logs just
   * because a comment section happened to be on the page.
   */
  const returnUrl = $derived.by(() => {
    if (!pageUrl) return "";
    try {
      const { origin, pathname } = new URL(pageUrl);
      return `${origin}${pathname}`;
    } catch {
      return "";
    }
  });
  // Reuses commentBody's rendering: same avatar/author/rich-text/likes
  // treatment as any reply, so the root reads as part of the same
  // conversation rather than a bespoke header. Not subject to the labels
  // hide/collapse policy — that governs replies, and this is the host page's
  // own post, shown only when it opts in via `showRoot`.
  const rootAsComment = $derived.by((): Comment | undefined =>
    tree
      ? {
          kind: "comment",
          uri: tree.root.uri,
          cid: tree.root.cid,
          author: tree.root.author,
          text: tree.root.text,
          segments: tree.root.segments,
          createdAt: tree.root.createdAt,
          likeCount: tree.root.likeCount,
          replyCount: tree.root.replyCount,
          repostCount: tree.root.repostCount,
          quoteCount: tree.root.quoteCount,
          labels: [],
          url: tree.root.url,
          replies: [],
          hasMoreReplies: false,
        }
      : undefined,
  );
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
  // dispatched on the host element itself, so consumers listen on
  // <atproto-comments> as documented ($host() is undefined during SSR;
  // emit only runs from client-side effects and handlers)
  const emit = (type: string, detail: unknown) => {
    $host()?.dispatchEvent(new CustomEvent(type, { detail, bubbles: true }));
  };

  const MAX_GRAPHEMES = 300;
  /**
   * <textarea maxlength> counts UTF-16 code units, not graphemes, so this is
   * only a loose pre-truncation guard for the no-JS form flow (a ZWJ emoji
   * sequence is many units); the grapheme counter below is the real limit,
   * matching what the bridge enforces server-side.
   */
  const MAX_GRAPHEMES_UTF16_CEILING = MAX_GRAPHEMES * 4;
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
  /** the viewer's own like/repost record uri for posts touched this session,
   * keyed by post uri. The public read API never reports pre-existing viewer
   * state, so before any click these are empty and hearts render unfilled. */
  let liked = $state<Record<string, string>>({});
  let reposted = $state<Record<string, string>>({});
  /** the post the composer dialog is replying to; undefined = every dialog closed.
   * Each comment (and the root) gets its own <dialog> — see composerDialog —
   * so this just tracks which one currently "owns" the shared draft/posting/
   * postError state for the JS-enhanced experience. Every dialog's <form> is
   * independently fully functional without JS regardless of this. */
  interface ReplyTarget {
    uri: string;
    cid: string;
    /** author handle, for the "Replying to @…" context line; undefined = the thread root */
    handle?: string;
  }
  let replyTarget = $state<ReplyTarget | undefined>(undefined);
  let draft = $state("");
  let posting = $state(false);
  let postError = $state<string | undefined>(undefined);

  /** a stable, HTML-id-safe identifier for a post's composer dialog */
  const dialogId = (uri: string): string =>
    `composer-${uri.replace(/[^a-zA-Z0-9]+/g, "-")}`;

  const getDialog = (uri: string): HTMLDialogElement | null => {
    const el = $host()?.shadowRoot?.getElementById(dialogId(uri));
    return el instanceof HTMLDialogElement ? el : null;
  };

  const openComposer = (target: ReplyTarget) => {
    // only one composer open at a time in the JS-enhanced experience
    if (replyTarget && replyTarget.uri !== target.uri) {
      getDialog(replyTarget.uri)?.close();
    }
    postError = undefined;
    replyTarget = target;
    const dialog = getDialog(target.uri);
    if (dialog && !dialog.open) dialog.showModal();
  };

  // state is cleared via the dialog's `close` event so Esc stays in sync
  const closeComposer = () => {
    if (replyTarget) getDialog(replyTarget.uri)?.close();
  };

  // the dialog's content renders a tick after showModal(), so the autofocus
  // attribute can't take effect — focus the textarea once it exists (also
  // covers the composer appearing after an in-dialog sign-in)
  $effect(() => {
    if (!replyTarget || !session) return;
    const target = replyTarget;
    void tick().then(() => {
      getDialog(target.uri)?.querySelector("textarea")?.focus();
    });
  });

  const rootTarget = (): ReplyTarget | undefined =>
    tree ? { uri: tree.root.uri, cid: tree.root.cid } : undefined;

  const remaining = $derived(MAX_GRAPHEMES - countGraphemes(draft));

  $effect(() => {
    if (!BROWSER || !writable) return;
    const c = new ServiceClient(service);
    client = c;
    // Only ask the service who this is when there is something to restore.
    // A reader who has never signed in has no session to find, and probing
    // anyway would tell the bridge their IP address and which page they are
    // reading on every single page load — for the hosted default, that is a
    // third party they never opted into. Same-origin deployments still
    // probe: the session may be an HttpOnly cookie, which is invisible here,
    // and talking to your own server is not a disclosure.
    if (!c.hasStoredSession && !c.isSameOrigin) {
      session = null;
      return;
    }
    c.getSession()
      .then((s) => {
        session = s;
      })
      .catch(() => {
        session = null;
      });
  });

  /** signs in if needed, without any of signIn()'s composer side effects —
   * shared by the like/repost buttons, which just need a session to act. */
  const ensureSignedIn = async (): Promise<ServiceSessionInfo | null> => {
    if (session) return session;
    if (!client) return null;
    try {
      session = await client.signIn();
      emit("atproto-comments:signed-in", { session });
      return session;
    } catch (error) {
      if (!(error instanceof ServiceError && error.code === "Cancelled")) {
        emit("atproto-comments:error", {
          message: error instanceof Error ? error.message : "Sign-in failed",
        });
      }
      return null;
    }
  };

  const signIn = async () => {
    postError = undefined;
    if (!(await ensureSignedIn())) return;
    // opened from the header (no target yet): compose a top-level reply.
    // opened from a comment's Reply button: keep that comment as target.
    if (!replyTarget) {
      const target = rootTarget();
      if (target) openComposer(target);
    }
  };

  const signOut = async () => {
    await client?.signOut();
    session = null;
    closeComposer();
  };

  /** shared optimistic-toggle skeleton behind the like and repost buttons:
   * requires a session, flips local state first, restores it if the service
   * call fails. `run` performs the create (no argument) or the delete
   * (record uri), returning the created record's uri on create. */
  const toggleReaction = async (
    node: { uri: string; cid: string },
    records: Record<string, string>,
    setRecords: (next: Record<string, string>) => void,
    action: {
      run: (existing: string | undefined) => Promise<string | undefined>;
      labels: { add: string; remove: string };
    },
  ): Promise<void> => {
    if (!(await ensureSignedIn())) return;
    const svc = client;
    if (!svc) return;
    const existing = records[node.uri];
    if (!existing) {
      try {
        const created = await action.run(undefined);
        if (created) setRecords({ ...records, [node.uri]: created });
      } catch (error) {
        emit("atproto-comments:error", {
          message:
            error instanceof Error
              ? error.message
              : `Could not ${action.labels.add}`,
        });
      }
      return;
    }
    const { [node.uri]: _removed, ...rest } = records;
    setRecords(rest);
    try {
      await action.run(existing);
    } catch (error) {
      setRecords({ ...records, [node.uri]: existing });
      emit("atproto-comments:error", {
        message:
          error instanceof Error
            ? error.message
            : `Could not ${action.labels.remove}`,
      });
    }
  };

  const toggleLike = (node: { uri: string; cid: string }): Promise<void> => {
    const svc = client;
    if (!svc) return Promise.resolve();
    return toggleReaction(node, liked, (next) => (liked = next), {
      run: (existing) =>
        existing
          ? svc.unlike(existing).then(() => undefined)
          : svc.like({ uri: node.uri, cid: node.cid }).then((r) => r.uri),
      labels: { add: "like", remove: "unlike" },
    });
  };

  const toggleRepost = (node: { uri: string; cid: string }): Promise<void> => {
    const svc = client;
    if (!svc) return Promise.resolve();
    return toggleReaction(node, reposted, (next) => (reposted = next), {
      run: (existing) =>
        existing
          ? svc.unrepost(existing).then(() => undefined)
          : svc.repost({ uri: node.uri, cid: node.cid }).then((r) => r.uri),
      labels: { add: "repost", remove: "undo repost" },
    });
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
            repostCount: 0,
            quoteCount: 0,
            labels: [],
            url: viewerPostUrl(
              posted.uri,
              session?.handle,
              viewer || undefined,
            ),
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
      liveRefreshes.synchronize(posted.uri);
    } catch (error) {
      postError =
        error instanceof Error ? error.message : "Could not post your reply";
    } finally {
      posting = false;
    }
  };

  /** Refresh the current public thread directly from the configured AppView. */
  export function revalidate(): Promise<CommentTree | undefined> {
    return refreshThread();
  }

  const liveRefreshes = new LiveRefreshScheduler(revalidate);

  const requestKey = (): string => JSON.stringify([thread, appview, viewer]);
  const refreshThread = (): Promise<CommentTree | undefined> => {
    if (!BROWSER || !thread) return Promise.resolve(undefined);

    const existing = fetched ?? threadData;
    const background = existing !== undefined;
    if (!parseThreadRef(thread)) {
      const error = new Error(
        `Not a valid AT URI or bsky.app post URL: ${thread}`,
      );
      if (!background) errorMessage = error.message;
      emit("atproto-comments:error", {
        message: error.message,
        background,
      });
      return Promise.reject(error);
    }

    if (!background) loading = true;
    errorMessage = undefined;

    return refreshes.run(
      requestKey(),
      (signal) =>
        fetchCommentTree(thread, {
          signal,
          ...(appview ? { appView: appview } : {}),
          ...(viewer ? { viewer } : {}),
        }),
      {
        resolved: (result) => {
          optimistic = reconcileOptimisticReplies(result, optimistic);
          fetched = result;
          errorMessage = undefined;
          emit(
            background
              ? "atproto-comments:revalidated"
              : "atproto-comments:loaded",
            { tree: result },
          );
        },
        rejected: (error) => {
          const message =
            error instanceof Error ? error.message : "Failed to load comments";
          if (!background) errorMessage = message;
          emit("atproto-comments:error", { message, background });
        },
        settled: () => {
          if (!background) loading = false;
        },
      },
    );
  };

  $effect(() => {
    // Capture every input that identifies or configures the public fetch.
    const currentThread = thread;
    const snapshot = threadData;
    void appview;
    void viewer;
    // reference so the retry button can re-trigger this effect
    void retryToken;

    if (!BROWSER) return;

    refreshes.cancel();
    liveRefreshes.cancel();
    fetched = undefined;
    loading = false;
    errorMessage = undefined;

    if (optimisticThread !== currentThread) {
      optimisticThread = currentThread;
      optimistic = {};
      liked = {};
      reposted = {};
    }

    if (!currentThread) return;
    // A serialized SSR snapshot renders immediately. Without one, fetch now so
    // the component never waits on the event service for its initial content.
    if (snapshot === undefined) {
      void untrack(refreshThread).catch(() => {
        // State and the public error event are handled by refreshThread.
      });
    } else if (
      untrack(() =>
        snapshotIsStale(snapshotFetchedAt, staleTime),
      )
    ) {
      // Freshness boundary for viewers without a live connection: the SSR
      // snapshot may predate this page load, and "not live" should not mean
      // "stale". One coalesced background read against the public AppView —
      // current comments stay visible, no skeleton, and the bridge is never
      // contacted, so signed-out visitors remain request-free as far as the
      // service is concerned.
      liveRefreshes.synchronize();
    }

    return () => {
      refreshes.cancel();
      liveRefreshes.cancel();
    };
  });

  /**
   * Whether to hold an open event-stream connection to the service. This is
   * the component's only unprompted network contact with the bridge, so it
   * is also the whole of the reader-privacy question: an anonymous reader
   * who never streams never identifies themselves to the service at all.
   * Signing in is treated as the opt-in, since by then the reader has chosen
   * the service and it already knows who they are.
   */
  const streaming = $derived(
    live === "all" || (live === "signed-in" && session !== null),
  );

  $effect(() => {
    const currentThread = thread;
    const currentService = service;
    if (
      !BROWSER ||
      !streaming ||
      !currentThread ||
      !currentService ||
      !parseThreadRef(currentThread)
    )
      return;

    let source: EventSource | undefined;
    const streamClient = new ServiceClient(currentService);

    const close = () => {
      source?.close();
      source = undefined;
    };

    const connect = () => {
      if (source || document.hidden) return;
      source = new EventSource(streamClient.commentsStreamUrl(currentThread));

      source.addEventListener("error", () => {
        // EventSource reconnects transient failures on its own; CLOSED means
        // it has given up permanently (fatal status, proxy kill). Drop the
        // reference so the next visibility change opens a fresh connection
        // instead of silently holding a dead one.
        if (source?.readyState !== EventSource.CLOSED) return;
        source = undefined;
        emit("atproto-comments:live-status", { upstream: undefined });
      });

      source.addEventListener("status", (event) => {
        let upstream: string | undefined;
        try {
          upstream = (JSON.parse(event.data) as { upstream?: string }).upstream;
        } catch {
          return;
        }
        emit("atproto-comments:live-status", { upstream });
        if (upstream === "connected") liveRefreshes.synchronize();
      });

      source.addEventListener("comment", (event) => {
        try {
          const detail = JSON.parse(event.data) as {
            uri?: string;
            thread?: string;
          };
          if (!detail.uri) return;
          emit("atproto-comments:comment", detail);
          liveRefreshes.synchronize(detail.uri);
        } catch {
          // Ignore malformed events; EventSource remains connected.
        }
      });
    };

    const onVisibilityChange = () => {
      if (document.hidden) close();
      else connect();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    connect();

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      close();
    };
  });

  const compactNumber = new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  });

  const relativeFormat = new Intl.RelativeTimeFormat(undefined, {
    numeric: "auto",
  });

  // divisors for successive relative-time units; weeks/months use mean
  // calendar lengths (30.4169 days ≈ 4.34524 weeks)
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

  /** each-block key: bare uri for comments, kind-prefixed for tombstones so
   * two tombstone kinds sharing one uri can't collide */
  const nodeKey = (node: CommentNode): string =>
    node.kind === "comment" ? node.uri : `${node.kind}-${node.uri}`;
</script>

{#snippet reactionButtons(node: {
  uri: string;
  cid: string;
  likeCount: number;
  repostCount: number;
  quoteCount: number;
})}
  {#if writable}
    <form class="reaction-form" method="post" action="{service}/api/like">
      <input type="hidden" name="uri" value={node.uri} />
      <input type="hidden" name="cid" value={node.cid} />
      {#if returnUrl}<input type="hidden" name="return" value={returnUrl} />{/if}
      <button
        type="submit"
        class="reaction-button"
        class:active={Boolean(liked[node.uri])}
        part="like-button"
        aria-pressed={Boolean(liked[node.uri])}
        aria-label={liked[node.uri]
          ? `Undo like, ${compactNumber.format(node.likeCount + 1)} likes`
          : `Like, ${compactNumber.format(node.likeCount)} likes`}
        onclick={(e) => {
          e.preventDefault();
          void toggleLike(node);
        }}
        >{liked[node.uri] ? "♥" : "♡"}
        {compactNumber.format(
          node.likeCount + (liked[node.uri] ? 1 : 0),
        )}</button
      >
    </form>
    ·
    <form class="reaction-form" method="post" action="{service}/api/repost">
      <input type="hidden" name="uri" value={node.uri} />
      <input type="hidden" name="cid" value={node.cid} />
      {#if returnUrl}<input type="hidden" name="return" value={returnUrl} />{/if}
      <button
        type="submit"
        class="reaction-button"
        class:active={Boolean(reposted[node.uri])}
        part="repost-button"
        aria-pressed={Boolean(reposted[node.uri])}
        aria-label={
          reposted[node.uri]
            ? `Undo repost, ${compactNumber.format(
                node.repostCount + node.quoteCount + 1,
              )} reposts`
            : `Repost, ${compactNumber.format(
                node.repostCount + node.quoteCount,
              )} reposts`
        }
        onclick={(e) => {
          e.preventDefault();
          void toggleRepost(node);
        }}
        >↻ {compactNumber.format(
          node.repostCount + node.quoteCount + (reposted[node.uri] ? 1 : 0),
        )}</button
      >
    </form>
  {:else}
    <span class="likes">♡ {compactNumber.format(node.likeCount)}</span>
    ·
    <span class="reposts"
      >↻ {compactNumber.format(node.repostCount + node.quoteCount)}</span
    >
  {/if}
{/snippet}

{#snippet signInLink(label: string)}
  {#if returnUrl && pageOrigin}
    <a
      class="signin-button"
      part="reply-button"
      referrerpolicy="origin"
      href="{service}/oauth/start?origin={encodeURIComponent(
        pageOrigin,
      )}&return={encodeURIComponent(returnUrl)}"
      onclick={(e) => {
        e.preventDefault();
        void signIn();
      }}
    >
      {label}
    </a>
  {:else}
    <button
      type="button"
      class="signin-button"
      part="reply-button"
      onclick={signIn}
    >
      {label}
    </button>
  {/if}
{/snippet}

{#snippet composerDialog(target: { uri: string; cid: string; handle?: string })}
  {@const id = dialogId(target.uri)}
  {@const isActive = replyTarget?.uri === target.uri}
  <dialog
    {id}
    class="composer-dialog"
    part="dialog"
    onclose={() => {
      if (replyTarget?.uri === target.uri) replyTarget = undefined;
      // clear with the dialog so a half-written reply doesn't follow the
      // reader into a different comment's composer
      draft = "";
    }}
  >
    {#if session}
      <form
        class="composer"
        part="composer"
        method="post"
        action="{service}/api/reply"
        onsubmit={(e) => {
          e.preventDefault();
          replyTarget = target;
          void submitReply();
        }}
      >
        <input type="hidden" name="rootUri" value={tree?.root.uri ?? ""} />
        <input type="hidden" name="rootCid" value={tree?.root.cid ?? ""} />
        <input type="hidden" name="parentUri" value={target.uri} />
        <input type="hidden" name="parentCid" value={target.cid} />
        {#if returnUrl}<input type="hidden" name="return" value={returnUrl} />{/if}
        <p class="composer-context">
          {#if target.handle}
            Replying to <strong>@{target.handle}</strong>
          {:else}
            Replying to the post
          {/if}
        </p>
        <textarea
          name="text"
          part="composer-input"
          rows="3"
          placeholder="Write a reply…"
          aria-label="Write a reply"
          maxlength={MAX_GRAPHEMES_UTF16_CEILING}
          value={isActive ? draft : ""}
          oninput={(e) => {
            replyTarget = target;
            draft = e.currentTarget.value;
          }}
          disabled={isActive && posting}
        ></textarea>
        <p class="composer-notice">
          Posting publicly as <strong>@{session.handle ?? "you"}</strong> from your
          ATmosphere account.
        </p>
        {#if isActive && postError}
          <p class="composer-error" role="alert" part="error">{postError}</p>
        {/if}
        <div class="composer-actions">
          {#if isActive}
            <span class="counter" class:over={remaining < 0} role="status"
              >{remaining}</span
            >
          {/if}
          <button type="button" class="link-button muted" command="close" commandfor={id}>
            Cancel
          </button>
          <button
            type="submit"
            class="post-button"
            disabled={isActive &&
              (posting || draft.trim().length === 0 || remaining < 0)}
          >
            {isActive && posting ? "Posting…" : "Post reply"}
          </button>
        </div>
      </form>
    {:else}
      <div class="composer signin-prompt" part="composer">
        <p class="composer-notice">
          {#if target.handle}
            Sign in with your ATmosphere account to reply to
            <strong>@{target.handle}</strong>.
          {:else}
            Sign in with your ATmosphere account to join the conversation.
          {/if}
        </p>
        {#if isActive && postError}
          <p class="composer-error" role="alert" part="error">{postError}</p>
        {/if}
        <div class="composer-actions">
          <button type="button" class="link-button muted" command="close" commandfor={id}>
            Cancel
          </button>
          {@render signInLink("Sign in")}
        </div>
      </div>
    {/if}
  </dialog>
{/snippet}

{#snippet commentBody(
  node: Extract<CommentNode, { kind: "comment" }>,
  showActions: boolean = true,
)}
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
          aria-label={absoluteTime(node.createdAt)}
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
      {#if showActions}
        <div class="actions" part="actions">
          {@render reactionButtons(node)}
          ·
          {#if writable}
            <button
              type="button"
              class="reply-link link-button"
              part="reply-button"
              aria-label={`Reply, ${compactNumber.format(node.replyCount)} replies`}
              command="show-modal"
              commandfor={dialogId(node.uri)}
              onclick={() =>
                openComposer({
                  uri: node.uri,
                  cid: node.cid,
                  handle: node.author.handle,
                })}>↩ {compactNumber.format(node.replyCount)}</button
            >
            {@render composerDialog({
              uri: node.uri,
              cid: node.cid,
              handle: node.author.handle,
            })}
          {:else}
            <a
              class="reply-link"
              part="reply-button"
              aria-label={`Reply on ${viewerName}, ${compactNumber.format(node.replyCount)} replies`}
              href={node.url}
              target="_blank"
              rel="noopener noreferrer"
              >↩ {compactNumber.format(node.replyCount)}</a
            >
          {/if}
        </div>
      {/if}
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
                {#each node.replies as reply (nodeKey(reply))}
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
    {#if showRoot && rootAsComment}
      <div class="root-post" part="root-post">
        {@render commentBody(rootAsComment, false)}
      </div>
    {/if}
    <header class="header" part="header">
      <div class="stats">
        {@render reactionButtons(tree.root)}
        ·
        {#if writable}
          <button
            type="button"
            class="reply-link link-button"
            part="reply-button"
            aria-label={`Reply, ${compactNumber.format(tree.root.replyCount)} replies`}
            command="show-modal"
            commandfor={dialogId(tree.root.uri)}
            onclick={() => {
              const target = rootTarget();
              if (target) openComposer(target);
            }}>↩ {compactNumber.format(tree.root.replyCount)}</button
          >
        {:else}
          <a
            class="reply-link"
            part="reply-button"
            aria-label={`Reply on ${viewerName}, ${compactNumber.format(tree.root.replyCount)} replies`}
            href={tree.root.url}
            target="_blank"
            rel="noopener noreferrer"
            >↩ {compactNumber.format(tree.root.replyCount)}</a
          >
        {/if}
      </div>
      {#if writable && session}
        <span class="signed-in" part="signed-in">
          <span class="as-handle">@{session.handle ?? "you"}</span>
          <button type="button" class="link-button muted" onclick={signOut}>
            Sign out
          </button>
        </span>
      {:else if writable}
        {@render signInLink("Sign in to comment")}
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
    {#if writable}
      {@render composerDialog({ uri: tree.root.uri, cid: tree.root.cid })}
    {/if}
    {#if comments.length === 0}
      <p class="empty" part="empty">
        No comments yet.
        <a href={tree.root.url} target="_blank" rel="noopener noreferrer"
          >Be the first to reply on {viewerName}</a
        >
      </p>
    {:else}
      <ul class="comments" part="comments">
        {#each comments as node (nodeKey(node))}
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
    <div class="skeleton" part="skeleton" role="status" aria-label="Loading comments">
      {#each [0, 1, 2] as i (i)}
        <div class="skeleton-row" aria-hidden="true">
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
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875em;
    line-height: 1;
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
  .root-post {
    padding-block-start: 1rem;
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
  .likes,
  .reposts {
    color: var(--atproto-comments-muted, light-dark(#666, #999));
    font-size: 0.875em;
  }
  .body {
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875em;
    line-height: 1;
    margin-block-start: 0.25rem;
  }
  .reply-link {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }
  .reaction-form {
    /* the form itself must not generate a box — its button participates
       directly in the surrounding flex row (.stats / .actions) */
    display: contents;
  }
  .reaction-button {
    font: inherit;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: var(--atproto-comments-muted, light-dark(#666, #999));
  }
  .reaction-button.active {
    color: var(--atproto-comments-accent, #2864ff);
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
