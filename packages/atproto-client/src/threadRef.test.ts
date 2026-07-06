import { describe, expect, it } from "vitest";

import { parseThreadRef } from "./threadRef.js";

describe("parseThreadRef", () => {
  it("parses an at:// URI with a DID authority", () => {
    expect(
      parseThreadRef(
        "at://did:plc:ewvi7nxzyoun6zhxrhs64oiz/app.bsky.feed.post/3k44deefqdk2g",
      ),
    ).toEqual({
      authority: "did:plc:ewvi7nxzyoun6zhxrhs64oiz",
      collection: "app.bsky.feed.post",
      rkey: "3k44deefqdk2g",
      uri: "at://did:plc:ewvi7nxzyoun6zhxrhs64oiz/app.bsky.feed.post/3k44deefqdk2g",
    });
  });

  it("parses an at:// URI with a handle authority without a canonical uri", () => {
    expect(
      parseThreadRef("at://alice.example.com/app.bsky.feed.post/3k44deefqdk2g"),
    ).toEqual({
      authority: "alice.example.com",
      collection: "app.bsky.feed.post",
      rkey: "3k44deefqdk2g",
      uri: undefined,
    });
  });

  it("parses a bsky.app post URL with a handle", () => {
    expect(
      parseThreadRef(
        "https://bsky.app/profile/alice.example.com/post/3k44deefqdk2g",
      ),
    ).toEqual({
      authority: "alice.example.com",
      collection: "app.bsky.feed.post",
      rkey: "3k44deefqdk2g",
      uri: undefined,
    });
  });

  it("parses a bsky.app post URL with a DID", () => {
    expect(
      parseThreadRef(
        "https://bsky.app/profile/did:plc:ewvi7nxzyoun6zhxrhs64oiz/post/3k44deefqdk2g",
      ),
    ).toEqual({
      authority: "did:plc:ewvi7nxzyoun6zhxrhs64oiz",
      collection: "app.bsky.feed.post",
      rkey: "3k44deefqdk2g",
      uri: "at://did:plc:ewvi7nxzyoun6zhxrhs64oiz/app.bsky.feed.post/3k44deefqdk2g",
    });
  });

  it("tolerates surrounding whitespace", () => {
    expect(
      parseThreadRef("  at://did:plc:abc123/app.bsky.feed.post/xyz  ")?.rkey,
    ).toBe("xyz");
  });

  it.each([
    "",
    "not a uri",
    "at://only-authority",
    "at://did:plc:abc/no-nsid/rkey",
    "https://example.com/profile/alice/post/xyz",
    "http://bsky.app/profile/alice/post/xyz",
    "https://bsky.app/profile/alice",
  ])("returns undefined for %j", (input) => {
    expect(parseThreadRef(input)).toBeUndefined();
  });
});
