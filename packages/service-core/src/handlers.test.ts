import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ServiceConfig,
  ServiceSession,
  ServiceSessionStore,
} from "./config.js";
import { createMemoryRateLimiter } from "./config.js";
import {
  createAtprotoCommentsService,
  type AtprotoCommentsService,
  type CreateServiceOptions,
} from "./handlers.js";
import type { CommentStreamBroker } from "./commentStream.js";
import type { OAuthBridgeClient, OAuthPdsSession } from "./oauthClient.js";
import type { SignInPageRenderer } from "./pages.js";

const ORIGIN = "https://blog.example";
const SERVICE = "https://comments.example";
const DID = "did:plc:commenter";

const memoryStore = (): ServiceSessionStore => {
  const map = new Map<string, ServiceSession>();
  return {
    async set(sid, session) {
      map.set(sid, session);
    },
    async get(sid) {
      return map.get(sid);
    },
    async del(sid) {
      map.delete(sid);
    },
  };
};

// a fake PDS fetch handler that records createRecord/deleteRecord calls
let createRecordCalls: unknown[] = [];
let deleteRecordCalls: unknown[] = [];
const fakePdsSession: OAuthPdsSession = {
  did: DID,
  async fetchHandler(pathname, init) {
    if (pathname === "/xrpc/com.atproto.repo.createRecord") {
      const body = JSON.parse(String(init?.body)) as { collection: string };
      createRecordCalls.push(body);
      return new Response(
        JSON.stringify({
          uri: `at://${DID}/${body.collection}/newrecord`,
          cid: "bafynewrecord",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (pathname === "/xrpc/com.atproto.repo.deleteRecord") {
      deleteRecordCalls.push(JSON.parse(String(init?.body)));
      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("not found", { status: 404 });
  },
};

const fakeOAuthClient: OAuthBridgeClient = {
  clientMetadata: { client_id: `${SERVICE}/atproto/client-metadata.json` },
  jwks: { keys: [] },
  authorize: vi.fn(async () => new URL("https://pds.example/authorize?x=1")),
  callback: vi.fn(async () => ({
    session: { did: DID } as OAuthPdsSession,
    state: JSON.stringify({ origin: ORIGIN, nonce: "n1" }),
  })),
  restore: vi.fn(async () => fakePdsSession),
  revoke: vi.fn(async () => undefined),
};

const baseConfig = (
  serviceSessionStore: ServiceSessionStore,
): ServiceConfig => ({
  publicUrl: SERVICE,
  sessionSecret: "test-secret-that-is-at-least-32-chars-long",
  stateStore: { set: vi.fn(), get: vi.fn(), del: vi.fn() },
  sessionStore: { set: vi.fn(), get: vi.fn(), del: vi.fn() },
  serviceSessionStore,
  // profile fetch: return a snapshot
  fetch: vi.fn(
    async () =>
      new Response(
        JSON.stringify({ handle: "commenter.test", avatar: "a.jpg" }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
  ) as unknown as typeof fetch,
});

/** drives the popup callback to obtain a real bearer token for the API tests */
const signIn = async (service: AtprotoCommentsService): Promise<string> => {
  const res = await service.fetch(
    new Request(`${SERVICE}/atproto/oauth/callback?code=abc&state=xyz`),
  );
  const body = await res!.text();
  const token = /"token":"([^"]+)"/.exec(body)?.[1];
  if (!token) throw new Error("no token minted");
  return token;
};

const post = (path: string, token: string, body?: unknown) =>
  new Request(`${SERVICE}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      origin: ORIGIN,
      "content-type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

const del = (path: string, token: string) =>
  new Request(`${SERVICE}${path}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}`, origin: ORIGIN },
  });

describe("service handlers", () => {
  let service: AtprotoCommentsService;
  let store: ServiceSessionStore;

  beforeEach(() => {
    createRecordCalls = [];
    deleteRecordCalls = [];
    store = memoryStore();
    service = createAtprotoCommentsService(baseConfig(store), {
      oauthClient: fakeOAuthClient,
    });
  });

  it("ignores routes outside the base path", async () => {
    expect(
      await service.fetch(new Request(`${SERVICE}/unrelated`)),
    ).toBeUndefined();
  });

  it("serves client metadata and jwks", async () => {
    const meta = await service.fetch(
      new Request(`${SERVICE}/atproto/client-metadata.json`),
    );
    expect(meta!.status).toBe(200);
    expect(await meta!.json()).toMatchObject({ client_id: expect.any(String) });
  });

  it("shows the sign-in form when no handle is given", async () => {
    const res = await service.fetch(
      new Request(
        `${SERVICE}/atproto/oauth/start?origin=${encodeURIComponent(ORIGIN)}`,
      ),
    );
    expect(res!.headers.get("content-type")).toContain("text/html");
    expect(await res!.text()).toContain("Sign in to the ATmosphere to comment");
  });

  it("rejects oauth/start without a valid origin", async () => {
    const res = await service.fetch(
      new Request(`${SERVICE}/atproto/oauth/start`),
    );
    expect(res!.status).toBe(400);
  });

  it("redirects to the PDS when a handle is provided", async () => {
    const res = await service.fetch(
      new Request(
        `${SERVICE}/atproto/oauth/start?origin=${encodeURIComponent(ORIGIN)}&handle=commenter.test`,
      ),
    );
    expect(res!.status).toBe(302);
    expect(res!.headers.get("location")).toContain("pds.example");
  });

  it("carries the claim nonce through the handle-input form into authorize state", async () => {
    // regression: the form shown when no handle is given must preserve the
    // claim nonce, or the handle submission drops it and the callback never
    // stores a claim (poll 404s forever).
    const CLAIM = "claim-xyz";

    // 1. popup opens with a claim but no handle → renders the form
    const form = await service.fetch(
      new Request(
        `${SERVICE}/atproto/oauth/start?origin=${encodeURIComponent(ORIGIN)}&claim=${CLAIM}`,
      ),
    );
    const formHtml = await form!.text();
    expect(formHtml).toContain(`name="claim"`);
    expect(formHtml).toContain(`value="${CLAIM}"`);

    // 2. the form submits handle + the preserved claim → authorize gets it in state
    await service.fetch(
      new Request(
        `${SERVICE}/atproto/oauth/start?origin=${encodeURIComponent(ORIGIN)}&handle=commenter.test&claim=${CLAIM}`,
      ),
    );
    const authorizeState = JSON.parse(
      vi.mocked(fakeOAuthClient.authorize).mock.calls.at(-1)![1].state,
    ) as { claim?: string };
    expect(authorizeState.claim).toBe(CLAIM);
  });

  it("callback page closes itself without requiring window.opener", async () => {
    // regression: the OAuth provider's COOP swap severs window.opener, so a
    // self-close gated on the opener never runs and the tab lingers. The
    // close must be unconditional (after the best-effort postMessage).
    const res = await service.fetch(
      new Request(`${SERVICE}/atproto/oauth/callback?code=abc&state=xyz`),
    );
    const html = await res!.text();
    const openerGuard = html.indexOf("if (window.opener)");
    const openerGuardEnd = html.indexOf("catch (e) {}", openerGuard);
    const selfClose = html.indexOf("window.close()");
    expect(openerGuard).toBeGreaterThan(-1);
    expect(selfClose).toBeGreaterThan(openerGuardEnd);
    expect(html).toContain("setTimeout");
  });

  it("hands off the session by claim nonce (COOP-safe path)", async () => {
    // callback carries a claim nonce in state
    vi.mocked(fakeOAuthClient.callback).mockResolvedValueOnce({
      session: { did: DID } as OAuthPdsSession,
      state: JSON.stringify({
        origin: ORIGIN,
        nonce: "csrf",
        claim: "claim-1",
      }),
    });
    await service.fetch(
      new Request(`${SERVICE}/atproto/oauth/callback?code=abc&state=xyz`),
    );

    // the opener polls with the nonce and gets the session once
    const claimed = await service.fetch(
      new Request(`${SERVICE}/atproto/api/session/claim?nonce=claim-1`, {
        headers: { origin: ORIGIN },
      }),
    );
    expect(claimed!.status).toBe(200);
    expect(claimed!.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const body = (await claimed!.json()) as { token: string; handle: string };
    expect(body.token).toBeTruthy();
    expect(body.handle).toBe("commenter.test");

    // the token works, and the claim is one-time (second read is 404)
    const session = await service.fetch(
      new Request(`${SERVICE}/atproto/api/session`, {
        headers: { authorization: `Bearer ${body.token}`, origin: ORIGIN },
      }),
    );
    expect(session!.status).toBe(200);
    const second = await service.fetch(
      new Request(`${SERVICE}/atproto/api/session/claim?nonce=claim-1`),
    );
    expect(second!.status).toBe(404);
  });

  it("supports same-origin HttpOnly cookie sessions without returning a JWT", async () => {
    vi.mocked(fakeOAuthClient.callback).mockResolvedValueOnce({
      session: { did: DID } as OAuthPdsSession,
      state: JSON.stringify({
        origin: ORIGIN,
        nonce: "csrf",
        claim: "cookie-claim",
      }),
    });
    service = createAtprotoCommentsService(
      { ...baseConfig(store), sessionMode: "cookie" },
      { oauthClient: fakeOAuthClient },
    );

    const callback = await service.fetch(
      new Request(`${SERVICE}/atproto/oauth/callback?code=abc&state=xyz`),
    );
    const cookie = callback!.headers.get("set-cookie");
    expect(cookie).toContain("atproto_comments_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(await callback!.text()).not.toContain('"token":');

    const claim = await service.fetch(
      new Request(`${SERVICE}/atproto/api/session/claim?nonce=cookie-claim`, {
        headers: { origin: ORIGIN },
      }),
    );
    expect(claim!.headers.get("access-control-allow-credentials")).toBe("true");
    expect(await claim!.json()).toMatchObject({ did: DID });

    const sessionCookie = cookie!.split(";")[0]!;
    const session = await service.fetch(
      new Request(`${SERVICE}/atproto/api/session`, {
        headers: { cookie: sessionCookie },
      }),
    );
    expect(session!.status).toBe(200);
    expect(await session!.json()).toMatchObject({ did: DID });

    const reply = await service.fetch(
      new Request(`${SERVICE}/atproto/api/reply`, {
        method: "POST",
        headers: {
          cookie: sessionCookie,
          origin: ORIGIN,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          root: {
            uri: `at://${DID}/app.bsky.feed.post/root`,
            cid: "bafyroot234567",
          },
          parent: {
            uri: `at://${DID}/app.bsky.feed.post/root`,
            cid: "bafyroot234567",
          },
          text: "cookie session reply",
        }),
      }),
    );
    expect(reply!.status).toBe(200);
  });

  it("carries a return url through oauth/start into authorize state", async () => {
    const RETURN_URL = `${ORIGIN}/posts/hello`;
    await service.fetch(
      new Request(
        `${SERVICE}/atproto/oauth/start?origin=${encodeURIComponent(ORIGIN)}&handle=commenter.test&return=${encodeURIComponent(RETURN_URL)}`,
      ),
    );
    const authorizeState = JSON.parse(
      vi.mocked(fakeOAuthClient.authorize).mock.calls.at(-1)![1].state,
    ) as { return?: string };
    expect(authorizeState.return).toBe(RETURN_URL);
  });

  it("drops a return url whose origin doesn't match the embedding origin", async () => {
    await service.fetch(
      new Request(
        `${SERVICE}/atproto/oauth/start?origin=${encodeURIComponent(ORIGIN)}&handle=commenter.test&return=${encodeURIComponent("https://evil.example/steal")}`,
      ),
    );
    const authorizeState = JSON.parse(
      vi.mocked(fakeOAuthClient.authorize).mock.calls.at(-1)![1].state,
    ) as { return?: string };
    expect(authorizeState.return).toBeUndefined();
  });

  it("redirects back to the return url with a session cookie in cookie mode (no-JS flow)", async () => {
    const RETURN_URL = `${ORIGIN}/posts/hello`;
    vi.mocked(fakeOAuthClient.callback).mockResolvedValueOnce({
      session: { did: DID } as OAuthPdsSession,
      state: JSON.stringify({
        origin: ORIGIN,
        nonce: "csrf",
        return: RETURN_URL,
      }),
    });
    service = createAtprotoCommentsService(
      { ...baseConfig(store), sessionMode: "cookie" },
      { oauthClient: fakeOAuthClient },
    );

    const callback = await service.fetch(
      new Request(`${SERVICE}/atproto/oauth/callback?code=abc&state=xyz`),
    );
    expect(callback!.status).toBe(303);
    expect(callback!.headers.get("location")).toBe(RETURN_URL);
    const cookie = callback!.headers.get("set-cookie");
    expect(cookie).toContain("atproto_comments_session=");
  });

  it("does not redirect on the no-JS return url in bearer mode (needs JS to store the token)", async () => {
    const RETURN_URL = `${ORIGIN}/posts/hello`;
    vi.mocked(fakeOAuthClient.callback).mockResolvedValueOnce({
      session: { did: DID } as OAuthPdsSession,
      state: JSON.stringify({
        origin: ORIGIN,
        nonce: "csrf",
        return: RETURN_URL,
      }),
    });
    const callback = await service.fetch(
      new Request(`${SERVICE}/atproto/oauth/callback?code=abc&state=xyz`),
    );
    expect(callback!.status).toBe(200);
    expect(await callback!.text()).toContain("Signed in");
  });

  it("returns 404 for an unknown claim nonce", async () => {
    const res = await service.fetch(
      new Request(`${SERVICE}/atproto/api/session/claim?nonce=nope`),
    );
    expect(res!.status).toBe(404);
  });

  it("completes the callback and posts a session to the opener origin", async () => {
    const res = await service.fetch(
      new Request(`${SERVICE}/atproto/oauth/callback?code=abc&state=xyz`),
    );
    const body = await res!.text();
    // targetOrigin must be the exact embedding origin, never "*"
    expect(body).toContain("postMessage(data, targetOrigin)");
    expect(body).toContain(`<textarea id="target-origin">${ORIGIN}</textarea>`);
    expect(body).not.toContain('postMessage(data, "*")');
    expect(body).toContain('"handle":"commenter.test"');
  });

  it("returns the session for a valid bearer token", async () => {
    const token = await signIn(service);
    const res = await service.fetch(
      new Request(`${SERVICE}/atproto/api/session`, {
        headers: { authorization: `Bearer ${token}`, origin: ORIGIN },
      }),
    );
    expect(res!.status).toBe(200);
    expect(res!.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(await res!.json()).toMatchObject({
      did: DID,
      handle: "commenter.test",
    });
  });

  it("rejects api calls without a token", async () => {
    const res = await service.fetch(
      new Request(`${SERVICE}/atproto/api/session`, {
        headers: { origin: ORIGIN },
      }),
    );
    expect(res!.status).toBe(401);
  });

  it("rejects a token presented from a different origin", async () => {
    const token = await signIn(service);
    const res = await service.fetch(
      new Request(`${SERVICE}/atproto/api/session`, {
        headers: {
          authorization: `Bearer ${token}`,
          origin: "https://evil.example",
        },
      }),
    );
    expect(res!.status).toBe(401);
  });

  it("streams public comment events for a canonical thread", async () => {
    const subscribed: string[] = [];
    const commentStreamBroker: CommentStreamBroker = {
      subscribe(threadUri) {
        subscribed.push(threadUri);
        return new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                `event: ready\ndata: {"thread":"${threadUri}"}\n\n`,
              ),
            );
            controller.close();
          },
        });
      },
      stats: () => ({
        threads: 0,
        subscribers: 0,
        upstreamConnections: 0,
      }),
    };
    service = createAtprotoCommentsService(baseConfig(store), {
      oauthClient: fakeOAuthClient,
      commentStreamBroker,
    });
    const thread = `at://${DID}/app.bsky.feed.post/root`;
    const res = await service.fetch(
      new Request(
        `${SERVICE}/atproto/api/comments/stream?thread=${encodeURIComponent(thread)}`,
      ),
    );

    expect(res!.status).toBe(200);
    expect(res!.headers.get("content-type")).toContain("text/event-stream");
    expect(res!.headers.get("access-control-allow-origin")).toBe("*");
    expect(await res!.text()).toContain("event: ready");
    expect(subscribed).toEqual([thread]);
  });

  it("rejects an invalid comment-stream thread", async () => {
    const res = await service.fetch(
      new Request(
        `${SERVICE}/atproto/api/comments/stream?thread=${encodeURIComponent("https://example.com/not-a-post")}`,
      ),
    );
    expect(res!.status).toBe(400);
    expect(await res!.json()).toMatchObject({ error: "InvalidThread" });
  });

  it("creates a reply post via the user's PDS session", async () => {
    const token = await signIn(service);
    const res = await service.fetch(
      post("/atproto/api/reply", token, {
        root: {
          uri: `at://${DID}/app.bsky.feed.post/root`,
          cid: "bafyroot234567",
        },
        parent: {
          uri: `at://${DID}/app.bsky.feed.post/root`,
          cid: "bafyroot234567",
        },
        text: "hello from the bridge",
      }),
    );
    expect(res!.status).toBe(200);
    expect(await res!.json()).toEqual({
      uri: `at://${DID}/app.bsky.feed.post/newrecord`,
      cid: "bafynewrecord",
    });
    expect(createRecordCalls).toHaveLength(1);
    expect(createRecordCalls[0]).toMatchObject({
      repo: DID,
      collection: "app.bsky.feed.post",
      record: {
        $type: "app.bsky.feed.post",
        text: "hello from the bridge",
        reply: { root: { uri: expect.stringContaining("root") } },
      },
    });
  });

  it("rejects an invalid reply body before touching the PDS", async () => {
    const token = await signIn(service);
    const res = await service.fetch(
      post("/atproto/api/reply", token, { text: "" }),
    );
    expect(res!.status).toBe(400);
    expect(createRecordCalls).toHaveLength(0);
  });

  it("enforces the reply rate limit", async () => {
    service = createAtprotoCommentsService(
      {
        ...baseConfig(store),
        replyRateLimiter: createMemoryRateLimiter(1, 60_000),
      },
      { oauthClient: fakeOAuthClient },
    );
    const token = await signIn(service);
    const body = {
      root: {
        uri: `at://${DID}/app.bsky.feed.post/root`,
        cid: "bafyroot234567",
      },
      parent: {
        uri: `at://${DID}/app.bsky.feed.post/root`,
        cid: "bafyroot234567",
      },
      text: "spammy",
    };
    const first = await service.fetch(post("/atproto/api/reply", token, body));
    const second = await service.fetch(post("/atproto/api/reply", token, body));
    expect(first!.status).toBe(200);
    expect(second!.status).toBe(429);
    expect(second!.headers.get("retry-after")).toBe("600");
  });

  describe("no-JS form submissions (cookie mode)", () => {
    let cookieService: AtprotoCommentsService;
    let sessionCookie: string;

    beforeEach(async () => {
      vi.mocked(fakeOAuthClient.callback).mockResolvedValueOnce({
        session: { did: DID } as OAuthPdsSession,
        state: JSON.stringify({ origin: ORIGIN, nonce: "csrf" }),
      });
      cookieService = createAtprotoCommentsService(
        { ...baseConfig(store), sessionMode: "cookie" },
        { oauthClient: fakeOAuthClient },
      );
      const callback = await cookieService.fetch(
        new Request(`${SERVICE}/atproto/oauth/callback?code=abc&state=xyz`),
      );
      sessionCookie = callback!.headers.get("set-cookie")!.split(";")[0]!;
    });

    const formPost = (
      path: string,
      body: Record<string, string>,
      referer?: string,
    ) =>
      new Request(`${SERVICE}${path}`, {
        method: "POST",
        headers: {
          cookie: sessionCookie,
          origin: ORIGIN,
          "content-type": "application/x-www-form-urlencoded",
          ...(referer ? { referer } : {}),
        },
        body: new URLSearchParams(body).toString(),
      });

    it("redirects to the explicit return field on success", async () => {
      const res = await cookieService.fetch(
        formPost("/atproto/api/like", {
          uri: `at://${DID}/app.bsky.feed.post/root`,
          cid: "bafyroot234567",
          return: `${ORIGIN}/posts/hello`,
        }),
      );
      expect(res!.status).toBe(303);
      expect(res!.headers.get("location")).toBe(`${ORIGIN}/posts/hello`);
    });

    it("falls back to the Referer header when no return field is given", async () => {
      const res = await cookieService.fetch(
        formPost(
          "/atproto/api/like",
          {
            uri: `at://${DID}/app.bsky.feed.post/root`,
            cid: "bafyroot234567",
          },
          `${ORIGIN}/posts/hello`,
        ),
      );
      expect(res!.status).toBe(303);
      expect(res!.headers.get("location")).toBe(`${ORIGIN}/posts/hello`);
    });

    // The query string and fragment are the part of a reader's URL most
    // likely to carry something private. They are stripped server-side rather
    // than trusted to the caller, because the value can also arrive from the
    // Referer header, which the browser fills in and which no attribute on a
    // <form> can suppress.
    it("strips the query and fragment from an explicit return field", async () => {
      const res = await cookieService.fetch(
        formPost("/atproto/api/like", {
          uri: `at://${DID}/app.bsky.feed.post/root`,
          cid: "bafyroot234567",
          return: `${ORIGIN}/posts/hello?session=secret&q=private#anchor`,
        }),
      );
      expect(res!.status).toBe(303);
      expect(res!.headers.get("location")).toBe(`${ORIGIN}/posts/hello`);
    });

    it("strips the query and fragment from the Referer fallback", async () => {
      const res = await cookieService.fetch(
        formPost(
          "/atproto/api/like",
          {
            uri: `at://${DID}/app.bsky.feed.post/root`,
            cid: "bafyroot234567",
          },
          `${ORIGIN}/posts/hello?session=secret#anchor`,
        ),
      );
      expect(res!.status).toBe(303);
      expect(res!.headers.get("location")).toBe(`${ORIGIN}/posts/hello`);
    });

    it("shows a plain success page when neither return nor Referer is present", async () => {
      const res = await cookieService.fetch(
        formPost("/atproto/api/like", {
          uri: `at://${DID}/app.bsky.feed.post/root`,
          cid: "bafyroot234567",
        }),
      );
      expect(res!.status).toBe(200);
      expect(res!.headers.get("content-type")).toContain("text/html");
      expect(await res!.text()).toContain("Done");
    });

    it("ignores a return field pointing at a different origin", async () => {
      const res = await cookieService.fetch(
        formPost("/atproto/api/like", {
          uri: `at://${DID}/app.bsky.feed.post/root`,
          cid: "bafyroot234567",
          return: "https://evil.example/steal",
        }),
      );
      expect(res!.status).toBe(200);
      expect(res!.headers.get("content-type")).toContain("text/html");
    });

    it("renders an HTML error page (not JSON) when a form submission is invalid", async () => {
      const res = await cookieService.fetch(
        formPost("/atproto/api/like", { uri: "not-a-uri", cid: "c" }),
      );
      expect(res!.status).toBe(400);
      expect(res!.headers.get("content-type")).toContain("text/html");
      expect(await res!.text()).toContain("Something went wrong");
    });

    it("submits a reply via form-encoded fields and redirects back", async () => {
      const res = await cookieService.fetch(
        formPost("/atproto/api/reply", {
          rootUri: `at://${DID}/app.bsky.feed.post/root`,
          rootCid: "bafyroot234567",
          parentUri: `at://${DID}/app.bsky.feed.post/root`,
          parentCid: "bafyroot234567",
          text: "hello without JS",
          return: `${ORIGIN}/posts/hello`,
        }),
      );
      expect(res!.status).toBe(303);
      expect(res!.headers.get("location")).toBe(`${ORIGIN}/posts/hello`);
      expect(createRecordCalls).toMatchObject([
        {
          collection: "app.bsky.feed.post",
          record: { text: "hello without JS" },
        },
      ]);
    });
  });

  it("likes a post via the user's PDS session", async () => {
    const token = await signIn(service);
    const res = await service.fetch(
      post("/atproto/api/like", token, {
        uri: `at://${DID}/app.bsky.feed.post/root`,
        cid: "bafyroot234567",
      }),
    );
    expect(res!.status).toBe(200);
    expect(await res!.json()).toEqual({
      uri: `at://${DID}/app.bsky.feed.like/newrecord`,
      cid: "bafynewrecord",
    });
    expect(createRecordCalls).toMatchObject([
      {
        repo: DID,
        collection: "app.bsky.feed.like",
        record: {
          $type: "app.bsky.feed.like",
          subject: { uri: expect.stringContaining("root") },
        },
      },
    ]);
  });

  it("reposts a post via the user's PDS session", async () => {
    const token = await signIn(service);
    const res = await service.fetch(
      post("/atproto/api/repost", token, {
        uri: `at://${DID}/app.bsky.feed.post/root`,
        cid: "bafyroot234567",
      }),
    );
    expect(res!.status).toBe(200);
    expect(createRecordCalls).toMatchObject([
      { repo: DID, collection: "app.bsky.feed.repost" },
    ]);
  });

  it("rejects an invalid reaction subject before touching the PDS", async () => {
    const token = await signIn(service);
    const res = await service.fetch(
      post("/atproto/api/like", token, { uri: "not-a-uri", cid: "c" }),
    );
    expect(res!.status).toBe(400);
    expect(createRecordCalls).toHaveLength(0);
  });

  it("enforces the reaction rate limit", async () => {
    service = createAtprotoCommentsService(
      {
        ...baseConfig(store),
        reactionRateLimiter: createMemoryRateLimiter(1, 60_000),
      },
      { oauthClient: fakeOAuthClient },
    );
    const token = await signIn(service);
    const body = {
      uri: `at://${DID}/app.bsky.feed.post/root`,
      cid: "bafyroot234567",
    };
    const first = await service.fetch(post("/atproto/api/like", token, body));
    const second = await service.fetch(post("/atproto/api/like", token, body));
    expect(first!.status).toBe(200);
    expect(second!.status).toBe(429);
    expect(second!.headers.get("retry-after")).toBe("600");
  });

  it("unlikes by deleting the caller's own like record", async () => {
    const token = await signIn(service);
    const res = await service.fetch(
      del(
        `/atproto/api/like?uri=${encodeURIComponent(`at://${DID}/app.bsky.feed.like/mylike`)}`,
        token,
      ),
    );
    expect(res!.status).toBe(200);
    expect(deleteRecordCalls).toMatchObject([
      { repo: DID, collection: "app.bsky.feed.like", rkey: "mylike" },
    ]);
  });

  it("unreposts by deleting the caller's own repost record", async () => {
    const token = await signIn(service);
    const res = await service.fetch(
      del(
        `/atproto/api/repost?uri=${encodeURIComponent(`at://${DID}/app.bsky.feed.repost/myrepost`)}`,
        token,
      ),
    );
    expect(res!.status).toBe(200);
    expect(deleteRecordCalls).toMatchObject([
      { repo: DID, collection: "app.bsky.feed.repost", rkey: "myrepost" },
    ]);
  });

  it("refuses to delete a like record belonging to someone else", async () => {
    const token = await signIn(service);
    const res = await service.fetch(
      del(
        `/atproto/api/like?uri=${encodeURIComponent("at://did:plc:someoneelse/app.bsky.feed.like/theirlike")}`,
        token,
      ),
    );
    expect(res!.status).toBe(400);
    expect(deleteRecordCalls).toHaveLength(0);
  });

  it("refuses to delete a uri from the wrong collection", async () => {
    const token = await signIn(service);
    const res = await service.fetch(
      del(
        `/atproto/api/like?uri=${encodeURIComponent(`at://${DID}/app.bsky.feed.repost/x`)}`,
        token,
      ),
    );
    expect(res!.status).toBe(400);
    expect(deleteRecordCalls).toHaveLength(0);
  });

  it("logout revokes the session so the token stops working", async () => {
    const token = await signIn(service);
    const logout = await service.fetch(
      post("/atproto/api/session/logout", token),
    );
    expect(logout!.status).toBe(200);
    const after = await service.fetch(
      new Request(`${SERVICE}/atproto/api/session`, {
        headers: { authorization: `Bearer ${token}`, origin: ORIGIN },
      }),
    );
    expect(after!.status).toBe(401);
  });

  it("answers CORS preflight", async () => {
    const res = await service.fetch(
      new Request(`${SERVICE}/atproto/api/reply`, {
        method: "OPTIONS",
        headers: { origin: ORIGIN },
      }),
    );
    expect(res!.status).toBe(204);
    expect(res!.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(res!.headers.get("access-control-allow-methods")).toContain("POST");
  });
});

