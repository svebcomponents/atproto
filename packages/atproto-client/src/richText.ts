import type { Facet } from "./appviewTypes.js";
import { viewerProfileUrl, viewerTagUrl } from "./urls.js";

export type RichTextSegment =
  | { type: "text"; text: string }
  | { type: "link"; text: string; href: string }
  | { type: "mention"; text: string; did: string; href: string }
  | { type: "tag"; text: string; tag: string; href: string };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Schemes allowed to reach an `href`. Facets are self-asserted — the record
 * author writes them and the AppView returns them verbatim — so a link
 * facet's `uri` is untrusted input all the way to the DOM. Without this
 * gate, `javascript:` (and `data:`, `vbscript:`, …) in a facet would render
 * as a live anchor and execute on whatever page embeds the component.
 */
const SAFE_LINK_SCHEMES = new Set(["http:", "https:"]);

/**
 * Returns the URI when it is safe to use as an `href`, otherwise undefined
 * so the caller can degrade the segment to plain text. Relative URIs are
 * rejected too: a facet has no base to resolve against, and resolving one
 * against the embedding page would be the component inventing a link the
 * author never wrote.
 */
const safeLinkHref = (uri: string): string | undefined => {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return undefined;
  }
  return SAFE_LINK_SCHEMES.has(parsed.protocol) ? uri : undefined;
};

/**
 * Splits post text into renderable segments using its facets.
 *
 * Facet indices are **UTF-8 byte offsets**, not JS string indices, so the
 * text is sliced on its encoded bytes. Invalid facets (out of range,
 * overlapping an earlier one, or with no feature we understand) degrade to
 * plain text rather than breaking rendering.
 */
export const segmentRichText = (
  text: string,
  facets: Facet[] | undefined,
  /** web viewer base for mention/tag links (bsky.app by default) */
  viewer?: string,
): RichTextSegment[] => {
  const bytes = encoder.encode(text);
  if (!facets || facets.length === 0) {
    return text.length > 0 ? [{ type: "text", text }] : [];
  }

  const sorted = [...facets].sort(
    (a, b) => a.index.byteStart - b.index.byteStart,
  );

  const segments: RichTextSegment[] = [];
  let cursor = 0;

  const pushText = (from: number, to: number) => {
    if (to <= from) return;
    segments.push({
      type: "text",
      text: decoder.decode(bytes.subarray(from, to)),
    });
  };

  for (const facet of sorted) {
    const { byteStart, byteEnd } = facet.index;
    if (
      byteStart < cursor || // overlaps the previous facet
      byteEnd <= byteStart ||
      byteEnd > bytes.length
    ) {
      continue;
    }

    const facetText = decoder.decode(bytes.subarray(byteStart, byteEnd));
    const segment = toSegment(facetText, facet, viewer);
    if (!segment) {
      continue;
    }

    pushText(cursor, byteStart);
    segments.push(segment);
    cursor = byteEnd;
  }

  pushText(cursor, bytes.length);
  return segments;
};

const toSegment = (
  text: string,
  facet: Facet,
  viewer?: string,
): RichTextSegment | null => {
  for (const feature of facet.features) {
    switch (feature.$type) {
      case "app.bsky.richtext.facet#link":
        if ("uri" in feature && typeof feature.uri === "string") {
          const href = safeLinkHref(feature.uri);
          // An unsafe scheme falls through to `null` below, which renders the
          // facet's text as plain text — the reader still sees what was
          // written, just not as a clickable link.
          if (href) return { type: "link", text, href };
        }
        break;
      case "app.bsky.richtext.facet#mention":
        if ("did" in feature && typeof feature.did === "string") {
          return {
            type: "mention",
            text,
            did: feature.did,
            href: viewerProfileUrl(feature.did, viewer),
          };
        }
        break;
      case "app.bsky.richtext.facet#tag":
        if ("tag" in feature && typeof feature.tag === "string") {
          return {
            type: "tag",
            text,
            tag: feature.tag,
            href: viewerTagUrl(feature.tag, viewer),
          };
        }
        break;
    }
  }
  return null;
};
