import type {
  PostRecord,
  PostView,
  ThreadNode,
  ThreadViewPost,
} from "./appviewTypes.js";
import { segmentRichText, type RichTextSegment } from "./richText.js";
import { bskyPostUrl, bskyProfileUrl } from "./urls.js";

export interface CommentAuthor {
  did: string;
  handle: string;
  displayName?: string | undefined;
  avatarUrl?: string | undefined;
  profileUrl: string;
}

export interface Comment {
  kind: "comment";
  uri: string;
  cid: string;
  author: CommentAuthor;
  text: string;
  segments: RichTextSegment[];
  /** ISO datetime from the record (author-asserted) */
  createdAt: string;
  likeCount: number;
  replyCount: number;
  /** moderation label values applied to the post */
  labels: string[];
  /** bsky.app permalink */
  url: string;
  replies: CommentNode[];
  /** replies exist beyond the fetched depth — link out to continue reading */
  hasMoreReplies: boolean;
}

/** the author has blocked the viewer or vice versa — render a tombstone */
export interface BlockedComment {
  kind: "blocked";
  uri: string;
}

/** deleted or otherwise unavailable — render a tombstone */
export interface NotFoundComment {
  kind: "not-found";
  uri: string;
}

export type CommentNode = Comment | BlockedComment | NotFoundComment;

export interface RootSummary {
  uri: string;
  cid: string;
  author: CommentAuthor;
  replyCount: number;
  likeCount: number;
  repostCount: number;
  quoteCount: number;
  /** bsky.app permalink — also the "Reply on Bluesky" target */
  url: string;
}

export interface CommentTree {
  root: RootSummary;
  comments: CommentNode[];
  /** ISO datetime the tree was fetched — useful for revalidation decisions */
  fetchedAt: string;
}

/** the discussion root itself is unavailable (deleted, blocked, or bad URI) */
export class ThreadUnavailableError extends Error {
  constructor(
    public readonly reason: "not-found" | "blocked",
    uri: string,
  ) {
    super(`Thread root is ${reason}: ${uri}`);
    this.name = "ThreadUnavailableError";
  }
}

const isPostRecord = (record: unknown): record is PostRecord =>
  typeof record === "object" &&
  record !== null &&
  "$type" in record &&
  (record as { $type: unknown }).$type === "app.bsky.feed.post";

const toAuthor = (author: PostView["author"]): CommentAuthor => ({
  did: author.did,
  handle: author.handle,
  displayName: author.displayName,
  avatarUrl: author.avatar,
  profileUrl: bskyProfileUrl(author.handle),
});

const toComment = (node: ThreadViewPost): Comment => {
  const { post } = node;
  const record = isPostRecord(post.record) ? post.record : undefined;
  const text = record?.text ?? "";
  const replyCount = post.replyCount ?? 0;
  const replies = (node.replies ?? []).map(normalizeNode);
  return {
    kind: "comment",
    uri: post.uri,
    cid: post.cid,
    author: toAuthor(post.author),
    text,
    segments: segmentRichText(text, record?.facets),
    createdAt: record?.createdAt ?? post.indexedAt ?? "",
    likeCount: post.likeCount ?? 0,
    replyCount,
    labels: (post.labels ?? []).filter((l) => !l.neg).map((l) => l.val),
    url: bskyPostUrl(post.uri, post.author.handle),
    replies,
    hasMoreReplies: replyCount > replies.length,
  };
};

const normalizeNode = (node: ThreadNode): CommentNode => {
  switch (node.$type) {
    case "app.bsky.feed.defs#threadViewPost":
      return toComment(node);
    case "app.bsky.feed.defs#blockedPost":
      return { kind: "blocked", uri: node.uri };
    case "app.bsky.feed.defs#notFoundPost":
      return { kind: "not-found", uri: node.uri };
    default:
      // forward-compat: treat unknown thread node types as unavailable
      return {
        kind: "not-found",
        uri: (node as { uri?: string }).uri ?? "",
      };
  }
};

/**
 * Converts a raw `getPostThread` thread into the renderable comment tree.
 *
 * Throws {@link ThreadUnavailableError} when the discussion root itself is
 * blocked or not found.
 */
export const normalizeThread = (thread: ThreadNode): CommentTree => {
  if (thread.$type !== "app.bsky.feed.defs#threadViewPost") {
    throw new ThreadUnavailableError(
      thread.$type === "app.bsky.feed.defs#blockedPost"
        ? "blocked"
        : "not-found",
      "uri" in thread ? thread.uri : "",
    );
  }

  const { post } = thread;
  const root: RootSummary = {
    uri: post.uri,
    cid: post.cid,
    author: toAuthor(post.author),
    replyCount: post.replyCount ?? 0,
    likeCount: post.likeCount ?? 0,
    repostCount: post.repostCount ?? 0,
    quoteCount: post.quoteCount ?? 0,
    url: bskyPostUrl(post.uri, post.author.handle),
  };

  return {
    root,
    comments: (thread.replies ?? []).map(normalizeNode),
    fetchedAt: new Date().toISOString(),
  };
};
