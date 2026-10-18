import { describe, expect, it } from "vitest";

import { parsePermissionSets } from "./permissionSets.js";

const feeds = {
  clientName: "Reader App (via svebcomponents/atproto)",
  description: "Read your feeds and timeline",
  origins: ["chrome-extension://abcdefghijklmnopabcdefghijklmnop"],
  methods: [
    {
      nsid: "app.bsky.feed.getTimeline",
      aud: "did:web:api.bsky.app#bsky_appview",
    },
  ],
};

describe("parsePermissionSets", () => {
  it("treats unset or empty as none", () => {
    expect(parsePermissionSets(undefined)).toBeUndefined();
    expect(parsePermissionSets("  ")).toBeUndefined();
  });

  it("reads a JSON object of sets", () => {
    expect(parsePermissionSets(JSON.stringify({ feeds }))).toEqual({ feeds });
  });

  it.each([
    ["invalid JSON", "{", /valid JSON/],
    ["an array", "[]", /JSON object/],
    ["a set that is not an object", '{"feeds":1}', /must be an object/],
    [
      "a set without clientName",
      JSON.stringify({ feeds: { ...feeds, clientName: undefined } }),
      /clientName/,
    ],
    [
      "origins that are not strings",
      JSON.stringify({ feeds: { ...feeds, origins: [1] } }),
      /origins/,
    ],
  ])("rejects %s", (_label, raw, error) => {
    expect(() => parsePermissionSets(raw)).toThrow(error);
  });
});
