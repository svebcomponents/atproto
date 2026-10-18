import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  PermissionSetConfig,
  ServiceConfig,
  ServiceSession,
  ServiceSessionStore,
} from "./config.js";
import { createAtprotoCommentsService } from "./handlers.js";
import type { OAuthBridgeClient, OAuthPdsSession } from "./oauthClient.js";

const SERVICE = "https://comments.example";
const BLOG = "https://blog.example";
const EXTENSION = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
const DID = "did:plc:reader";

const FEEDS: PermissionSetConfig = {
  clientName: "Reader App (via comments.example)",
  description: "Read your feeds and timeline",
  origins: [EXTENSION],
  methods: [
    {
      nsid: "app.bsky.feed.getTimeline",
      aud: "did:web:api.bsky.app#bsky_appview",
    },
  ],
};

const memoryStore = () => {
  const map = new Map<string, ServiceSession>();
  return {
    map,
    async set(sid: string, session: ServiceSession) {
      map.set(sid, session);
    },
    async get(sid: string) {
      return map.get(sid);
    },
    async del(sid: string) {
      map.delete(sid);
    },
  } satisfies ServiceSessionStore & { map: Map<string, ServiceSession> };
};

const pdsSession = (): OAuthPdsSession => ({
  did: DID,
  fetchHandler: vi.fn(
    async () =>
      new Response(JSON.stringify({ uri: "at://x/y/z", cid: "bafy" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  ),
});

/**
 * A fake OAuth client whose callback echoes the state its last authorize()
 * call was given, like the real library does.
 */
const fakeClient = (clientId: string) => {
  let lastState = "";
  const session = pdsSession();
  const client = {
    clientMetadata: { client_id: clientId },
    jwks: { keys: [] },
    authorize: vi.fn(async (_handle: string, options: { state: string }) => {
      lastState = options.state;
      return new URL("https://pds.example/authorize");
    }),
    callback: vi.fn(async () => ({
      session: { did: DID } as OAuthPdsSession,
      state: lastState,
    })),
    restore: vi.fn(async () => session),
    revoke: vi.fn(async () => undefined),
    /** the PDS session restore() hands out */
    session,
    /** lets a test hand the callback a state of its choosing */
    setState(state: unknown) {
      lastState = JSON.stringify(state);
    },
  };
  return client satisfies OAuthBridgeClient;
};

const baseConfig = (
  serviceSessionStore: ServiceSessionStore,
  over: Partial<ServiceConfig> = {},
): ServiceConfig => ({
  publicUrl: SERVICE,
  sessionSecret: "test-secret-that-is-at-least-32-chars-long",
  stateStore: { set: vi.fn(), get: vi.fn(), del: vi.fn() },
  sessionStore: { set: vi.fn(), get: vi.fn(), del: vi.fn() },
  serviceSessionStore,
  permissionSets: { feeds: FEEDS },
  fetch: vi.fn(
    async () =>
      new Response(JSON.stringify({ handle: "reader.test" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  ) as unknown as typeof fetch,
  ...over,
});

const startUrl = (origin: string, query = "") =>
  `${SERVICE}/atproto/oauth/start?origin=${encodeURIComponent(origin)}${query}`;

describe("permission sets", () => {
  let store: ReturnType<typeof memoryStore>;
  let defaultClient: ReturnType<typeof fakeClient>;
  let feedsClient: ReturnType<typeof fakeClient>;

  const service = (over: Partial<ServiceConfig> = {}) =>
    createAtprotoCommentsService(baseConfig(store, over), {
      oauthClient: defaultClient,
      permissionSetOAuthClients: { feeds: feedsClient },
    });

  /** runs a whole sign-in and collects the token, as the client would */
  const signIn = async (
    svc: ReturnType<typeof service>,
    origin: string,
    access?: string,
  ): Promise<string> => {
    const query = `&claim=c1&handle=reader.test${access ? `&access=${access}` : ""}`;
    await svc.fetch(new Request(startUrl(origin, query)));
    const callback = access
      ? `${SERVICE}/atproto/clients/${access}/oauth/callback?code=x`
      : `${SERVICE}/atproto/oauth/callback?code=x`;
    await svc.fetch(new Request(callback));
    const claim = await svc.fetch(
      new Request(`${SERVICE}/atproto/api/session/claim?nonce=c1`, {
        headers: { origin },
      }),
    );
    const { token } = (await claim!.json()) as { token: string };
    return token;
  };

  const api = (
    path: string,
    token: string,
    origin: string,
    method = "GET",
    body?: unknown,
  ) =>
    new Request(`${SERVICE}/atproto${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        origin,
        "content-type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

  beforeEach(() => {
    store = memoryStore();
    defaultClient = fakeClient(`${SERVICE}/atproto/client-metadata.json`);
    feedsClient = fakeClient(
      `${SERVICE}/atproto/clients/feeds/client-metadata.json`,
    );
  });

  it("serves each set's client metadata under /clients/<name>", async () => {
    const svc = service();
    const set = await svc.fetch(
      new Request(`${SERVICE}/atproto/clients/feeds/client-metadata.json`),
    );
    expect(await set!.json()).toEqual(feedsClient.clientMetadata);
    const unknown = await svc.fetch(
      new Request(`${SERVICE}/atproto/clients/nope/client-metadata.json`),
    );
    expect(unknown!.status).toBe(404);
  });

  it("leaves the default client alone", async () => {
    const svc = service();
    const metadata = await svc.fetch(
      new Request(`${SERVICE}/atproto/client-metadata.json`),
    );
    expect(await metadata!.json()).toEqual(defaultClient.clientMetadata);

    await signIn(svc, BLOG);
    expect(defaultClient.authorize).toHaveBeenCalledOnce();
    expect(feedsClient.authorize).not.toHaveBeenCalled();
  });

  it("lists the requested access on the sign-in page and keeps it through the form", async () => {
    const res = await service().fetch(
      new Request(startUrl(EXTENSION, "&access=feeds")),
    );
    const html = await res!.text();
    expect(res!.status).toBe(200);
    expect(html).toContain("Read your feeds and timeline");
    expect(html).toContain("who you follow and what you see");
    expect(html).toMatch(/name="access" value="feeds"/);
  });

  it("refuses a set to an origin it does not list", async () => {
    const res = await service().fetch(
      new Request(startUrl(BLOG, "&access=feeds&handle=reader.test")),
    );
    expect(res!.status).toBe(403);
    expect(feedsClient.authorize).not.toHaveBeenCalled();
  });

  it("refuses a set the operator does not offer", async () => {
    const res = await service().fetch(
      new Request(startUrl(EXTENSION, "&access=everything")),
    );
    expect(res!.status).toBe(400);
  });

  it("signs in through the set's own client and records the set", async () => {
    const svc = service();
    const token = await signIn(svc, EXTENSION, "feeds");
    expect(feedsClient.authorize).toHaveBeenCalledOnce();
    expect(defaultClient.authorize).not.toHaveBeenCalled();
    expect([...store.map.values()]).toMatchObject([
      { did: DID, origin: EXTENSION, access: "feeds" },
    ]);

    const session = await svc.fetch(api("/api/session", token, EXTENSION));
    expect(await session!.json()).toMatchObject({ did: DID, access: "feeds" });
  });

  it("acts through the client the session signed in with", async () => {
    const svc = service();
    const token = await signIn(svc, EXTENSION, "feeds");
    const like = await svc.fetch(
      api("/api/like", token, EXTENSION, "POST", {
        uri: "at://did:plc:author/app.bsky.feed.post/abc",
        cid: "bafyroot234567",
      }),
    );
    expect(like!.status).toBe(200);
    expect(feedsClient.restore).toHaveBeenCalledWith(DID);
    expect(defaultClient.restore).not.toHaveBeenCalled();
  });

  it("refuses to finish a flow on another client's callback", async () => {
    const svc = service();
    // a default-client state arriving at the feeds callback
    feedsClient.setState({ origin: EXTENSION, claim: "c1" });
    const onSet = await svc.fetch(
      new Request(`${SERVICE}/atproto/clients/feeds/oauth/callback?code=x`),
    );
    expect(onSet!.status).toBe(400);
    // a feeds state arriving at the default callback
    defaultClient.setState({ origin: EXTENSION, access: "feeds", claim: "c1" });
    const onDefault = await svc.fetch(
      new Request(`${SERVICE}/atproto/oauth/callback?code=x`),
    );
    expect(onDefault!.status).toBe(400);
    expect(store.map.size).toBe(0);
  });

  it("refuses a set's callback for an origin the set does not list", async () => {
    feedsClient.setState({ origin: BLOG, access: "feeds", claim: "c1" });
    const res = await service().fetch(
      new Request(`${SERVICE}/atproto/clients/feeds/oauth/callback?code=x`),
    );
    expect(res!.status).toBe(400);
    expect(store.map.size).toBe(0);
  });

  it("signing out revokes only the session's own client", async () => {
    const svc = service();
    const blogToken = await signIn(svc, BLOG);
    const extensionToken = await signIn(svc, EXTENSION, "feeds");

    await svc.fetch(
      api("/api/session/logout", extensionToken, EXTENSION, "POST"),
    );
    expect(feedsClient.revoke).toHaveBeenCalledWith(DID);
    expect(defaultClient.revoke).not.toHaveBeenCalled();

    // the blog's session and login are untouched
    const blog = await svc.fetch(api("/api/session", blogToken, BLOG));
    expect(blog!.status).toBe(200);

    await svc.fetch(api("/api/session/logout", blogToken, BLOG, "POST"));
    expect(defaultClient.revoke).toHaveBeenCalledWith(DID);
    expect(feedsClient.revoke).toHaveBeenCalledOnce();
  });

  it("retiring a token ends its session but keeps the login", async () => {
    const svc = service();
    const token = await signIn(svc, BLOG);
    const res = await svc.fetch(
      api("/api/session/retire", token, BLOG, "POST"),
    );
    expect(res!.status).toBe(200);
    expect(store.map.size).toBe(0);
    expect(defaultClient.revoke).not.toHaveBeenCalled();
    const after = await svc.fetch(api("/api/session", token, BLOG));
    expect(after!.status).toBe(401);
  });

  it("a session whose set was removed from config can no longer act", async () => {
    const token = await signIn(service(), EXTENSION, "feeds");
    const without = service({ permissionSets: {} });
    const res = await without.fetch(api("/api/session", token, EXTENSION));
    expect(res!.status).toBe(401);
  });

  it("cookie mode replaces the site's previous session on step-up", async () => {
    const svc = service({
      publicUrl: "http://127.0.0.1:5173",
      sessionMode: "cookie",
      permissionSets: { feeds: { ...FEEDS, origins: [BLOG] } },
    });
    const callback = async (path: string, cookie?: string) => {
      const res = await svc.fetch(
        new Request(`http://127.0.0.1:5173/atproto${path}?code=x`, {
          ...(cookie ? { headers: { cookie } } : {}),
        }),
      );
      return /atproto_comments_session=([^;]+)/.exec(
        res!.headers.get("set-cookie") ?? "",
      )![1]!;
    };

    defaultClient.setState({ origin: BLOG });
    const first = await callback("/oauth/callback");
    expect(store.map.has(first)).toBe(true);

    feedsClient.setState({ origin: BLOG, access: "feeds" });
    const second = await callback(
      "/clients/feeds/oauth/callback",
      `atproto_comments_session=${first}`,
    );
    expect(store.map.has(first)).toBe(false);
    expect(store.map.get(second)).toMatchObject({ access: "feeds" });
  });
  it("cookie-mode sessions act and sign out through their set's client", async () => {
    const svc = service({
      publicUrl: "http://127.0.0.1:5173",
      sessionMode: "cookie",
      permissionSets: { feeds: { ...FEEDS, origins: [BLOG] } },
    });
    feedsClient.setState({ origin: BLOG, access: "feeds" });
    const res = await svc.fetch(
      new Request(
        "http://127.0.0.1:5173/atproto/clients/feeds/oauth/callback?code=x",
      ),
    );
    const sid = /atproto_comments_session=([^;]+)/.exec(
      res!.headers.get("set-cookie") ?? "",
    )![1]!;
    const request = (path: string, body?: unknown) =>
      new Request(`http://127.0.0.1:5173/atproto${path}`, {
        method: "POST",
        headers: {
          cookie: `atproto_comments_session=${sid}`,
          origin: BLOG,
          "content-type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

    const like = await svc.fetch(
      request("/api/like", {
        uri: "at://did:plc:author/app.bsky.feed.post/abc",
        cid: "bafyroot234567",
      }),
    );
    expect(like!.status).toBe(200);
    expect(feedsClient.restore).toHaveBeenCalledWith(DID);
    expect(defaultClient.restore).not.toHaveBeenCalled();

    await svc.fetch(request("/api/session/logout"));
    expect(feedsClient.revoke).toHaveBeenCalledWith(DID);
    expect(defaultClient.revoke).not.toHaveBeenCalled();
  });

  it("ignores set names that are not the operator's own keys", async () => {
    const svc = service();
    for (const name of ["constructor", "__proto__", "toString"]) {
      const start = await svc.fetch(
        new Request(startUrl(EXTENSION, `&access=${name}`)),
      );
      expect(start!.status).toBe(400);
      const metadata = await svc.fetch(
        new Request(`${SERVICE}/atproto/clients/${name}/client-metadata.json`),
      );
      expect(metadata!.status).toBe(404);
    }
  });

  describe("xrpc proxy", () => {
    const timeline = "/api/xrpc/app.bsky.feed.getTimeline?limit=2";
    const upstream = (response: Response) =>
      vi
        .mocked(feedsClient.session.fetchHandler)
        .mockResolvedValueOnce(response);

    it("forwards a granted query to the service the set names", async () => {
      const svc = service();
      const token = await signIn(svc, EXTENSION, "feeds");
      upstream(
        new Response(JSON.stringify({ feed: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      const request = api(timeline, token, EXTENSION);
      request.headers.set("accept-language", "de, en;q=0.8");
      // a caller cannot pick the upstream service
      request.headers.set("atproto-proxy", "did:web:evil.example#svc");
      const res = await svc.fetch(request);

      expect(res!.status).toBe(200);
      expect(await res!.json()).toEqual({ feed: [] });
      expect(res!.headers.get("cache-control")).toBe("no-store");
      expect(res!.headers.get("access-control-allow-origin")).toBe(EXTENSION);
      expect(feedsClient.session.fetchHandler).toHaveBeenCalledWith(
        "/xrpc/app.bsky.feed.getTimeline?limit=2",
        {
          method: "GET",
          headers: {
            accept: "application/json",
            "atproto-proxy": "did:web:api.bsky.app#bsky_appview",
            "accept-language": "de, en;q=0.8",
          },
        },
      );
    });

    it("refuses queries outside the session's set", async () => {
      const svc = service();
      const token = await signIn(svc, EXTENSION, "feeds");
      const res = await svc.fetch(
        api("/api/xrpc/app.bsky.graph.getMutes", token, EXTENSION),
      );
      expect(res!.status).toBe(403);
      expect(feedsClient.session.fetchHandler).not.toHaveBeenCalled();
    });

    it("refuses every query to a comment-section session", async () => {
      const svc = service();
      const token = await signIn(svc, BLOG);
      const res = await svc.fetch(api(timeline, token, BLOG));
      expect(res!.status).toBe(403);
      expect(defaultClient.restore).not.toHaveBeenCalled();
    });

    it("forwards queries only", async () => {
      const svc = service();
      const token = await signIn(svc, EXTENSION, "feeds");
      const res = await svc.fetch(api(timeline, token, EXTENSION, "POST", {}));
      expect(res!.status).toBe(405);
    });

    it("refuses a malformed NSID", async () => {
      const svc = service();
      const token = await signIn(svc, EXTENSION, "feeds");
      const res = await svc.fetch(
        api("/api/xrpc/..%2F..%2Fsecret", token, EXTENSION),
      );
      expect(res!.status).toBe(400);
    });

    it("requires a session", async () => {
      const res = await service().fetch(
        new Request(`${SERVICE}/atproto${timeline}`, {
          headers: { origin: EXTENSION },
        }),
      );
      expect(res!.status).toBe(401);
    });

    it("applies its own rate limit", async () => {
      const svc = service({ proxyRateLimiter: () => false });
      const token = await signIn(svc, EXTENSION, "feeds");
      const res = await svc.fetch(api(timeline, token, EXTENSION));
      expect(res!.status).toBe(429);
    });

    it("does not pass an upstream 401 through as a bridge 401", async () => {
      const svc = service();
      const token = await signIn(svc, EXTENSION, "feeds");
      upstream(new Response("{}", { status: 401 }));
      const res = await svc.fetch(api(timeline, token, EXTENSION));
      expect(res!.status).toBe(403);
      expect((await res!.json()) as object).toMatchObject({
        error: "UpstreamForbidden",
      });
    });

    it("maps upstream failures to 502", async () => {
      const svc = service();
      const token = await signIn(svc, EXTENSION, "feeds");
      upstream(new Response("{}", { status: 500 }));
      const res = await svc.fetch(api(timeline, token, EXTENSION));
      expect(res!.status).toBe(502);
    });
  });

  describe("service auth", () => {
    const GATEWAY = {
      aud: "did:web:gateway.example",
      lxm: "com.example.classify",
    };
    const withAuth = (over: Partial<ServiceConfig> = {}) =>
      service({
        permissionSets: { feeds: { ...FEEDS, serviceAuth: [GATEWAY] } },
        ...over,
      });
    const requestToken = (token: string, body: unknown = GATEWAY) =>
      api("/api/service-auth", token, EXTENSION, "POST", body);

    it("asks the reader's PDS for a token the set lists", async () => {
      const svc = withAuth();
      const token = await signIn(svc, EXTENSION, "feeds");
      vi.mocked(feedsClient.session.fetchHandler).mockResolvedValueOnce(
        new Response(JSON.stringify({ token: "service-jwt" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      const res = await svc.fetch(requestToken(token));
      expect(res!.status).toBe(200);
      expect(await res!.json()).toEqual({ token: "service-jwt" });
      expect(res!.headers.get("cache-control")).toBe("no-store");

      const [path, init] = vi.mocked(feedsClient.session.fetchHandler).mock
        .calls[0]!;
      const url = new URL(path, "https://pds.example");
      expect(url.pathname).toBe("/xrpc/com.atproto.server.getServiceAuth");
      expect(url.searchParams.get("aud")).toBe(GATEWAY.aud);
      expect(url.searchParams.get("lxm")).toBe(GATEWAY.lxm);
      // the PDS picks the expiry (60 seconds) by its own clock
      expect(url.searchParams.has("exp")).toBe(false);
      // served by the PDS itself, never proxied
      expect(JSON.stringify(init)).not.toContain("atproto-proxy");
    });

    it("refuses a pair the set does not list", async () => {
      const svc = withAuth();
      const token = await signIn(svc, EXTENSION, "feeds");
      const res = await svc.fetch(
        requestToken(token, { ...GATEWAY, aud: "did:web:other.example" }),
      );
      expect(res!.status).toBe(403);
      expect(feedsClient.session.fetchHandler).not.toHaveBeenCalled();
    });

    it("refuses a comment-section session", async () => {
      const svc = withAuth();
      const token = await signIn(svc, BLOG);
      const res = await svc.fetch(
        api("/api/service-auth", token, BLOG, "POST", GATEWAY),
      );
      expect(res!.status).toBe(403);
    });

    it("requires aud and lxm", async () => {
      const svc = withAuth();
      const token = await signIn(svc, EXTENSION, "feeds");
      const res = await svc.fetch(requestToken(token, { aud: GATEWAY.aud }));
      expect(res!.status).toBe(400);
    });

    it("maps a PDS refusal to 403 and a missing token to 502", async () => {
      const svc = withAuth();
      const token = await signIn(svc, EXTENSION, "feeds");
      vi.mocked(feedsClient.session.fetchHandler)
        .mockResolvedValueOnce(new Response("{}", { status: 403 }))
        .mockResolvedValueOnce(new Response("{}", { status: 200 }));
      expect((await svc.fetch(requestToken(token)))!.status).toBe(403);
      expect((await svc.fetch(requestToken(token)))!.status).toBe(502);
    });
  });
});
