import { describe, expect, it } from "vitest";

import { normalizeEmbed } from "./embeds.js";

// Shapes follow real public.api.bsky.app responses (2026-10).
const CDN = "https://cdn.bsky.app/img";
const author = {
  did: "did:plc:quoted",
  handle: "quoted.test",
  displayName: "Quoted",
  avatar: `${CDN}/avatar/plain/did:plc:quoted/a`,
};
const images = {
  $type: "app.bsky.embed.images#view",
  images: [
    {
      thumb: `${CDN}/feed_thumbnail/plain/did:plc:a/1`,
      fullsize: `${CDN}/feed_fullsize/plain/did:plc:a/1`,
      alt: "a cat",
      aspectRatio: { width: 3000, height: 3999 },
    },
  ],
};
const viewRecord = {
  $type: "app.bsky.embed.record#viewRecord",
  uri: "at://did:plc:quoted/app.bsky.feed.post/3q",
  cid: "bafyquoted",
  author,
  value: {
    $type: "app.bsky.feed.post",
    text: "quoted text",
    createdAt: "2026-10-16T13:15:51.019Z",
  },
  labels: [{ src: "did:plc:mod", val: "graphic-media" }],
  embeds: [images],
  indexedAt: "2026-10-16T13:15:52.000Z",
};

describe("normalizeEmbed", () => {
  it("returns undefined without an embed or for unknown types", () => {
    expect(normalizeEmbed(undefined)).toBeUndefined();
    expect(
      normalizeEmbed({ $type: "app.bsky.embed.future#view" }),
    ).toBeUndefined();
  });

  it("normalizes images", () => {
    expect(normalizeEmbed(images)).toEqual({
      kind: "images",
      images: [
        {
          thumb: images.images[0]!.thumb,
          fullsize: images.images[0]!.fullsize,
          alt: "a cat",
          aspectRatio: { width: 3000, height: 3999 },
        },
      ],
    });
  });

  it("normalizes galleries as images", () => {
    const gallery = {
      $type: "app.bsky.embed.gallery#view",
      items: Array.from({ length: 7 }, (_, i) => ({
        $type: "app.bsky.embed.gallery#viewImage",
        thumbnail: `${CDN}/feed_thumbnail/plain/did:plc:a/${i}`,
        fullsize: `${CDN}/feed_fullsize/plain/did:plc:a/${i}`,
        alt: "",
      })),
    };
    const embed = normalizeEmbed(gallery);
    expect(embed?.kind).toBe("images");
    expect(embed?.kind === "images" && embed.images).toHaveLength(7);
  });

  it("drops non-https media URLs", () => {
    expect(
      normalizeEmbed({
        $type: "app.bsky.embed.images#view",
        images: [
          { thumb: "javascript:alert(1)", fullsize: "http://x", alt: "" },
        ],
      }),
    ).toBeUndefined();
  });

  it("normalizes video", () => {
    expect(
      normalizeEmbed({
        $type: "app.bsky.embed.video#view",
        cid: "bafyvideo",
        playlist: "https://video.bsky.app/watch/did/cid/playlist.m3u8",
        thumbnail: "https://video.bsky.app/watch/did/cid/thumbnail.jpg",
        aspectRatio: { width: 576, height: 1024 },
      }),
    ).toEqual({
      kind: "video",
      playlist: "https://video.bsky.app/watch/did/cid/playlist.m3u8",
      thumbnail: "https://video.bsky.app/watch/did/cid/thumbnail.jpg",
      alt: "",
      aspectRatio: { width: 576, height: 1024 },
    });
  });

  it("normalizes link cards and rejects non-web links", () => {
    const external = (uri: string) => ({
      $type: "app.bsky.embed.external#view",
      external: { uri, title: "Title", description: "Description" },
    });
    expect(normalizeEmbed(external("https://example.com/a"))).toEqual({
      kind: "external",
      uri: "https://example.com/a",
      title: "Title",
      description: "Description",
      thumb: undefined,
    });
    expect(normalizeEmbed(external("javascript:alert(1)"))).toBeUndefined();
  });

  it("normalizes a quoted post with its media and labels", () => {
    const embed = normalizeEmbed({
      $type: "app.bsky.embed.record#view",
      record: viewRecord,
    });
    expect(embed).toMatchObject({
      kind: "record",
      record: {
        kind: "post",
        uri: viewRecord.uri,
        text: "quoted text",
        labels: ["graphic-media"],
        url: "https://bsky.app/profile/quoted.test/post/3q",
        author: {
          handle: "quoted.test",
          profileUrl: "https://bsky.app/profile/quoted.test",
        },
        media: { kind: "images" },
      },
    });
  });

  it("normalizes a quote with its own media", () => {
    const embed = normalizeEmbed({
      $type: "app.bsky.embed.recordWithMedia#view",
      record: { $type: "app.bsky.embed.record#view", record: viewRecord },
      media: images,
    });
    expect(embed).toMatchObject({
      kind: "record",
      record: { kind: "post", uri: viewRecord.uri },
      media: { kind: "images" },
    });
  });

  it("keeps unavailable and non-post records renderable", () => {
    const quote = (record: unknown) =>
      normalizeEmbed(
        { $type: "app.bsky.embed.record#view", record },
        "https://viewer.test",
      );
    expect(
      quote({
        $type: "app.bsky.embed.record#viewBlocked",
        uri: "at://did:plc:x/app.bsky.feed.post/1",
        blocked: true,
      }),
    ).toEqual({
      kind: "record",
      record: {
        kind: "unavailable",
        reason: "blocked",
        uri: "at://did:plc:x/app.bsky.feed.post/1",
      },
    });
    expect(
      quote({
        $type: "app.bsky.graph.defs#starterPackViewBasic",
        uri: "at://did:plc:x/app.bsky.graph.starterpack/3s",
        record: { $type: "app.bsky.graph.starterpack", name: "NHL Writers" },
      }),
    ).toEqual({
      kind: "record",
      record: {
        kind: "unsupported",
        uri: "at://did:plc:x/app.bsky.graph.starterpack/3s",
        title: "NHL Writers",
        url: "https://viewer.test/starter-pack/did%3Aplc%3Ax/3s",
      },
    });
  });
});
