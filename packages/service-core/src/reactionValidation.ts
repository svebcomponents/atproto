import { parseThreadRef, type ThreadRef } from "@svebcomponents/atproto.client";

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
