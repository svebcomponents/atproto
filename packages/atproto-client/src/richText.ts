import type { Facet } from "./appviewTypes.js";
import { bskyProfileUrl, bskyTagUrl } from "./urls.js";

export type RichTextSegment =
  | { type: "text"; text: string }
  | { type: "link"; text: string; href: string }
  | { type: "mention"; text: string; did: string; href: string }
  | { type: "tag"; text: string; tag: string; href: string };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

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
    const segment = toSegment(facetText, facet);
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

const toSegment = (text: string, facet: Facet): RichTextSegment | null => {
  for (const feature of facet.features) {
    switch (feature.$type) {
      case "app.bsky.richtext.facet#link":
        if ("uri" in feature && typeof feature.uri === "string") {
          return { type: "link", text, href: feature.uri };
        }
        break;
      case "app.bsky.richtext.facet#mention":
        if ("did" in feature && typeof feature.did === "string") {
          return {
            type: "mention",
            text,
            did: feature.did,
            href: bskyProfileUrl(feature.did),
          };
        }
        break;
      case "app.bsky.richtext.facet#tag":
        if ("tag" in feature && typeof feature.tag === "string") {
          return {
            type: "tag",
            text,
            tag: feature.tag,
            href: bskyTagUrl(feature.tag),
          };
        }
        break;
    }
  }
  return null;
};
