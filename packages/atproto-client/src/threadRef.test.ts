import { describe, expect, it } from "vitest";

import { parseThreadRef } from "./threadRef.js";
import { viewerPostUrl } from "./urls.js";

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

  // The parser is host-agnostic by design, so every case below runs against
  // the default viewer and a non-default one. mu.social stands in for "some
  // other host entirely" — the point is that the hostname is never consulted.
  const viewerHosts = ["bsky.app", "mu.social"];

  it.each(viewerHosts)("parses a post URL on %s with a handle", (host) => {
    expect(
      parseThreadRef(
        `https://${host}/profile/alice.example.com/post/3k44deefqdk2g`,
      ),
    ).toEqual({
      authority: "alice.example.com",
      collection: "app.bsky.feed.post",
      rkey: "3k44deefqdk2g",
      uri: undefined,
    });
  });

  it.each(viewerHosts)("parses a post URL on %s with a DID", (host) => {
    expect(
      parseThreadRef(
        `https://${host}/profile/did:plc:ewvi7nxzyoun6zhxrhs64oiz/post/3k44deefqdk2g`,
      ),
    ).toEqual({
      authority: "did:plc:ewvi7nxzyoun6zhxrhs64oiz",
      collection: "app.bsky.feed.post",
      rkey: "3k44deefqdk2g",
      uri: "at://did:plc:ewvi7nxzyoun6zhxrhs64oiz/app.bsky.feed.post/3k44deefqdk2g",
    });
  });

  it.each(viewerHosts)("round-trips a URL built for viewer %s", (host) => {
    const url = viewerPostUrl(
      "at://did:plc:ewvi7nxzyoun6zhxrhs64oiz/app.bsky.feed.post/3k44deefqdk2g",
      "alice.example.com",
      `https://${host}`,
    );
    expect(parseThreadRef(url)).toEqual({
      authority: "alice.example.com",
      collection: "app.bsky.feed.post",
      rkey: "3k44deefqdk2g",
      uri: undefined,
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
    "http://bsky.app/profile/alice/post/xyz",
    "http://mu.social/profile/alice/post/xyz",
    "https://bsky.app/profile/alice",
    "https://mu.social/profile/alice",
    "https://bsky.app/profile/alice/post/xyz/extra",
    "https://mu.social/some/other/path",
  ])("returns undefined for %j", (input) => {
    expect(parseThreadRef(input)).toBeUndefined();
  });
});
