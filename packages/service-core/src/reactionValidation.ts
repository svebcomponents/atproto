import {
  MAX_VIEWER_SUBJECTS,
  parseThreadRef,
  type ThreadRef,
} from "@svebcomponents/atproto.client";

import { type PostRef, validatePostRef } from "./replyValidation.js";

export class ReactionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReactionValidationError";
  }
}

/** Validates an incoming like/repost creation body; throws {@link ReactionValidationError}. */
export const validateReactionSubject = (body: unknown): PostRef => {
  try {
    return validatePostRef(body, "subject");
  } catch (error) {
    throw new ReactionValidationError(
      error instanceof Error ? error.message : "invalid subject",
    );
  }
};

/**
 * Validates the `uri` query param for undoing a like/repost: it must be an
 * at:// URI in the given collection, owned by the caller's own repo — a
 * caller can only delete their own like/repost records.
 */
export const validateOwnRecordUri = (
  uri: string | null,
  collection: string,
  did: string,
): ThreadRef & { uri: string } => {
  const ref = uri ? parseThreadRef(uri) : undefined;
  if (!ref?.uri || ref.collection !== collection) {
    throw new ReactionValidationError(
      `uri must be an at:// URI in ${collection}`,
    );
  }
  if (ref.authority !== did) {
    throw new ReactionValidationError("uri does not belong to the caller");
  }
  return ref as ThreadRef & { uri: string };
};

/** which of the reader's own reactions to look up, per post */
export interface ViewerSubjects {
  /** posts to check for a like by the reader */
  likes: readonly string[];
  /** posts to check for a repost by the reader */
  reposts: readonly string[];
}

const postUris = (uris: readonly string[]): readonly string[] => {
  const subjects = new Set<string>();
  for (const uri of uris) {
    const ref = parseThreadRef(uri);
    if (!ref?.uri || ref.collection !== "app.bsky.feed.post") {
      throw new ReactionValidationError(
        "like and repost params must be at:// URIs in app.bsky.feed.post",
      );
    }
    subjects.add(ref.uri);
  }
  return [...subjects];
};

/**
 * Validates a viewer-state lookup's `like` and `repost` params. They are
 * separate because the caller knows the public reaction counts and only asks
 * about posts that have any — a comment nobody has liked cannot be one the
 * reader liked, and skipping it is one query not made.
 */
export const validateViewerSubjects = (
  params: URLSearchParams,
): ViewerSubjects => {
  const likes = params.getAll("like");
  const reposts = params.getAll("repost");
  if (likes.length + reposts.length > MAX_VIEWER_SUBJECTS) {
    throw new ReactionValidationError(
      `at most ${MAX_VIEWER_SUBJECTS} like and repost params per request`,
    );
  }
  return { likes: postUris(likes), reposts: postUris(reposts) };
};
