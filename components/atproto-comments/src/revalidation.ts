import type { CommentNode, CommentTree } from "@svebcomponents/atproto.client";

export type OptimisticReplies = Record<string, CommentNode[]>;

const visitCommentUris = (
  nodes: CommentNode[],
  visit: (uri: string) => void,
): void => {
  for (const node of nodes) {
    visit(node.uri);
    if (node.kind === "comment") visitCommentUris(node.replies, visit);
  }
};

export const treeContainsUri = (tree: CommentTree, uri: string): boolean => {
  if (tree.root.uri === uri) return true;
  let found = false;
  visitCommentUris(tree.comments, (candidate) => {
    if (candidate === uri) found = true;
  });
  return found;
};

/**
 * Drop an optimistic reply only after AppView returns the same post URI.
 * Replies absent from the fetched tree remain overlaid on the new snapshot.
 */
export const reconcileOptimisticReplies = (
  tree: CommentTree,
  optimistic: OptimisticReplies,
): OptimisticReplies => {
  const fetchedUris = new Set<string>([tree.root.uri]);
  visitCommentUris(tree.comments, (uri) => fetchedUris.add(uri));

  let changed = false;
  const reconciled: OptimisticReplies = {};
  for (const [parentUri, replies] of Object.entries(optimistic)) {
    const pending = replies.filter((reply) => !fetchedUris.has(reply.uri));
    if (pending.length !== replies.length) changed = true;
    if (pending.length > 0) reconciled[parentUri] = pending;
  }
  return changed ? reconciled : optimistic;
};

interface RefreshHooks<T> {
  resolved?: (value: T) => void;
  rejected?: (error: unknown) => void;
  settled?: () => void;
}

interface ActiveRefresh<T> {
  key: string;
  controller: AbortController;
  promise: Promise<T | undefined>;
  requestId: number;
}

/**
 * Runs at most one refresh for a request key. Changing keys aborts the old
 * request, and its result is ignored even when the underlying fetch neglects
 * its AbortSignal.
 */
export class RefreshCoordinator<T> {
  #active: ActiveRefresh<T> | undefined;
  #requestId = 0;

  run(
    key: string,
    load: (signal: AbortSignal) => Promise<T>,
    hooks: RefreshHooks<T> = {},
  ): Promise<T | undefined> {
    if (this.#active?.key === key) return this.#active.promise;

    this.cancel();
    const controller = new AbortController();
    const requestId = ++this.#requestId;

    const isCurrent = () =>
      this.#active?.requestId === requestId && !controller.signal.aborted;

    const promise = Promise.resolve()
      .then(() => load(controller.signal))
      .then((value) => {
        if (!isCurrent()) return undefined;
        hooks.resolved?.(value);
        return value;
      })
      .catch((error: unknown) => {
        if (!isCurrent()) return undefined;
        hooks.rejected?.(error);
        throw error;
      })
      .finally(() => {
        if (this.#active?.requestId !== requestId) return;
        this.#active = undefined;
        hooks.settled?.();
      });

    this.#active = { key, controller, promise, requestId };
    return promise;
  }

  cancel(): void {
    this.#requestId += 1;
    this.#active?.controller.abort();
    this.#active = undefined;
  }
}

const wait = (delay: number, signal: AbortSignal): Promise<boolean> => {
  if (delay <= 0) return Promise.resolve(!signal.aborted);
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }

    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve(true);
    }, delay);
    const abort = () => {
      clearTimeout(timeout);
      resolve(false);
    };
    signal.addEventListener("abort", abort, { once: true });
  });
};

/**
 * Coalesces live events for one thread. A connect/reconnect requests one
 * synchronization fetch; URI events are retried with short backoff until the
 * AppView exposes them. Events arriving during a fetch force one trailing
 * refresh, avoiding both lost updates and one timer per comment.
 */
export class LiveRefreshScheduler {
  #pendingUris = new Set<string>();
  #boundaryVersion = 0;
  #dirty = false;
  #controller: AbortController | undefined;

  constructor(
    private readonly refresh: () => Promise<CommentTree | undefined>,
    private readonly delays: readonly number[] = [0, 500, 2_000, 5_000],
  ) {}

  synchronize(uri?: string): void {
    if (uri) this.#pendingUris.add(uri);
    else this.#boundaryVersion += 1;
    this.#dirty = true;
    if (!this.#controller) this.#start();
  }

  cancel(): void {
    this.#controller?.abort();
    this.#controller = undefined;
    this.#pendingUris.clear();
    this.#dirty = false;
  }

  #start(): void {
    const controller = new AbortController();
    this.#controller = controller;
    void this.#run(controller).finally(() => {
      if (this.#controller !== controller) return;
      this.#controller = undefined;
      if (this.#dirty) this.#start();
    });
  }

  async #run(controller: AbortController): Promise<void> {
    for (const delay of this.delays) {
      this.#dirty = false;
      if (!(await wait(delay, controller.signal))) return;

      const boundaryVersion = this.#boundaryVersion;
      try {
        const result = await this.refresh();
        if (result) {
          for (const uri of this.#pendingUris) {
            if (treeContainsUri(result, uri)) this.#pendingUris.delete(uri);
          }
        }
      } catch {
        // The rendered snapshot remains available; try the next backoff.
      }

      if (
        this.#pendingUris.size === 0 &&
        boundaryVersion === this.#boundaryVersion
      ) {
        // URI events that arrived before/during this fetch were present in its
        // result, so they do not require an otherwise redundant trailing read.
        this.#dirty = false;
        return;
      }
    }
  }
}