/**
 * Regression tests for the pre-release security review. Each of these
 * reproduces a confirmed attack; before the corresponding fix they passed
 * the attacker's assertion, not ours.
 */
describe("security regressions", () => {
  /** an OAuth client whose callback echoes the state authorize() was given,
   * so a crafted `?claim=` actually survives the round trip like it does in
   * the real library */
  const echoingOAuthClient = (): OAuthBridgeClient => {
    let lastState = "";
    return {
      clientMetadata: { client_id: `${SERVICE}/atproto/client-metadata.json` },
      jwks: { keys: [] },
      authorize: vi.fn(async (_handle: string, options: { state: string }) => {
        lastState = options.state;
        return new URL("https://pds.example/authorize?x=1");
      }),
      callback: vi.fn(async () => ({
        session: { did: DID } as OAuthPdsSession,
        state: lastState,
      })),
      restore: vi.fn(async () => fakePdsSession),
      revoke: vi.fn(async () => undefined),
    };
  };

  const startAndComplete = async (
    service: AtprotoCommentsService,
    { origin, claim }: { origin: string; claim: string },
  ): Promise<void> => {
    await service.fetch(
      new Request(
        `${SERVICE}/atproto/oauth/start?origin=${encodeURIComponent(origin)}` +
          `&claim=${encodeURIComponent(claim)}&handle=victim.test`,
      ),
    );
    await service.fetch(
      new Request(`${SERVICE}/atproto/oauth/callback?code=abc&state=xyz`),
    );
  };

  // The claim nonce arrives as a query parameter on a public endpoint, so an
  // attacker can craft a sign-in link carrying a nonce of their choosing,
  // point `origin` at a site the victim trusts, and poll for the finished
  // session. Retrieval is gated on the authorized origin for that reason.
  it("does not release a claim to a different origin", async () => {
    const service = createAtprotoCommentsService(baseConfig(memoryStore()), {
      oauthClient: echoingOAuthClient(),
    });
    const nonce = "attacker-picked-nonce";
    await startAndComplete(service, { origin: ORIGIN, claim: nonce });

    const stolen = await service.fetch(
      new Request(`${SERVICE}/atproto/api/session/claim?nonce=${nonce}`, {
        headers: { origin: "https://attacker.example" },
      }),
    );
    expect(stolen!.status).toBe(403);
    expect(await stolen!.text()).not.toContain("token");
  });

  it("releases a claim to the origin it was authorized for", async () => {
    const service = createAtprotoCommentsService(baseConfig(memoryStore()), {
      oauthClient: echoingOAuthClient(),
    });
    const nonce = "opener-generated-nonce";
    await startAndComplete(service, { origin: ORIGIN, claim: nonce });

    const claimed = await service.fetch(
      new Request(`${SERVICE}/atproto/api/session/claim?nonce=${nonce}`, {
        headers: { origin: ORIGIN },
      }),
    );
    expect(claimed!.status).toBe(200);
    const body = (await claimed!.json()) as Record<string, unknown>;
    expect(body["did"]).toBe(DID);
    expect(body["token"]).toBeTruthy();
    // the binding itself is not handed back to the browser
    expect(body["origin"]).toBeUndefined();
  });

  // Browsers always send Origin cross-origin and cannot forge it; a
  // non-browser client simply omits it. Treating "absent" as "nothing to
  // check" let any leaked token create records from anywhere.
  it("refuses to create records when no Origin header is sent", async () => {
    const store = memoryStore();
    const service = createAtprotoCommentsService(baseConfig(store), {
      oauthClient: fakeOAuthClient,
    });
    const token = await signIn(service);
    const before = createRecordCalls.length;

    const response = await service.fetch(
      new Request(`${SERVICE}/atproto/api/reply`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          root: { uri: `at://${DID}/app.bsky.feed.post/r`, cid: "bafyroot" },
          parent: { uri: `at://${DID}/app.bsky.feed.post/r`, cid: "bafyroot" },
          text: "posted without an Origin header",
        }),
      }),
    );

    expect(response!.status).toBe(403);
    expect(createRecordCalls.length).toBe(before);
  });

  it("refuses to delete records when no Origin header is sent", async () => {
    const service = createAtprotoCommentsService(baseConfig(memoryStore()), {
      oauthClient: fakeOAuthClient,
    });
    const token = await signIn(service);
    const before = deleteRecordCalls.length;

    const response = await service.fetch(
      new Request(
        `${SERVICE}/atproto/api/like?uri=${encodeURIComponent(
          `at://${DID}/app.bsky.feed.like/abc`,
        )}`,
        { method: "DELETE", headers: { authorization: `Bearer ${token}` } },
      ),
    );

    expect(response!.status).toBe(403);
    expect(deleteRecordCalls.length).toBe(before);
  });

  // Signing out used to end only the browser's session with the bridge,
  // leaving the refresh token that lets the bridge post as this account on
  // disk indefinitely.
  it("revokes the atproto grant on sign-out", async () => {
    const oauthClient = echoingOAuthClient();
    const service = createAtprotoCommentsService(baseConfig(memoryStore()), {
      oauthClient,
    });
    await startAndComplete(service, { origin: ORIGIN, claim: "n" });
    const claimed = await service.fetch(
      new Request(`${SERVICE}/atproto/api/session/claim?nonce=n`, {
        headers: { origin: ORIGIN },
      }),
    );
    const { token } = (await claimed!.json()) as { token: string };

    const response = await service.fetch(
      post("/atproto/api/session/logout", token),
    );

    expect(response!.status).toBe(200);
    expect(oauthClient.revoke).toHaveBeenCalledWith(DID);
  });

  // With no allowlist the bridge signs in any site on the internet under its
  // own OAuth client identity, which is what the hosted instance wants but
  // never what a self-hosted one does.
  it("refuses sign-in from an origin outside allowedOrigins", async () => {
    const service = createAtprotoCommentsService(
      { ...baseConfig(memoryStore()), allowedOrigins: [ORIGIN] },
      { oauthClient: echoingOAuthClient() },
    );

    const allowed = await service.fetch(
      new Request(
        `${SERVICE}/atproto/oauth/start?origin=${encodeURIComponent(ORIGIN)}`,
      ),
    );
    expect(allowed!.status).toBe(200);

    const blocked = await service.fetch(
      new Request(
        `${SERVICE}/atproto/oauth/start?origin=${encodeURIComponent(
          "https://someone-elses-site.example",
        )}`,
      ),
    );
    expect(blocked!.status).toBe(400);
  });
});

describe("operational stats", () => {
  let service: AtprotoCommentsService;

  beforeEach(() => {
    createRecordCalls = [];
    service = createAtprotoCommentsService(baseConfig(memoryStore()), {
      oauthClient: fakeOAuthClient,
    });
  });

  it("serves counts publicly, to any origin", async () => {
    const response = await service.fetch(
      new Request(`${SERVICE}/atproto/api/stats`, {
        headers: { origin: "https://anyone.example" },
      }),
    );
    expect(response!.status).toBe(200);
    expect(response!.headers.get("access-control-allow-origin")).toBe("*");
    expect(response!.headers.get("cache-control")).toContain("max-age=");
    expect(await response!.json()).toMatchObject({
      live: { threads: 0, subscribers: 0 },
      totals: { sites: 0, signIns: 0, replies: 0 },
    });
  });

  it("counts a sign-in and a reply against the embedding site", async () => {
    const token = await signIn(service);
    await service.fetch(
      post("/atproto/api/reply", token, {
        root: { uri: `at://${DID}/app.bsky.feed.post/r`, cid: "bafyroot" },
        parent: { uri: `at://${DID}/app.bsky.feed.post/r`, cid: "bafyroot" },
        text: "counted",
      }),
    );

    const stats = await service.stats();
    expect(stats.totals).toMatchObject({ sites: 1, signIns: 1, replies: 1 });
  });

  it("does not count a reply that the PDS rejected", async () => {
    const token = await signIn(service);
    await service.fetch(post("/atproto/api/reply", token, { text: "" }));
    expect((await service.stats()).totals.replies).toBe(0);
  });

  it("publishes no origins and nothing about a reader", async () => {
    const token = await signIn(service);
    await service.fetch(
      post("/atproto/api/reply", token, {
        root: { uri: `at://${DID}/app.bsky.feed.post/r`, cid: "bafyroot" },
        parent: { uri: `at://${DID}/app.bsky.feed.post/r`, cid: "bafyroot" },
        text: "counted",
      }),
    );

    const body = await (await service.fetch(
      new Request(`${SERVICE}/atproto/api/stats`),
    ))!.text();

    // the site that generated the activity must not appear in the payload,
    // and neither may any reader identifier
    expect(body).not.toContain(ORIGIN);
    expect(body).not.toContain("blog.example");
    expect(body).not.toContain(DID);
    expect(body).not.toContain("commenter");
  });
});

