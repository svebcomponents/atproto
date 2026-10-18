/** a strong reference to a post: its AT URI and content hash */
export interface PostRef {
  uri: string;
  cid: string;
}

export interface ServiceSessionInfo {
  did: string;
  handle?: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface CreatedRecord {
  uri: string;
  cid: string;
}

export type PostedReply = CreatedRecord;

/** what the signed-in reader has already done to a set of posts */
export interface ViewerReactions {
  /** post URI -> the reader's own `app.bsky.feed.like` record URI */
  likes: Record<string, string>;
  /** post URI -> the reader's own `app.bsky.feed.repost` record URI */
  reposts: Record<string, string>;
  /**
   * True when the bridge could not reach the backlink index. The maps are
   * empty because nothing is known, not because the reader has reacted to
   * nothing.
   */
  unavailable?: boolean;
}

/**
 * The most posts one `/api/viewer` lookup may name, likes and reposts counted
 * together. Each subject costs the bridge one backlink query, so this bounds
 * the fan-out a single session can drive through the index. Both sides read
 * it from here: the component to trim what it asks for, the bridge to reject
 * anything larger.
 */
export const MAX_VIEWER_SUBJECTS = 100;

/** which of the reader's own reactions to look up, per post */
export interface ViewerSubjects {
  /** posts to check for a like by the reader */
  likes: readonly string[];
  /** posts to check for a repost by the reader */
  reposts: readonly string[];
}

/**
 * Where the session token is kept. Defaults to `localStorage`. Provide your
 * own where `localStorage` is missing (a browser extension's service worker)
 * or to keep the token somewhere else.
 */
export type TokenStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface ServiceClientOptions {
  fetch?: typeof globalThis.fetch;
  storage?: TokenStorage;
}

export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

const SESSION_STORAGE_PREFIX = "atproto-comments:token:";
export const DEFAULT_SERVICE_URL = "https://atproto.svebcomponents.dev/atproto";

/**
 * A bridge token's `iat` / `exp` (seconds). The client never verifies the
 * token, only reads when to renew it; malformed tokens yield null.
 */
const tokenLifetime = (
  token: string,
): { issuedAt: number; expiresAt: number } | null => {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    ) as { iat?: unknown; exp?: unknown };
    return typeof json.iat === "number" && typeof json.exp === "number"
      ? { issuedAt: json.iat, expiresAt: json.exp }
      : null;
  } catch {
    return null;
  }
};

/**
 * Browser-side client for the hosted OAuth/posting bridge. Holds the
 * origin-bound session token (in memory + localStorage, keyed per service),
 * runs the popup sign-in handshake, and calls the reply API.
 *
 * The token lives in `localStorage`, which any script on the embedding page
 * can read. That is a deliberate, reviewed trade-off rather than an
 * oversight: the hosted bridge is cross-origin, so SameSite rules keep an
 * HttpOnly cookie from reaching it, and a comment widget that signed readers
 * out on every reload would be a worse product. The exposure is bounded by a
 * short token lifetime (renewal rotates, so a copied token stops renewing
 * once this client renews), by the session being revocable server-side, and by
 * the component having no `javascript:` sink of its own (link facets are
 * scheme-checked in `richText.ts`). A site embedding this is trusting it with
 * reader sessions; self-hosting same-origin with `sessionMode: "cookie"`
 * avoids browser-readable tokens entirely.
 */
export class ServiceClient {
  #token: string | null = null;
  #refreshing: Promise<void> | null = null;
  /** when this client received its current token, by its own clock */
  #receivedAt: { token: string; at: number } | null = null;
  readonly #storage: TokenStorage | undefined;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly serviceUrl: string;

  constructor(
    serviceUrl = DEFAULT_SERVICE_URL,
    /** a fetch implementation, or options */
    fetchOrOptions?: typeof globalThis.fetch | ServiceClientOptions,
  ) {
    const options: ServiceClientOptions =
      typeof fetchOrOptions === "function"
        ? { fetch: fetchOrOptions }
        : (fetchOrOptions ?? {});
    const fetchImpl = options.fetch;
    this.#storage = options.storage;
    // Wrap (rather than store `globalThis.fetch` directly): the browser's
    // `fetch` throws "Illegal invocation" when called with any receiver other
    // than the global object, and `this.fetchImpl(...)` would set the receiver
    // to this instance. An injected fetch (tests) is used as-is.
    this.fetchImpl =
      fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
    // resolve relative service URLs (e.g. same-origin "/atproto") to absolute
    const base = globalThis.location?.href;
    this.serviceUrl = new URL(serviceUrl, base).href.replace(/\/$/, "");
    this.#token = this.#readStoredToken();
  }

