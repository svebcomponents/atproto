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
} from "./handlers.js";
import type { OAuthBridgeClient, OAuthPdsSession } from "./oauthClient.js";

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

// a fake PDS fetch handler that records createRecord calls
let createRecordCalls: unknown[] = [];
const fakePdsSession: OAuthPdsSession = {
  did: DID,
  async fetchHandler(pathname, init) {
    if (pathname === "/xrpc/com.atproto.repo.createRecord") {
      createRecordCalls.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({
          uri: `at://${DID}/app.bsky.feed.post/newpost`,
          cid: "bafynewpost",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
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

describe("service handlers", () => {
  let service: AtprotoCommentsService;
  let store: ServiceSessionStore;

  beforeEach(() => {
    createRecordCalls = [];
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
    expect(await res!.text()).toContain("Sign in with Bluesky");
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

  it("completes the callback and posts a session to the opener origin", async () => {
    const res = await service.fetch(
      new Request(`${SERVICE}/atproto/oauth/callback?code=abc&state=xyz`),
    );
    const body = await res!.text();
    // targetOrigin must be the exact embedding origin, never "*"
    expect(body).toContain(`postMessage(data, "${ORIGIN}")`);
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
      uri: `at://${DID}/app.bsky.feed.post/newpost`,
      cid: "bafynewpost",
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
