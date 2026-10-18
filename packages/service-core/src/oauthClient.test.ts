import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { resolveConfig } from "./config.js";
import { buildOAuthClient } from "./oauthClient.js";

describe("buildOAuthClient", () => {
  const config = resolveConfig({
    publicUrl: "http://127.0.0.1:5173",
    sessionSecret: "test-secret-that-is-at-least-32-chars-long",
    stateStore: { set: vi.fn(), get: vi.fn(), del: vi.fn() },
    sessionStore: { set: vi.fn(), get: vi.fn(), del: vi.fn() },
    serviceSessionStore: { set: vi.fn(), get: vi.fn(), del: vi.fn() },
    permissionSets: {
      feeds: {
        clientName: "Reader App",
        description: "Read your timeline",
        origins: ["https://reader.example"],
        methods: [
          {
            nsid: "app.bsky.feed.getTimeline",
            aud: "did:web:api.bsky.app#bsky_appview",
          },
        ],
      },
    },
  });

  it("gives a permission set its own redirect URI and scope", async () => {
    const set = config.permissionSets["feeds"]!;
    const { clientMetadata } = await buildOAuthClient(config, set);
    expect(clientMetadata).toMatchObject({
      redirect_uris: [
        "http://127.0.0.1:5173/atproto/clients/feeds/oauth/callback",
      ],
      scope: set.scope,
    });
  });

  it("keeps the default client as it was", async () => {
    const { clientMetadata } = await buildOAuthClient(config);
    expect(clientMetadata).toMatchObject({
      redirect_uris: ["http://127.0.0.1:5173/atproto/oauth/callback"],
      scope: config.scope,
    });
  });

  it("names a set's client and gives it its own client_id on https", async () => {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const https = resolveConfig({
      ...config,
      publicUrl: "https://comments.example",
      permissionSets: {
        feeds: { ...config.permissionSets["feeds"]! },
      },
      keys: [privateKey.export({ type: "pkcs8", format: "pem" }).toString()],
    });
    const { clientMetadata } = await buildOAuthClient(
      https,
      https.permissionSets["feeds"]!,
    );
    expect(clientMetadata).toMatchObject({
      client_id:
        "https://comments.example/atproto/clients/feeds/client-metadata.json",
      client_name: "Reader App",
      redirect_uris: [
        "https://comments.example/atproto/clients/feeds/oauth/callback",
      ],
      jwks_uri: "https://comments.example/atproto/jwks.json",
    });
  });
});
