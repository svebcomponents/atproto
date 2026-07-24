import { afterEach, describe, expect, it, vi } from "vitest";

import {
  COMMENT_SOURCE,
  CommentStreamCapacityError,
  createCommentStreamBroker,
  resolveCommentStreamConfig,
  type WebSocketEventLike,
  type WebSocketLike,
} from "./commentStream.js";

const THREAD = "at://did:plc:author/app.bsky.feed.post/3examplethread";
const REPLY = "at://did:plc:commenter/app.bsky.feed.post/3examplereply";

class FakeWebSocket implements WebSocketLike {
  readonly listeners = new Map<
    string,
    Array<(event: WebSocketEventLike) => void>
  >();
  closed = false;
  sent: string[] = [];

  addEventListener(
    type: "open" | "message" | "error" | "close",
    listener: (event: WebSocketEventLike) => void,
  ): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  emit(type: "open" | "message" | "error" | "close", data?: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ data });
  }

  close(): void {
    this.closed = true;
  }

  send(data: string): void {
    this.sent.push(data);
  }
}

const text = (chunk: Uint8Array): string => new TextDecoder().decode(chunk);

describe("comment stream broker", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shares one filtered Spacedust websocket across viewers of a thread", async () => {
    const sockets: FakeWebSocket[] = [];
    const urls: string[] = [];
    const broker = createCommentStreamBroker(
      resolveCommentStreamConfig({ heartbeatMs: 60_000 }),
      (url) => {
        urls.push(url);
        const socket = new FakeWebSocket();
        sockets.push(socket);
        return socket;
      },
    );

    const first = broker.subscribe(THREAD).getReader();
    const second = broker.subscribe(THREAD).getReader();
    expect(text((await first.read()).value!)).toContain("event: ready");
    expect(text((await second.read()).value!)).toContain("event: ready");
    expect(sockets).toHaveLength(1);
    expect(broker.stats()).toEqual({
      threads: 1,
      subscribers: 2,
      upstreamConnections: 1,
    });

    const upstream = new URL(urls[0]!);
    expect(upstream.origin).toBe("wss://spacedust.microcosm.blue");
    expect(upstream.searchParams.getAll("wantedSources")).toEqual([
      COMMENT_SOURCE,
    ]);
    expect(upstream.searchParams.getAll("wantedSubjects")).toEqual([THREAD]);

    sockets[0]!.emit(
      "message",
      JSON.stringify({
        kind: "link",
        origin: "live",
        link: {
          operation: "create",
          source: COMMENT_SOURCE,
          source_record: REPLY,
          source_rev: "3examplerev",
          subject: THREAD,
        },
      }),
    );
    const firstEvent = text((await first.read()).value!);
    const secondEvent = text((await second.read()).value!);
    expect(firstEvent).toContain("event: comment");
    expect(firstEvent).toContain(`id: ${REPLY}`);
    expect(firstEvent).toContain(`"uri":"${REPLY}"`);
    expect(secondEvent).toBe(firstEvent);

    await first.cancel();
    expect(sockets[0]!.closed).toBe(false);
    await second.cancel();
    expect(sockets[0]!.closed).toBe(true);
    expect(broker.stats()).toEqual({
      threads: 0,
      subscribers: 0,
      upstreamConnections: 0,
    });
  });

  it("multiplexes distinct threads through one upstream socket", async () => {
    const sockets: FakeWebSocket[] = [];
    const broker = createCommentStreamBroker(
      resolveCommentStreamConfig({ heartbeatMs: 60_000 }),
      () => {
        const socket = new FakeWebSocket();
        sockets.push(socket);
        return socket;
      },
    );
    const otherThread = "at://did:plc:other/app.bsky.feed.post/3otherthread";
    const first = broker.subscribe(THREAD).getReader();
    await first.read();
    sockets[0]!.emit("open");
    await first.read(); // connected status

    const second = broker.subscribe(otherThread).getReader();
    await second.read();
    expect(text((await second.read()).value!)).toContain(
      `"upstream":"connected"`,
    );
    expect(sockets).toHaveLength(1);
    expect(sockets[0]!.sent).toHaveLength(2);
    expect(JSON.parse(sockets[0]!.sent.at(-1)!)).toEqual({
      type: "options_update",
      payload: {
        wantedSources: [COMMENT_SOURCE],
        wantedSubjects: [THREAD, otherThread],
      },
    });

    sockets[0]!.emit(
      "message",
      JSON.stringify({
        kind: "link",
        link: {
          operation: "create",
          source: COMMENT_SOURCE,
          source_record: REPLY,
          subject: otherThread,
        },
      }),
    );
    expect(text((await second.read()).value!)).toContain(
      `"thread":"${otherThread}"`,
    );

    await second.cancel();
    expect(JSON.parse(sockets[0]!.sent.at(-1)!)).toMatchObject({
      payload: { wantedSubjects: [THREAD] },
    });
    await first.cancel();
    expect(sockets[0]!.closed).toBe(true);
  });

  it("ignores deletes, unrelated links, and malformed messages", async () => {
    let socket: FakeWebSocket | undefined;
    const broker = createCommentStreamBroker(
      resolveCommentStreamConfig({ heartbeatMs: 60_000 }),
      () => (socket = new FakeWebSocket()),
    );
    const reader = broker.subscribe(THREAD).getReader();
    await reader.read();

    socket!.emit("message", "not json");
    socket!.emit(
      "message",
      JSON.stringify({
        kind: "link",
        link: {
          operation: "delete",
          source: COMMENT_SOURCE,
          source_record: REPLY,
          subject: THREAD,
        },
      }),
    );
    socket!.emit(
      "message",
      JSON.stringify({
        kind: "link",
        link: {
          operation: "create",
          source: "app.bsky.feed.like:subject.uri",
          source_record: REPLY,
          subject: THREAD,
        },
      }),
    );
    socket!.emit(
      "message",
      JSON.stringify({
        kind: "link",
        link: {
          operation: "create",
          source: COMMENT_SOURCE,
          source_record: REPLY,
          subject: THREAD,
        },
      }),
    );
    // If an ignored message had been queued, it would be returned before this.
    expect(text((await reader.read()).value!)).toContain(`"uri":"${REPLY}"`);
    await reader.cancel();
  });

  it("enforces per-process and per-thread capacity", async () => {
    const broker = createCommentStreamBroker(
      resolveCommentStreamConfig({
        maxThreads: 1,
        maxSubscribers: 2,
        maxSubscribersPerThread: 1,
        heartbeatMs: 60_000,
      }),
      () => new FakeWebSocket(),
    );
    const first = broker.subscribe(THREAD).getReader();
    await first.read();

    expect(() => broker.subscribe(THREAD)).toThrow(CommentStreamCapacityError);
    expect(() =>
      broker.subscribe("at://did:plc:other/app.bsky.feed.post/3otherthread"),
    ).toThrow(CommentStreamCapacityError);
    await first.cancel();
  });

  it("reconnects the upstream with backoff while viewers remain", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const sockets: FakeWebSocket[] = [];
    const broker = createCommentStreamBroker(
      resolveCommentStreamConfig({ heartbeatMs: 60_000 }),
      () => {
        const socket = new FakeWebSocket();
        sockets.push(socket);
        return socket;
      },
    );
    const reader = broker.subscribe(THREAD).getReader();
    await reader.read();

    sockets[0]!.emit("close");
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(2);

    await reader.cancel();
    expect(sockets[1]!.closed).toBe(true);
  });

  it("closes the stream and upstream when its request is aborted", async () => {
    let socket: FakeWebSocket | undefined;
    const broker = createCommentStreamBroker(
      resolveCommentStreamConfig({ heartbeatMs: 60_000 }),
      () => (socket = new FakeWebSocket()),
    );
    const abort = new AbortController();
    const reader = broker.subscribe(THREAD, abort.signal).getReader();
    await reader.read();

    abort.abort();
    expect(await reader.read()).toEqual({ done: true, value: undefined });
    expect(socket!.closed).toBe(true);
    expect(broker.stats()).toEqual({
      threads: 0,
      subscribers: 0,
      upstreamConnections: 0,
    });
  });
});
