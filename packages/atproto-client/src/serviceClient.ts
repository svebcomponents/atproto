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

export interface PostedReply {
  uri: string;
  cid: string;
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

/**
 * Browser-side client for the hosted OAuth/posting bridge. Holds the
 * origin-bound session token (in memory + localStorage, keyed per service),
 * runs the popup sign-in handshake, and calls the reply API.
 */
export class ServiceClient {
  #token: string | null = null;

  constructor(
    serviceUrl: string,
    private readonly fetchImpl: typeof globalThis.fetch = globalThis.fetch,
  ) {
    // resolve relative service URLs (e.g. same-origin "/atproto") to absolute
    const base = globalThis.location?.href;
    this.serviceUrl = new URL(serviceUrl, base).href.replace(/\/$/, "");
    this.#token = this.#readStoredToken();
  }

  private readonly serviceUrl: string;

  get #storageKey(): string {
    return `${SESSION_STORAGE_PREFIX}${this.serviceUrl}`;
  }

  #readStoredToken(): string | null {
    try {
      return globalThis.localStorage?.getItem(this.#storageKey) ?? null;
    } catch {
      return null;
    }
  }

  #storeToken(token: string | null): void {
    this.#token = token;
    try {
      if (token) globalThis.localStorage?.setItem(this.#storageKey, token);
      else globalThis.localStorage?.removeItem(this.#storageKey);
    } catch {
      // storage unavailable (private mode / SSR) — memory token still works
    }
  }

  get hasToken(): boolean {
    return this.#token !== null;
  }

  /** current session, or null if signed out / token no longer valid */
  async getSession(): Promise<ServiceSessionInfo | null> {
    if (!this.#token) return null;
    const response = await this.fetchImpl(`${this.serviceUrl}/api/session`, {
      headers: { authorization: `Bearer ${this.#token}` },
    });
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
   * Opens the bridge sign-in popup and resolves once it posts back a session
   * for this page's origin. Must be called from a user gesture (click) so the
   * popup isn't blocked.
   */
  async signIn(): Promise<ServiceSessionInfo> {
    const origin = globalThis.location.origin;
    const startUrl = `${this.serviceUrl}/oauth/start?origin=${encodeURIComponent(origin)}`;
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

    return new Promise<ServiceSessionInfo>((resolve, reject) => {
      const onMessage = (event: MessageEvent) => {
        // the bridge posts to our exact origin; only trust our service origin
        if (new URL(this.serviceUrl).origin !== event.origin) return;
        const data = event.data as {
          type?: string;
          token?: string;
          did?: string;
          handle?: string;
          displayName?: string;
          avatarUrl?: string;
        };
        if (data?.type !== "atproto-comments:session" || !data.token) return;
        cleanup();
        this.#storeToken(data.token);
        resolve({
          did: data.did ?? "",
          ...(data.handle ? { handle: data.handle } : {}),
          ...(data.displayName ? { displayName: data.displayName } : {}),
          ...(data.avatarUrl ? { avatarUrl: data.avatarUrl } : {}),
        });
      };
      const poll = globalThis.setInterval(() => {
        if (popup.closed) {
          cleanup();
          reject(new ServiceError("Sign-in was cancelled", 0, "Cancelled"));
        }
      }, 500);
      const cleanup = () => {
        globalThis.removeEventListener("message", onMessage);
        globalThis.clearInterval(poll);
      };
      globalThis.addEventListener("message", onMessage);
    });
  }

  async signOut(): Promise<void> {
    if (this.#token) {
      await this.fetchImpl(`${this.serviceUrl}/api/session/logout`, {
        method: "POST",
        headers: { authorization: `Bearer ${this.#token}` },
      }).catch(() => {
        // best-effort; clear locally regardless
      });
    }
    this.#storeToken(null);
  }

  async postReply(input: {
    root: PostRef;
    parent: PostRef;
    text: string;
    langs?: string[];
  }): Promise<PostedReply> {
    if (!this.#token) {
      throw new ServiceError("Not signed in", 401, "NoSession");
    }
    const response = await this.fetchImpl(`${this.serviceUrl}/api/reply`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.#token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    });
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
    return (await response.json()) as PostedReply;
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
