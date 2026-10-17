import {
  fetchCommentTree,
  type FetchCommentTreeOptions,
} from "@svebcomponents/atproto.client";
import type { SsrPrepare } from "@svebcomponents/ssr";
import { COLLAPSED_FETCH_DEPTH } from "./replies.js";

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
  // Collapsed replies render without them until opened, so the server only
  // reads the root post, exactly like the browser would.
  const collapsed = stringProperty(props, "replies") === "collapsed";
  const options: FetchCommentTreeOptions = {
    ...(collapsed ? { depth: COLLAPSED_FETCH_DEPTH } : {}),
    ...(appView ? { appView } : {}),
    ...(viewer ? { viewer } : {}),
  };

  return fetchCommentTree(thread, options)
    .then((threadData) => {
      setProperty("threadData", threadData);
      // Stamp the fetch time so the hydrated component can tell whether its
      // snapshot is still inside `staleTime`, or should revalidate once on
      // mount. Numbers serialize through the rich-prop transport like any
      // other prepared value.
      setProperty("fetchedAt", Date.now());
    })
    .catch((error: unknown) => {
      // Keep SSR resilient. With no prepared data, the hydrated component uses
      // its existing browser fetch path (including its visible error/retry UI).
      console.error("atproto-comments SSR prefetch failed:", error);
    });
};

export default prepare;
