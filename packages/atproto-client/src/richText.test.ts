import { describe, expect, it } from "vitest";

import { segmentRichText } from "./richText.js";

const link = (byteStart: number, byteEnd: number, uri: string) => ({
  index: { byteStart, byteEnd },
  features: [{ $type: "app.bsky.richtext.facet#link" as const, uri }],
});

describe("segmentRichText", () => {
  it("returns a single text segment without facets", () => {
    expect(segmentRichText("hello", undefined)).toEqual([
      { type: "text", text: "hello" },
    ]);
  });

  it("returns no segments for empty text", () => {
    expect(segmentRichText("", undefined)).toEqual([]);
  });

  it("splits text around a link facet", () => {
    expect(
      segmentRichText("see https://example.com now", [
        link(4, 23, "https://example.com"),
      ]),
    ).toEqual([
      { type: "text", text: "see " },
      {
        type: "link",
        text: "https://example.com",
        href: "https://example.com",
      },
      { type: "text", text: " now" },
    ]);
  });

  it("handles mention and tag features", () => {
    // "hi @alice #svelte"
    expect(
      segmentRichText("hi @alice #svelte", [
        {
          index: { byteStart: 3, byteEnd: 9 },
          features: [
            { $type: "app.bsky.richtext.facet#mention", did: "did:plc:abc" },
          ],
        },
        {
          index: { byteStart: 10, byteEnd: 17 },
          features: [{ $type: "app.bsky.richtext.facet#tag", tag: "svelte" }],
        },
      ]),
    ).toEqual([
      { type: "text", text: "hi " },
      {
        type: "mention",
        text: "@alice",
        did: "did:plc:abc",
        href: "https://bsky.app/profile/did%3Aplc%3Aabc",
      },
      { type: "text", text: " " },
      {
        type: "tag",
        text: "#svelte",
        tag: "svelte",
        href: "https://bsky.app/hashtag/svelte",
      },
    ]);
  });

  it.each(["bsky.app", "mu.social"])(
    "routes mention and tag links through viewer %s",
    (host) => {
      expect(
        segmentRichText(
          "hi @alice #svelte https://example.com",
          [
            {
              index: { byteStart: 3, byteEnd: 9 },
              features: [
                {
                  $type: "app.bsky.richtext.facet#mention",
                  did: "did:plc:abc",
                },
              ],
            },
            {
              index: { byteStart: 10, byteEnd: 17 },
              features: [
                { $type: "app.bsky.richtext.facet#tag", tag: "svelte" },
              ],
            },
            link(18, 37, "https://example.com"),
          ],
          `https://${host}`,
        ),
      ).toEqual([
        { type: "text", text: "hi " },
        {
          type: "mention",
          text: "@alice",
          did: "did:plc:abc",
          href: `https://${host}/profile/did%3Aplc%3Aabc`,
        },
        { type: "text", text: " " },
        {
          type: "tag",
          text: "#svelte",
          tag: "svelte",
          href: `https://${host}/hashtag/svelte`,
        },
        { type: "text", text: " " },
        // an external link keeps its own URI — the viewer only owns
        // mention and tag destinations
        {
          type: "link",
          text: "https://example.com",
          href: "https://example.com",
        },
      ]);
    },
  );

  it("uses UTF-8 byte offsets, not JS string indices (emoji)", () => {
    // "Hi 👋 @alice.test": "Hi " = 3 bytes, 👋 = 4 bytes, " " = 1 byte
    // → mention starts at byte 8, "@alice.test" = 11 bytes → byteEnd 19
    const segments = segmentRichText("Hi 👋 @alice.test", [
      {
        index: { byteStart: 8, byteEnd: 19 },
        features: [
          { $type: "app.bsky.richtext.facet#mention", did: "did:plc:xyz" },
        ],
      },
    ]);
    expect(segments).toEqual([
      { type: "text", text: "Hi 👋 " },
      {
        type: "mention",
        text: "@alice.test",
        did: "did:plc:xyz",
        href: "https://bsky.app/profile/did%3Aplc%3Axyz",
      },
    ]);
  });

  it("uses UTF-8 byte offsets for CJK text", () => {
    // "日本語 #テスト": 日本語 = 9 bytes, " " = 1 → tag at bytes 10..20
    const segments = segmentRichText("日本語 #テスト", [
      {
        index: { byteStart: 10, byteEnd: 20 },
        features: [{ $type: "app.bsky.richtext.facet#tag", tag: "テスト" }],
      },
    ]);
    expect(segments).toEqual([
      { type: "text", text: "日本語 " },
      {
        type: "tag",
        text: "#テスト",
        tag: "テスト",
        href: "https://bsky.app/hashtag/%E3%83%86%E3%82%B9%E3%83%88",
      },
    ]);
  });

  it("skips overlapping facets, keeping the earlier one", () => {
    expect(
      segmentRichText("abcdef", [
        link(0, 4, "https://first.example"),
        link(2, 6, "https://second.example"),
      ]),
    ).toEqual([
      { type: "link", text: "abcd", href: "https://first.example" },
      { type: "text", text: "ef" },
    ]);
  });

  it("skips facets that are out of range or empty", () => {
    expect(
      segmentRichText("short", [
        link(0, 99, "https://too-long.example"),
        link(3, 3, "https://empty.example"),
      ]),
    ).toEqual([{ type: "text", text: "short" }]);
  });

  it("degrades unknown feature types to plain text", () => {
    expect(
      segmentRichText("weird facet", [
        {
          index: { byteStart: 0, byteEnd: 5 },
          features: [{ $type: "app.example.future#thing" }],
        },
      ]),
    ).toEqual([{ type: "text", text: "weird facet" }]);
  });

  // Facets are self-asserted: the record author writes them and the AppView
  // returns them verbatim, so a link facet's uri reaches the DOM as
  // untrusted input. Rendering `javascript:` as an href would execute on
  // whatever page embeds the component.
  it.each([
    ["javascript:alert(1)"],
    ["JavaScript:alert(1)"],
    ["  javascript:alert(1)"],
    ["data:text/html,<script>alert(1)</script>"],
    ["vbscript:msgbox(1)"],
    ["not a url at all"],
    ["/relative/path"],
  ])("degrades an unsafe link facet uri to plain text: %s", (uri) => {
    expect(segmentRichText("click here", [link(0, 10, uri)])).toEqual([
      { type: "text", text: "click here" },
    ]);
  });

  it("keeps http and https link facets", () => {
    expect(
      segmentRichText("click here", [link(0, 10, "https://ok.example/x")]),
    ).toEqual([
      { type: "link", text: "click here", href: "https://ok.example/x" },
    ]);
    expect(
      segmentRichText("click here", [link(0, 10, "http://ok.example/x")]),
    ).toEqual([
      { type: "link", text: "click here", href: "http://ok.example/x" },
    ]);
  });
});
