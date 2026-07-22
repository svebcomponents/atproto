import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchCommentTree,
  type CommentTree,
} from "@svebcomponents/atproto.client";
import prepare from "./index.ssr.js";

vi.mock("@svebcomponents/atproto.client", () => ({
  fetchCommentTree: vi.fn(),
}));

const tree = { root: { uri: "at://example/thread" } } as CommentTree;

describe("atproto-comments SSR prepare", () => {
  beforeEach(() => {
    vi.mocked(fetchCommentTree).mockReset();
  });

  it("fetches missing threadData and supplies it for rendering and hydration", async () => {
    vi.mocked(fetchCommentTree).mockResolvedValue(tree);
    const setProperty = vi.fn();

    await prepare({
      props: Object.freeze({
        thread: "at://example/thread",
        appview: "https://appview.example",
        viewer: "https://viewer.example",
      }),
      setProperty,
    });

    expect(fetchCommentTree).toHaveBeenCalledWith("at://example/thread", {
      appView: "https://appview.example",
      viewer: "https://viewer.example",
    });
    expect(setProperty).toHaveBeenCalledWith("threadData", tree);
  });

  it("returns synchronously and does not fetch when threadData is supplied", () => {
    const result = prepare({
      props: Object.freeze({
        thread: "at://example/thread",
        threadData: tree,
      }),
      setProperty: vi.fn(),
    });

    expect(result).toBeUndefined();
    expect(fetchCommentTree).not.toHaveBeenCalled();
  });

  it("leaves the client fallback available when server fetching fails", async () => {
    const error = new Error("unavailable");
    vi.mocked(fetchCommentTree).mockRejectedValue(error);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const setProperty = vi.fn();

    await prepare({
      props: Object.freeze({ thread: "at://example/thread" }),
      setProperty,
    });

    expect(setProperty).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      "atproto-comments SSR prefetch failed:",
      error,
    );
    consoleError.mockRestore();
  });
});
