import {
  fetchCommentTree,
  type FetchCommentTreeOptions,
} from "@svebcomponents/atproto.client";
import type { SsrPrepare } from "@svebcomponents/ssr";

const stringProperty = (
  props: Readonly<Record<string, unknown>>,
  name: string,
): string | undefined => {
  const value = props[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

/**
 * Self-fetch the thread during SSR when the host has not supplied threadData.
 * svebcomponents serializes the prepared property for hydration, so the
 * browser adopts the rendered tree without fetching it again.
 */
const prepare: SsrPrepare = ({ props, setProperty }) => {
  if (props["threadData"] !== undefined) return;

  const thread = stringProperty(props, "thread");
  if (!thread) return;

  const appView = stringProperty(props, "appview");
  const viewer = stringProperty(props, "viewer");
  const options: FetchCommentTreeOptions = {
    ...(appView ? { appView } : {}),
    ...(viewer ? { viewer } : {}),
  };

  return fetchCommentTree(thread, options)
    .then((threadData) => setProperty("threadData", threadData))
    .catch((error: unknown) => {
      // Keep SSR resilient. With no prepared data, the hydrated component uses
      // its existing browser fetch path (including its visible error/retry UI).
      console.error("atproto-comments SSR prefetch failed:", error);
    });
};

export default prepare;
