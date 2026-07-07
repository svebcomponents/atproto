// Wire types for the subset of the Bluesky AppView API we consume.
// Grounded against real `app.bsky.feed.getPostThread` responses from
// public.api.bsky.app (2026-07) and the app.bsky.feed.defs lexicon.

export interface ProfileViewBasic {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

export interface Label {
  src: string;
  val: string;
  neg?: boolean;
}

export interface FacetByteSlice {
  byteStart: number;
  byteEnd: number;
}

export type FacetFeature =
  | { $type: "app.bsky.richtext.facet#link"; uri: string }
  | { $type: "app.bsky.richtext.facet#mention"; did: string }
  | { $type: "app.bsky.richtext.facet#tag"; tag: string }
  // forward-compat: unknown feature types must not break rendering
  | { $type: string };

export interface Facet {
  index: FacetByteSlice;
  features: FacetFeature[];
}

export interface PostRecord {
  $type: "app.bsky.feed.post";
  text: string;
  createdAt: string;
  facets?: Facet[];
  langs?: string[];
}

export interface PostView {
  uri: string;
  cid: string;
  author: ProfileViewBasic;
  /** validated as PostRecord during normalization */
  record: unknown;
  replyCount?: number;
  repostCount?: number;
  likeCount?: number;
  quoteCount?: number;
  indexedAt?: string;
  labels?: Label[];
}

export interface ThreadViewPost {
  $type: "app.bsky.feed.defs#threadViewPost";
  post: PostView;
  replies?: ThreadNode[];
}

export interface NotFoundPost {
  $type: "app.bsky.feed.defs#notFoundPost";
  uri: string;
  notFound: true;
}

export interface BlockedPost {
  $type: "app.bsky.feed.defs#blockedPost";
  uri: string;
  blocked: true;
  author?: { did: string };
}

export type ThreadNode = ThreadViewPost | NotFoundPost | BlockedPost;

export interface GetPostThreadResponse {
  thread: ThreadNode;
}
