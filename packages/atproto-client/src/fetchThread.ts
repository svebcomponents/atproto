import type { GetPostThreadResponse } from "./appviewTypes.js";
import { normalizeThread, type CommentTree } from "./commentTree.js";
import { parseThreadRef, type ThreadRef } from "./threadRef.js";

export const DEFAULT_APPVIEW = "https://public.api.bsky.app";

/** a non-2xx response from the AppView, carrying its structured error code */
export class AppViewError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /** e.g. "NotFound", "InvalidRequest" */
    public readonly code?: string,
  ) {
    super(message);
    this.name = "AppViewError";
  }
}

export interface AppViewRequestOptions {
  /** AppView base URL; defaults to the public Bluesky AppView */
  appView?: string;
  signal?: AbortSignal;
  /** injectable for tests and non-global fetch environments */
  fetch?: typeof globalThis.fetch;
}

const xrpc = async <T>(
  method: string,
  params: Record<string, string>,
  {
    appView = DEFAULT_APPVIEW,
    signal,
    fetch = globalThis.fetch,
  }: AppViewRequestOptions,
): Promise<T> => {
  const url = new URL(`/xrpc/${method}`, appView);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url, {
    ...(signal ? { signal } : {}),
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    let code: string | undefined;
    let message = `${method} failed with HTTP ${response.status}`;
    try {
      const body = (await response.json()) as {
        error?: string;
        message?: string;
      };
      code = body.error;
      if (body.message) message = body.message;
    } catch {
      // non-JSON error body — keep the generic message
    }
    throw new AppViewError(message, response.status, code);
  }
  return (await response.json()) as T;
};

export interface GetPostThreadOptions extends AppViewRequestOptions {
  /** reply depth to fetch (AppView default 6, max 1000) */
  depth?: number;
  /** parent posts above the root to fetch — 0 for comment threads */
  parentHeight?: number;
}

export const getPostThread = (
  uri: string,
  { depth = 10, parentHeight = 0, ...request }: GetPostThreadOptions = {},
): Promise<GetPostThreadResponse> =>
  xrpc<GetPostThreadResponse>(
    "app.bsky.feed.getPostThread",
    { uri, depth: String(depth), parentHeight: String(parentHeight) },
    request,
  );

export const resolveHandle = async (
  handle: string,
  request: AppViewRequestOptions = {},
): Promise<string> => {
  const { did } = await xrpc<{ did: string }>(
    "com.atproto.identity.resolveHandle",
    { handle },
    request,
  );
  return did;
};

/** resolves a ThreadRef to a canonical at:// URI, resolving handles if needed */
export const resolveThreadUri = async (
  ref: ThreadRef,
  request: AppViewRequestOptions = {},
): Promise<string> => {
  if (ref.uri) {
    return ref.uri;
  }
  const did = await resolveHandle(ref.authority, request);
  return `at://${did}/${ref.collection}/${ref.rkey}`;
};

export interface FetchCommentTreeOptions extends GetPostThreadOptions {
  /** web viewer base for outbound links in the tree (bsky.app by default) */
  viewer?: string;
}

/**
 * One-call convenience: parse a thread identifier (at:// URI or bsky.app
 * URL), resolve handles, fetch the thread from the AppView, and normalize it
 * into a renderable {@link CommentTree}.
 */
export const fetchCommentTree = async (
  thread: string | ThreadRef,
  options: FetchCommentTreeOptions = {},
): Promise<CommentTree> => {
  const ref = typeof thread === "string" ? parseThreadRef(thread) : thread;
  if (!ref) {
    throw new Error(
      `Not a valid AT URI or bsky.app post URL: ${String(thread)}`,
    );
  }
  const uri = await resolveThreadUri(ref, options);
  const { thread: rawThread } = await getPostThread(uri, options);
  return normalizeThread(rawThread, options.viewer);
};
