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
});
