// Post embeds: images, video, link cards, and quoted posts. The AppView
// returns resolved `app.bsky.embed.*#view` objects alongside each post; these
// helpers turn them into a small renderable model. Unknown or malformed views
// normalize to `undefined` (or an `unsupported` record) rather than throwing,
// so a new embed type never breaks a thread.

import type { Facet, PostRecord, ProfileViewBasic } from "./appviewTypes.js";
import { segmentRichText, type RichTextSegment } from "./richText.js";
import { viewerBase, viewerPostUrl, viewerProfileUrl } from "./urls.js";

export interface AspectRatio {
  width: number;
  height: number;
}

export interface EmbedImage {
  /** CDN thumbnail, sized for the feed */
  thumb: string;
  /** full-size image */
  fullsize: string;
  /** author-provided alt text; empty when none was given */
  alt: string;
  aspectRatio?: AspectRatio | undefined;
}

export interface ImagesEmbed {
  kind: "images";
  images: EmbedImage[];
}

export interface VideoEmbed {
  kind: "video";
  /** HLS playlist URL */
  playlist: string;
  thumbnail?: string | undefined;
  alt: string;
  aspectRatio?: AspectRatio | undefined;
}

/** a link card */
export interface ExternalEmbed {
  kind: "external";
  uri: string;
  title: string;
  description: string;
  thumb?: string | undefined;
}

export type MediaEmbed = ImagesEmbed | VideoEmbed | ExternalEmbed;

export interface QuotedPost {
  kind: "post";
  uri: string;
  cid: string;
  author: {
    did: string;
    handle: string;
    displayName?: string | undefined;
    avatarUrl?: string | undefined;
    profileUrl: string;
  };
  text: string;
  segments: RichTextSegment[];
  createdAt: string;
  /** moderation label values applied to the quoted post */
  labels: string[];
  /** viewer permalink */
  url: string;
  /** the quoted post's own media; nested quotes are not resolved */
  media?: MediaEmbed | undefined;
}

/** a quoted post that cannot be shown */
export interface UnavailableRecord {
  kind: "unavailable";
  reason: "not-found" | "blocked" | "detached";
  uri: string;
}

/** a quoted record that is not a post (feed, list, starter pack, …) */
export interface UnsupportedRecord {
  kind: "unsupported";
  uri: string;
  /** the record's name (feed, list, starter pack) when it has one */
  title?: string | undefined;
  /** viewer link when one can be derived */
  url?: string | undefined;
}

export type QuotedRecord = QuotedPost | UnavailableRecord | UnsupportedRecord;

/** a quote post, optionally with its own media (`recordWithMedia`) */
export interface RecordEmbed {
  kind: "record";
  record: QuotedRecord;
  media?: MediaEmbed | undefined;
}

export type PostEmbed = MediaEmbed | RecordEmbed;

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null;

const str = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

/** only https URLs reach rendered `src` / `href` attributes */
const httpsUrl = (value: unknown): string | undefined => {
  const raw = str(value);
  if (!raw) return undefined;
  try {
    return new URL(raw).protocol === "https:" ? raw : undefined;
  } catch {
    return undefined;
  }
};

const toAspectRatio = (value: unknown): AspectRatio | undefined => {
  if (!isObject(value)) return undefined;
  const { width, height } = value;
  return typeof width === "number" &&
    typeof height === "number" &&
    width > 0 &&
    height > 0
    ? { width, height }
    : undefined;
};

/** `images#view` lists `images` with `thumb`; `gallery#view` lists `items` with `thumbnail` */
const toImages = (view: Json): ImagesEmbed | undefined => {
  const items = view["images"] ?? view["items"];
  if (!Array.isArray(items)) return undefined;
  const images: EmbedImage[] = [];
  for (const image of items) {
    if (!isObject(image)) continue;
    if (
      typeof image["$type"] === "string" &&
      image["$type"] !== "app.bsky.embed.gallery#viewImage"
    ) {
      continue;
    }
    const thumb = httpsUrl(image["thumb"] ?? image["thumbnail"]);
    const fullsize = httpsUrl(image["fullsize"]) ?? thumb;
    if (!thumb || !fullsize) continue;
    images.push({
      thumb,
      fullsize,
      alt: str(image["alt"]) ?? "",
      aspectRatio: toAspectRatio(image["aspectRatio"]),
    });
  }
  return images.length > 0 ? { kind: "images", images } : undefined;
};

const toVideo = (view: Json): VideoEmbed | undefined => {
  const playlist = httpsUrl(view["playlist"]);
  if (!playlist) return undefined;
  return {
    kind: "video",
    playlist,
    thumbnail: httpsUrl(view["thumbnail"]),
    alt: str(view["alt"]) ?? "",
    aspectRatio: toAspectRatio(view["aspectRatio"]),
  };
};

