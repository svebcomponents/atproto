import { parseThreadRef } from "@svebcomponents/atproto.client";

/** Bluesky's post length limit, counted in graphemes */
export const MAX_REPLY_GRAPHEMES = 300;

const graphemeSegmenter = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
});

export const countGraphemes = (text: string): number => {
  let count = 0;
  for (const _ of graphemeSegmenter.segment(text)) count += 1;
  return count;
};

export interface PostRef {
  uri: string;
  cid: string;
}

export interface ReplyRequest {
  root: PostRef;
  parent: PostRef;
  text: string;
  langs?: string[];
}

export class ReplyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplyValidationError";
  }
}

const CID_PATTERN = /^[a-z2-7]{8,256}$/i;
const LANG_PATTERN = /^[a-zA-Z]{2,8}(-[a-zA-Z0-9]{1,8})*$/;

const validatePostRef = (value: unknown, field: string): PostRef => {
  if (typeof value !== "object" || value === null) {
    throw new ReplyValidationError(`${field} must be an object`);
  }
  const { uri, cid } = value as { uri?: unknown; cid?: unknown };
  if (typeof uri !== "string" || !parseThreadRef(uri)?.uri) {
    throw new ReplyValidationError(
      `${field}.uri must be an at:// URI with a DID authority`,
    );
  }
  if (typeof cid !== "string" || !CID_PATTERN.test(cid)) {
    throw new ReplyValidationError(`${field}.cid must be a CID string`);
  }
  return { uri, cid };
};

/** Validates an incoming reply request body; throws {@link ReplyValidationError}. */
export const validateReplyRequest = (body: unknown): ReplyRequest => {
  if (typeof body !== "object" || body === null) {
    throw new ReplyValidationError("request body must be a JSON object");
  }
  const { root, parent, text, langs } = body as Record<string, unknown>;

  const validatedText = typeof text === "string" ? text.trim() : "";
  if (validatedText.length === 0) {
    throw new ReplyValidationError("text must be a non-empty string");
  }
  // eslint-disable-next-line no-control-regex -- strip C0 controls except \n\t
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(validatedText)) {
    throw new ReplyValidationError("text contains control characters");
  }
  if (countGraphemes(validatedText) > MAX_REPLY_GRAPHEMES) {
    throw new ReplyValidationError(
      `text exceeds ${MAX_REPLY_GRAPHEMES} graphemes`,
    );
  }

  const validatedLangs =
    langs === undefined
      ? undefined
      : Array.isArray(langs) &&
          langs.length <= 3 &&
          langs.every(
            (lang) => typeof lang === "string" && LANG_PATTERN.test(lang),
          )
        ? (langs as string[])
        : (() => {
            throw new ReplyValidationError(
              "langs must be up to 3 BCP-47 language tags",
            );
          })();

  return {
    root: validatePostRef(root, "root"),
    parent: validatePostRef(parent, "parent"),
    text: validatedText,
    ...(validatedLangs ? { langs: validatedLangs } : {}),
  };
};