  get #storageKey(): string {
    return `${SESSION_STORAGE_PREFIX}${this.serviceUrl}`;
  }

  /**
   * True when this browser has a stored session for the service.
   *
   * Callers use this to avoid contacting the bridge at all for a reader who
   * has never signed in: an unconditional session probe on every page load
   * would send that reader's IP address and referring page to the service
   * before they have done anything, which for the hosted default is a third
   * party they never chose. False here means "nothing to restore", not
   * "signed out" — a cookie-mode session lives in an HttpOnly cookie this
   * cannot see, so same-origin deployments should probe regardless.
   */
  get hasStoredSession(): boolean {
    return this.#token !== null;
  }

  /**
   * Calls `listener` when another page of this origin signs in or out
   * (`storage` events on `localStorage`). Returns an unsubscribe function.
   * Pages of one origin share a session, and this lets them follow each
   * other without a reload. A token replaced while signed in (renewed by
   * another page) is picked up without calling `listener`. Not available
   * with a custom `storage`, which has no change events.
   */
  onSessionChange(listener: (signedIn: boolean) => void): () => void {
    if (this.#storage || typeof globalThis.addEventListener !== "function") {
      return () => {};
    }
    const onStorage = (event: StorageEvent) => {
      // `key` is null when another page cleared all of storage
      if (event.key !== null && event.key !== this.#storageKey) return;
      const token = this.#readStoredToken();
      if (token === this.#token) return;
      const wasSignedIn = this.#token !== null;
      this.#token = token;
      if (wasSignedIn !== (token !== null)) listener(token !== null);
    };
    globalThis.addEventListener("storage", onStorage);
    return () => globalThis.removeEventListener("storage", onStorage);
  }

  /** True when the service shares an origin with the current page. */
  get isSameOrigin(): boolean {
    const here = globalThis.location?.origin;
    return here !== undefined && new URL(this.serviceUrl).origin === here;
  }

  /** the configured storage, or `localStorage` where it exists */
  get #tokenStorage(): TokenStorage | undefined {
    return this.#storage ?? globalThis.localStorage;
  }

  #readStoredToken(): string | null {
    try {
      return this.#tokenStorage?.getItem(this.#storageKey) ?? null;
    } catch {
      return null;
    }
  }

  #storeToken(token: string | null): void {
    this.#token = token;
    this.#receivedAt = token ? { token, at: Date.now() } : null;
    try {
      if (token) this.#tokenStorage?.setItem(this.#storageKey, token);
      else this.#tokenStorage?.removeItem(this.#storageKey);
    } catch {
      // storage unavailable (private mode / SSR) — memory token still works
    }
  }

  #headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      ...(this.#token ? { authorization: `Bearer ${this.#token}` } : {}),
      ...extra,
    };
  }

  /** Public SSE URL for newly-created descendants of a thread. */
  commentsStreamUrl(thread: string): string {
    return `${this.serviceUrl}/api/comments/stream?thread=${encodeURIComponent(thread)}`;
  }

  /**
   * Picks up a token another page of this origin stored (it may have
   * renewed the session since this client read it). A missing entry is not
   * adopted: it can also mean storage is unavailable.
   */
  #adoptStoredToken(): void {
    const stored = this.#readStoredToken();
    if (stored !== null && stored !== this.#token) this.#token = stored;
  }

  /**
   * Renews the bearer token once it is past half its lifetime, including
   * after it expired: the bridge exchanges a recently expired token for a
   * fresh one while the session is alive. Returns null when nothing needs
   * renewing, so callers only wait when they must.
   *
   * The half-life is measured from when this client received the token, by
   * its own clock, so a clock that disagrees with the bridge's does not
   * renew on every call. Only a token read from storage falls back to its
   * `iat`; a clock running behind is covered by the retry in {@link #send}.
   */
  #renewIfAging(): Promise<void> | null {
    this.#adoptStoredToken();
    const token = this.#token;
    if (!token) return null;
    const lifetime = tokenLifetime(token);
    if (!lifetime) return null;
    const receivedAt =
      this.#receivedAt?.token === token
        ? this.#receivedAt.at
        : lifetime.issuedAt * 1000;
    const halfLife = ((lifetime.expiresAt - lifetime.issuedAt) * 1000) / 2;
    if (Date.now() < receivedAt + halfLife) return null;
    return this.#renew(token);
  }

  /** refreshes `token`; concurrent calls share one request */
  #renew(token: string): Promise<void> {
    this.#refreshing ??= this.#refresh(token).finally(() => {
      this.#refreshing = null;
    });
    return this.#refreshing;
  }

  async #refresh(token: string): Promise<void> {
    let response: Response;
    try {
      response = await this.fetchImpl(
        `${this.serviceUrl}/api/session/refresh`,
        {
          method: "POST",
          credentials: "include",
          headers: { authorization: `Bearer ${token}` },
        },
      );
    } catch {
      return; // offline: keep the token and try again on the next request
    }
    // another call may have stored a newer token (or signed out) meanwhile
    if (this.#token !== token) return;
    if (response.status === 401) {
      // The bridge rotates tokens on refresh, so another page that renewed
      // first leaves this one's token refused. Use the one it stored.
      this.#adoptStoredToken();
      if (this.#token === token) this.#storeToken(null);
      return;
    }
    if (!response.ok) return;
    const body = (await response.json().catch(() => ({}))) as {
      token?: unknown;
    };
    if (typeof body.token === "string") this.#storeToken(body.token);
  }

  /**
   * Sends a request with the current token, renewing it first when it is
   * aging. A 401 for a renewable token means the bridge saw it as expired
   * (this clock runs behind the bridge's) or another page renewed it: renew
   * once and retry. A 401 that survives that is returned to the caller.
   */
  async #send(
    path: string,
    init: { method: string; headers?: Record<string, string>; body?: string },
  ): Promise<Response> {
    const renewal = this.#renewIfAging();
    if (renewal) await renewal;
    const send = () =>
      this.fetchImpl(`${this.serviceUrl}${path}`, {
        ...init,
        credentials: "include",
        headers: this.#headers(init.headers),
      });
    const token = this.#token;
    const response = await send();
    if (response.status !== 401 || !token || !tokenLifetime(token)) {
      return response;
    }
    await this.#renew(token);
    return this.#token && this.#token !== token ? send() : response;
  }

  /** current session, or null if signed out / token no longer valid */
  async getSession(): Promise<ServiceSessionInfo | null> {
    const response = await this.#send("/api/session", { method: "GET" });
    if (response.status === 401) {
      this.#storeToken(null);
      return null;
    }
    if (!response.ok) {
      throw await toServiceError(response);
    }
    return (await response.json()) as ServiceSessionInfo;
  }

  /**
   * Opens the bridge sign-in popup and resolves once the session is ready.
   * Must be called from a user gesture (click) so the popup isn't blocked.
   *
   * Two handoff mechanisms race: (1) a `postMessage` from the popup (instant,
   * but unreliable — OAuth providers set COOP, which severs `window.opener`
   * across the cross-origin redirect, and popups sometimes open as tabs that
   * never auto-close); (2) polling a one-time claim keyed by an unguessable
   * nonce (robust, works even if the popup became a tab the user closes by
   * hand). Whichever arrives first wins.
   */
  async signIn(
    options: { timeoutMs?: number } = {},
  ): Promise<ServiceSessionInfo> {
    const timeoutMs = options.timeoutMs ?? 5 * 60_000;
    const origin = globalThis.location.origin;
    const nonce = crypto.randomUUID();
    const startUrl =
      `${this.serviceUrl}/oauth/start` +
      `?origin=${encodeURIComponent(origin)}&claim=${encodeURIComponent(nonce)}`;
    const popup = globalThis.open(
      startUrl,
      "atproto-comments-signin",
      "width=460,height=640",
    );
    if (!popup) {
      throw new ServiceError(
        "Popup blocked — allow popups to sign in",
        0,
        "PopupBlocked",
      );
    }

    const serviceOrigin = new URL(this.serviceUrl).origin;
    return new Promise<ServiceSessionInfo>((resolve, reject) => {
      let settled = false;
      const finish = (session: ServiceSessionInfo, token?: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        // best-effort: the callback page also closes itself, but when the
        // session arrives while the popup is still open (postMessage fast
        // path, or polling picking up a claim early) close it from here too.
        // COOP from the OAuth provider usually disconnects this reference —
        // then this is a harmless no-op and the page's self-close covers it.
        try {
          popup.close();
        } catch {
          // disconnected by COOP — the callback page closes itself
        }
        this.#storeToken(token ?? null);
        resolve(session);
      };
      const fail = (error: ServiceError) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };

      const toSession = (data: {
        did?: string;
        handle?: string;
        displayName?: string;
        avatarUrl?: string;
      }): ServiceSessionInfo => ({
        did: data.did ?? "",
        ...(data.handle ? { handle: data.handle } : {}),
        ...(data.displayName ? { displayName: data.displayName } : {}),
        ...(data.avatarUrl ? { avatarUrl: data.avatarUrl } : {}),
      });

      // Mechanism 1: postMessage fast path
      const onMessage = (event: MessageEvent) => {
        if (event.origin !== serviceOrigin) return;
        const data = event.data as {
          type?: string;
          token?: string;
          did?: string;
          handle?: string;
          displayName?: string;
          avatarUrl?: string;
        };
        if (data?.type !== "atproto-comments:session" || !data.did) return;
        finish(toSession(data), data.token);
      };
      globalThis.addEventListener("message", onMessage);

      // Mechanism 2: poll the claim endpoint for the session.
      const claimUrl = `${this.serviceUrl}/api/session/claim?nonce=${encodeURIComponent(nonce)}`;
      const pollOnce = () => {
        void this.fetchImpl(claimUrl, { credentials: "include" })
          .then(async (response) => {
            if (response.status !== 200) return;
            const claim = (await response.json()) as {
              token?: string;
              did: string;
              handle?: string;
              displayName?: string;
              avatarUrl?: string;
            };
            finish(toSession(claim), claim.token);
          })
          .catch(() => {
            // transient — keep polling
          });
      };
      const poll = globalThis.setInterval(pollOnce, 1000);

      // Crucial: poll immediately whenever this tab regains focus/visibility.
      // While the user is on the sign-in popup/tab, this (background) tab's
      // timers are throttled to a near-standstill by the browser — so the
      // interval alone can miss the claim. Returning here (which is exactly
      // when they finish or close the sign-in tab) fires these and picks it
      // up at once.
      const onVisible = () => {
        if (!globalThis.document?.hidden) pollOnce();
      };
      globalThis.addEventListener("focus", onVisible);
      globalThis.document?.addEventListener("visibilitychange", onVisible);

      const deadline = globalThis.setTimeout(() => {
        fail(new ServiceError("Sign-in timed out", 0, "Timeout"));
      }, timeoutMs);

      const cleanup = () => {
        globalThis.removeEventListener("message", onMessage);
        globalThis.removeEventListener("focus", onVisible);
        globalThis.document?.removeEventListener("visibilitychange", onVisible);
        globalThis.clearInterval(poll);
        globalThis.clearTimeout(deadline);
      };
    });
  }

  async signOut(): Promise<void> {
    await this.fetchImpl(`${this.serviceUrl}/api/session/logout`, {
      method: "POST",
      credentials: "include",
      headers: this.#headers(),
    }).catch(() => {
      // best-effort; clear locally regardless
    });
    this.#storeToken(null);
  }

  async postReply(input: {
    root: PostRef;
    parent: PostRef;
    text: string;
    langs?: string[];
  }): Promise<PostedReply> {
    const response = await this.#authedRequest("/api/reply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return (await response.json()) as PostedReply;
  }

  /** creates an `app.bsky.feed.like` record; returns its own uri/cid for unliking later */
  async like(subject: PostRef): Promise<CreatedRecord> {
    const response = await this.#authedRequest("/api/like", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(subject),
    });
    return (await response.json()) as CreatedRecord;
  }

  /** deletes a previously-created like record by its own at:// uri */
  async unlike(likeUri: string): Promise<void> {
    await this.#authedRequest(`/api/like?uri=${encodeURIComponent(likeUri)}`, {
      method: "DELETE",
    });
  }

  /** creates an `app.bsky.feed.repost` record; returns its own uri/cid for undoing later */
  async repost(subject: PostRef): Promise<CreatedRecord> {
    const response = await this.#authedRequest("/api/repost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(subject),
    });
    return (await response.json()) as CreatedRecord;
  }

  /** deletes a previously-created repost record by its own at:// uri */
  async unrepost(repostUri: string): Promise<void> {
    await this.#authedRequest(
      `/api/repost?uri=${encodeURIComponent(repostUri)}`,
      { method: "DELETE" },
    );
  }

  /**
   * Reads the signed-in reader's existing like/repost records for the given
   * posts.
   *
   * The public AppView never reports viewer state, so this is what tells the
   * UI which hearts are already filled — including reactions made in another
   * client. Pass only posts whose public count is non-zero: each one costs a
   * lookup, and a comment nobody has liked cannot be one this reader liked.
   * Resolves with empty maps rather than throwing when the bridge cannot
   * reach its index.
   */
  async viewerReactions(subjects: ViewerSubjects): Promise<ViewerReactions> {
    const query = new URLSearchParams();
    for (const uri of subjects.likes) query.append("like", uri);
    for (const uri of subjects.reposts) query.append("repost", uri);
    if ([...query].length === 0) return { likes: {}, reposts: {} };
    const response = await this.#authedRequest(
      `/api/viewer?${query.toString()}`,
      { method: "GET" },
    );
    return (await response.json()) as ViewerReactions;
  }

  async #authedRequest(
    path: string,
    init: { method: string; headers?: Record<string, string>; body?: string },
  ): Promise<Response> {
    const response = await this.#send(path, init);
    if (response.status === 401) {
      this.#storeToken(null);
      throw new ServiceError(
        "Session expired — sign in again",
        401,
        "NoSession",
      );
    }
    if (!response.ok) {
      throw await toServiceError(response);
    }
    return response;
  }
}

const toServiceError = async (response: Response): Promise<ServiceError> => {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  };
  return new ServiceError(
    body.message ?? `Request failed (HTTP ${response.status})`,
    response.status,
    body.error,
  );
};
