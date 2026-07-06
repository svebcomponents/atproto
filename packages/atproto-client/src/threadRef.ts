/**
 * A reference to the discussion-root post of a comment thread.
 */
export interface ThreadRef {
  /** DID or handle owning the post's repo */
  authority: string;
  /** record collection NSID, e.g. "app.bsky.feed.post" */
  collection: string;
  /** record key within the collection */
  rkey: string;
  /**
   * Canonical `at://` URI. Only defined when `authority` is a DID —
   * handle authorities first need resolution (`resolveHandle`) to be
   * addressable unambiguously.
   */
  uri: string | undefined;
}

const isDid = (value: string): boolean => /^did:[a-z0-9]+:.+$/.test(value);

// NSIDs are reverse-domain identifiers: at least two dotted segments.
const isNsid = (value: string): boolean =>
  /^[a-zA-Z][a-zA-Z0-9-]*(\.[a-zA-Z0-9-]+)+$/.test(value);

const makeThreadRef = (
  authority: string,
  collection: string,
  rkey: string,
): ThreadRef => ({
  authority,
  collection,
  rkey,
  uri: isDid(authority) ? `at://${authority}/${collection}/${rkey}` : undefined,
});

const parseAtUri = (input: string): ThreadRef | undefined => {
  const match = /^at:\/\/([^/]+)\/([^/]+)\/([^/?#]+)$/.exec(input);
  if (!match) {
    return undefined;
  }
  const [, authority, collection, rkey] = match;
  if (!authority || !collection || !rkey || !isNsid(collection)) {
    return undefined;
  }
  return makeThreadRef(authority, collection, rkey);
};

const parseBskyAppUrl = (input: string): ThreadRef | undefined => {
  let url;
  try {
    url = new URL(input);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || url.hostname !== "bsky.app") {
    return undefined;
  }
  const match = /^\/profile\/([^/]+)\/post\/([^/]+)\/?$/.exec(url.pathname);
  if (!match) {
    return undefined;
  }
  const [, authority, rkey] = match;
  if (!authority || !rkey) {
    return undefined;
  }
  return makeThreadRef(
    decodeURIComponent(authority),
    "app.bsky.feed.post",
    rkey,
  );
};

/**
 * Parses user-provided thread identifiers: either an `at://` URI or a
 * `https://bsky.app/profile/…/post/…` URL. Returns `undefined` for
 * anything else.
 */
export const parseThreadRef = (input: string): ThreadRef | undefined => {
  const trimmed = input.trim();
  if (trimmed.startsWith("at://")) {
    return parseAtUri(trimmed);
  }
  return parseBskyAppUrl(trimmed);
};
