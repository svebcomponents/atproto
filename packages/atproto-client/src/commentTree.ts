import type {
  PostRecord,
  PostView,
  ThreadNode,
  ThreadViewPost,
} from "./appviewTypes.js";
import { segmentRichText, type RichTextSegment } from "./richText.js";
import { viewerPostUrl, viewerProfileUrl } from "./urls.js";

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
  /** viewer permalink (bsky.app by default) */
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
  /** viewer permalink (bsky.app by default) — also the reply-link target */
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

const toAuthor = (
  author: PostView["author"],
  viewer?: string,
): CommentAuthor => ({
  did: author.did,
  handle: author.handle,
  displayName: author.displayName,
  avatarUrl: author.avatar,
  profileUrl: viewerProfileUrl(author.handle, viewer),
});

const toComment = (node: ThreadViewPost, viewer?: string): Comment => {
  const { post } = node;
  const record = isPostRecord(post.record) ? post.record : undefined;
  const text = record?.text ?? "";
  const replyCount = post.replyCount ?? 0;
  const replies = (node.replies ?? []).map((reply) =>
    normalizeNode(reply, viewer),
  );
  return {
    kind: "comment",
    uri: post.uri,
    cid: post.cid,
    author: toAuthor(post.author, viewer),
    text,
    segments: segmentRichText(text, record?.facets, viewer),
    createdAt: record?.createdAt ?? post.indexedAt ?? "",
    likeCount: post.likeCount ?? 0,
    replyCount,
    labels: (post.labels ?? []).filter((l) => !l.neg).map((l) => l.val),
    url: viewerPostUrl(post.uri, post.author.handle, viewer),
    replies,
    hasMoreReplies: replyCount > replies.length,
  };
};

const normalizeNode = (node: ThreadNode, viewer?: string): CommentNode => {
  switch (node.$type) {
    case "app.bsky.feed.defs#threadViewPost":
      return toComment(node, viewer);
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
export const normalizeThread = (
  thread: ThreadNode,
  /** web viewer base for outbound links (bsky.app by default) */
  viewer?: string,
): CommentTree => {
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
    author: toAuthor(post.author, viewer),
    replyCount: post.replyCount ?? 0,
    likeCount: post.likeCount ?? 0,
    repostCount: post.repostCount ?? 0,
    quoteCount: post.quoteCount ?? 0,
    url: viewerPostUrl(post.uri, post.author.handle, viewer),
  };

  return {
    root,
    comments: (thread.replies ?? []).map((reply) =>
      normalizeNode(reply, viewer),
    ),
    fetchedAt: new Date().toISOString(),
  };
};