const toExternal = (view: Json): ExternalEmbed | undefined => {
  const external = view["external"];
  if (!isObject(external)) return undefined;
  const uri = str(external["uri"]);
  if (!uri) return undefined;
  try {
    const { protocol } = new URL(uri);
    if (protocol !== "https:" && protocol !== "http:") return undefined;
  } catch {
    return undefined;
  }
  return {
    kind: "external",
    uri,
    title: str(external["title"]) ?? "",
    description: str(external["description"]) ?? "",
    thumb: httpsUrl(external["thumb"]),
  };
};

const toMedia = (view: unknown): MediaEmbed | undefined => {
  if (!isObject(view)) return undefined;
  switch (view["$type"]) {
    case "app.bsky.embed.images#view":
    case "app.bsky.embed.gallery#view":
      return toImages(view);
    case "app.bsky.embed.video#view":
      return toVideo(view);
    case "app.bsky.embed.external#view":
      return toExternal(view);
    default:
      return undefined;
  }
};

const isPostRecord = (value: unknown): value is PostRecord =>
  isObject(value) && value["$type"] === "app.bsky.feed.post";

/** at://did/collection/rkey → the viewer's web link, for known record types */
const recordUrl = (uri: string, viewer?: string): string | undefined => {
  const match = /^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(uri);
  if (!match) return undefined;
  const [, did, collection, rkey] = match;
  const base = viewerProfileUrl(did!, viewer);
  switch (collection) {
    case "app.bsky.feed.generator":
      return `${base}/feed/${rkey}`;
    case "app.bsky.graph.list":
      return `${base}/lists/${rkey}`;
    case "app.bsky.graph.starterpack":
      return `${viewerBase(viewer)}/starter-pack/${encodeURIComponent(did!)}/${rkey}`;
    case "app.bsky.feed.post":
      return viewerPostUrl(uri, undefined, viewer);
    default:
      return undefined;
  }
};

const toQuotedRecord = (view: unknown, viewer?: string): QuotedRecord => {
  if (!isObject(view))
    return { kind: "unavailable", reason: "not-found", uri: "" };
  const uri = str(view["uri"]) ?? "";
  switch (view["$type"]) {
    case "app.bsky.embed.record#viewRecord": {
      const author = view["author"] as ProfileViewBasic | undefined;
      const value = view["value"];
      const cid = str(view["cid"]);
      if (!isObject(author) || !author.did || !author.handle || !cid) {
        return { kind: "unavailable", reason: "not-found", uri };
      }
      if (!isPostRecord(value)) {
        return { kind: "unsupported", uri, url: recordUrl(uri, viewer) };
      }
      const embeds = Array.isArray(view["embeds"]) ? view["embeds"] : [];
      let media: MediaEmbed | undefined;
      for (const nested of embeds) {
        media =
          toMedia(nested) ??
          (isObject(nested) &&
          nested["$type"] === "app.bsky.embed.recordWithMedia#view"
            ? toMedia(nested["media"])
            : undefined);
        if (media) break;
      }
      const labels = Array.isArray(view["labels"])
        ? (view["labels"] as { val?: unknown; neg?: unknown }[])
            .filter((label) => !label.neg && typeof label.val === "string")
            .map((label) => label.val as string)
        : [];
      return {
        kind: "post",
        uri,
        cid,
        author: {
          did: author.did,
          handle: author.handle,
          displayName: author.displayName,
          avatarUrl: httpsUrl(author.avatar),
          profileUrl: viewerProfileUrl(author.handle, viewer),
        },
        text: value.text,
        segments: segmentRichText(
          value.text,
          value.facets as Facet[] | undefined,
          viewer,
        ),
        createdAt: value.createdAt ?? str(view["indexedAt"]) ?? "",
        labels,
        url: viewerPostUrl(uri, author.handle, viewer),
        media,
      };
    }
    case "app.bsky.embed.record#viewNotFound":
      return { kind: "unavailable", reason: "not-found", uri };
    case "app.bsky.embed.record#viewBlocked":
      return { kind: "unavailable", reason: "blocked", uri };
    case "app.bsky.embed.record#viewDetached":
      return { kind: "unavailable", reason: "detached", uri };
    default: {
      // feed generators, lists, starter packs, labelers, …
      const record = isObject(view["record"]) ? view["record"] : {};
      return {
        kind: "unsupported",
        uri,
        title:
          str(view["displayName"]) ?? str(view["name"]) ?? str(record["name"]),
        url: recordUrl(uri, viewer),
      };
    }
  }
};

/**
 * Normalizes a post's `embed` view. Returns `undefined` for posts without an
 * embed and for embed types this model does not know.
 */
export const normalizeEmbed = (
  view: unknown,
  /** web viewer base for outbound links (bsky.app by default) */
  viewer?: string,
): PostEmbed | undefined => {
  if (!isObject(view)) return undefined;
  switch (view["$type"]) {
    case "app.bsky.embed.record#view":
      return {
        kind: "record",
        record: toQuotedRecord(view["record"], viewer),
      };
    case "app.bsky.embed.recordWithMedia#view": {
      const record = isObject(view["record"])
        ? view["record"]["record"]
        : undefined;
      return {
        kind: "record",
        record: toQuotedRecord(record, viewer),
        media: toMedia(view["media"]),
      };
    }
    default:
      return toMedia(view);
  }
};