describe("sign-in consent screen", () => {
  const signInHtml = async (
    over: Partial<ServiceConfig> = {},
    options: CreateServiceOptions = {},
  ): Promise<string> => {
    const svc = createAtprotoCommentsService(
      { ...baseConfig(memoryStore()), ...over },
      { oauthClient: fakeOAuthClient, ...options },
    );
    const res = await svc.fetch(
      new Request(
        `${SERVICE}/atproto/oauth/start?origin=${encodeURIComponent(ORIGIN)}`,
      ),
    );
    return res!.text();
  };

  it("names the site the comment section is on", async () => {
    expect(await signInHtml()).toContain(ORIGIN);
  });

  // The OAuth grant is collection-level: create any app.bsky.feed.post, not
  // just replies, and not just on this site. Saying otherwise would understate
  // what is being authorized at the one moment the reader decides.
  // The reader's own provider enumerates the scopes on the next screen, so
  // this page does not repeat them. What it must not do is describe the grant
  // as narrower than it is: the authorization covers creating any post, on
  // any site using the bridge, not just replies here.
  it("makes no claim that the grant is narrower than it is", async () => {
    const html = await signInHtml();
    expect(html).toContain("Your provider will show what you are approving");
    expect(html).not.toMatch(/posting replies on your behalf/i);
    expect(html).not.toMatch(/only posts replies/i);
  });

  it("links the privacy policy when one is configured", async () => {
    expect(await signInHtml({ privacyUrl: "/privacy" })).toContain(
      `${SERVICE}/privacy`,
    );
  });

  it("omits the privacy link when none is configured", async () => {
    expect(await signInHtml()).not.toContain("/privacy");
  });

  it("applies structured self-host branding, links, title, and theme", async () => {
    const html = await signInHtml({
      oauthPage: {
        title: "Sign in to Acme Comments",
        brand: {
          name: "Acme/Comments",
          logoUrl: "/brand.svg",
          homeUrl: "/comments",
        },
        theme: { accent: "#7c3aed" },
        links: { privacy: "/legal/privacy", support: "/help" },
      },
    });

    expect(html).toContain("<title>Sign in to Acme Comments</title>");
    expect(html).toMatch(/<h1[^>]*>Sign in to Acme Comments<\/h1>/);
    expect(html).toContain(`src="${SERVICE}/brand.svg"`);
    expect(html).toContain(`href="${SERVICE}/comments"`);
    expect(html).toContain(`href="${SERVICE}/legal/privacy"`);
    expect(html).toContain(`href="${SERVICE}/help"`);
    expect(html).toContain("#7c3aed");
    expect(html).toContain("Acme");
    expect(html).toContain("/Comments");
  });

  it("allows an async custom renderer for only the handle-entry page", async () => {
    const renderSignInPage = vi.fn<SignInPageRenderer>(
      async ({ actionUrl, origin }) =>
        `<!doctype html><title>Custom</title><form action="${actionUrl}"><input name="origin" value="${origin}"></form>`,
    );

    const html = await signInHtml({}, { renderSignInPage });

    expect(html).toContain("<title>Custom</title>");
    expect(renderSignInPage).toHaveBeenCalledWith(
      expect.objectContaining({
        actionUrl: "/atproto/oauth/start",
        origin: ORIGIN,
        clientName: "atproto-comments",
      }),
    );
  });

  // The pitch is a footer note on a page where someone is midway through a
  // security decision. It must never outrank the thing they came here to do.
  it("keeps the project pitch below the sign-in form", async () => {
    const html = await signInHtml({
      productUrl: "https://atproto.svebcomponents.dev",
    });
    expect(html).toContain("Comments for your own site.");
    expect(html.indexOf("Comments for your own site.")).toBeGreaterThan(
      html.indexOf('<button type="submit">'),
    );
  });

  // A self-hosted bridge should not advertise someone else's project, so the
  // branding and the pitch are opt-in together.
  it("shows no branding or pitch when productUrl is unset", async () => {
    const html = await signInHtml();
    expect(html).not.toContain("Comments for your own site.");
    expect(html).not.toContain('class="brand"');
  });
});
