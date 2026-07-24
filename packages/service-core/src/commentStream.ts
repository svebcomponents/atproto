const COMMENT_SOURCE = "app.bsky.feed.post:reply.root.uri";
const encoder = new TextEncoder();

export interface CommentStreamConfig {
  /** Spacedust websocket origin (default: public Microcosm instance). */
  spacedustUrl?: string;
  /** Maximum distinct threads watched by one service process. */
  maxThreads?: number;
  /** Maximum SSE clients held by one service process. */
  maxSubscribers?: number;
  /** Maximum SSE clients sharing one thread subscription. */
  maxSubscribersPerThread?: number;
  /** SSE heartbeat interval; keeps proxies from considering streams idle. */
  heartbeatMs?: number;
}

export interface ResolvedCommentStreamConfig {
  spacedustUrl: string;
  maxThreads: number;
  maxSubscribers: number;
  maxSubscribersPerThread: number;
  heartbeatMs: number;
}

export interface WebSocketEventLike {
  data?: unknown;
}

export interface WebSocketLike {
  addEventListener(
    type: "open" | "message" | "error" | "close",
    listener: (event: WebSocketEventLike) => void,
  ): void;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

export interface CommentStreamStats {
  threads: number;
  subscribers: number;
  upstreamConnections: number;
}

export interface CommentStreamBroker {
  subscribe(
    threadUri: string,
    signal?: AbortSignal,
  ): ReadableStream<Uint8Array>;
  stats(): CommentStreamStats;
}

export class CommentStreamCapacityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommentStreamCapacityError";
  }
}

interface SpacedustMessage {
  kind: "link";
  origin?: string;
  link: {
    operation: "create" | "delete";
    source: string;
    source_record: string;
    source_rev?: string;
    subject: string;
  };
}

interface ThreadSubscription {
  threadUri: string;
  subscribers: Set<ReadableStreamDefaultController<Uint8Array>>;
}

const positiveInteger = (
  value: number | undefined,
  fallback: number,
  name: string,
): number => {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return resolved;
};

export const resolveCommentStreamConfig = (
  config: CommentStreamConfig = {},
): ResolvedCommentStreamConfig => {
  const spacedustUrl = new URL(
    config.spacedustUrl ?? "wss://spacedust.microcosm.blue",
  );
  if (spacedustUrl.protocol !== "wss:" && spacedustUrl.protocol !== "ws:") {
    throw new Error("commentStream.spacedustUrl must use ws or wss");
  }
  return {
    spacedustUrl: spacedustUrl.origin,
    maxThreads: positiveInteger(config.maxThreads, 5_000, "maxThreads"),
    maxSubscribers: positiveInteger(
      config.maxSubscribers,
      10_000,
      "maxSubscribers",
    ),
    maxSubscribersPerThread: positiveInteger(
      config.maxSubscribersPerThread,
      1_000,
      "maxSubscribersPerThread",
    ),
    heartbeatMs: positiveInteger(config.heartbeatMs, 15_000, "heartbeatMs"),
  };
};

const defaultWebSocketFactory: WebSocketFactory = (url) => {
  if (typeof globalThis.WebSocket !== "function") {
    throw new Error(
      "This runtime does not provide WebSocket; pass webSocketFactory when creating the service",
    );
  }
  return new globalThis.WebSocket(url);
};

const encodeSse = (
  data: unknown,
  options: { event?: string; id?: string; retry?: number } = {},
): Uint8Array => {
  const lines: string[] = [];
  if (options.retry !== undefined) lines.push(`retry: ${options.retry}`);
  if (options.event) lines.push(`event: ${options.event}`);
  if (options.id) lines.push(`id: ${options.id}`);
  for (const line of JSON.stringify(data).split("\n")) {
    lines.push(`data: ${line}`);
  }
  return encoder.encode(`${lines.join("\n")}\n\n`);
};

const heartbeat = encoder.encode(": heartbeat\n\n");

const parseSpacedustMessage = (data: unknown): SpacedustMessage | undefined => {
  if (typeof data !== "string") return undefined;
  try {
    const message = JSON.parse(data) as Partial<SpacedustMessage>;
    const link = message.link;
    if (
      message.kind !== "link" ||
      !link ||
      link.operation !== "create" ||
      link.source !== COMMENT_SOURCE ||
      typeof link.subject !== "string" ||
      typeof link.source_record !== "string"
    ) {
      return undefined;
    }
    return message as SpacedustMessage;
  } catch {
    return undefined;
  }
};

export const createCommentStreamBroker = (
  config: ResolvedCommentStreamConfig,
  webSocketFactory: WebSocketFactory = defaultWebSocketFactory,
): CommentStreamBroker => {
  const threads = new Map<string, ThreadSubscription>();
  let subscriberCount = 0;
  let socket: WebSocketLike | undefined;
  let socketOpen = false;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  let reconnectAttempt = 0;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

  const sendStatus = (upstream: "connected" | "reconnecting"): void => {
    for (const subscription of threads.values()) {
      broadcast(
        subscription,
        encodeSse(
          { thread: subscription.threadUri, upstream },
          { event: "status" },
        ),
      );
    }
  };

  const broadcast = (
    subscription: ThreadSubscription,
    chunk: Uint8Array,
  ): void => {
    for (const controller of [...subscription.subscribers]) {
      // Bound memory held for a client that stopped reading without closing.
      if (controller.desiredSize !== null && controller.desiredSize < -16) {
        controller.error(new Error("SSE client is not consuming events"));
        removeSubscriber(subscription, controller);
        continue;
      }
      try {
        controller.enqueue(chunk);
      } catch {
        removeSubscriber(subscription, controller);
      }
    }
  };

  const broadcastHeartbeat = (): void => {
    for (const subscription of threads.values()) {
      broadcast(subscription, heartbeat);
    }
  };

  const wantedSubjects = (): string[] => [...threads.keys()];

  const updateUpstreamOptions = (): void => {
    if (!socket || !socketOpen || threads.size === 0) return;
    socket.send(
      JSON.stringify({
        type: "options_update",
        payload: {
          wantedSources: [COMMENT_SOURCE],
          wantedSubjects: wantedSubjects(),
        },
      }),
    );
  };

  const stopUpstream = (): void => {
    if (reconnect) clearTimeout(reconnect);
    reconnect = undefined;
    reconnectAttempt = 0;
    socketOpen = false;
    const current = socket;
    socket = undefined;
    current?.close(1000, "no watched threads");
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
  };

  const removeSubscriber = (
    subscription: ThreadSubscription,
    controller: ReadableStreamDefaultController<Uint8Array>,
  ): void => {
    if (!subscription.subscribers.delete(controller)) return;
    subscriberCount -= 1;
    if (subscription.subscribers.size > 0) return;

    threads.delete(subscription.threadUri);
    if (threads.size === 0) {
      stopUpstream();
    } else {
      updateUpstreamOptions();
    }
  };

  const scheduleReconnect = (): void => {
    if (threads.size === 0 || reconnect !== undefined) return;
    const attempt = reconnectAttempt++;
    const base = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5));
    // Jitter avoids every process reconnecting to the community service at
    // exactly the same instant after a shared outage.
    const delay = Math.round(base * (0.75 + Math.random() * 0.5));
    reconnect = setTimeout(() => {
      reconnect = undefined;
      connect();
    }, delay);
  };

  const connect = (): void => {
    if (threads.size === 0 || socket) return;

    const url = new URL("/subscribe", config.spacedustUrl);
    url.searchParams.set("instant", "true");
    url.searchParams.append("wantedSources", COMMENT_SOURCE);
    // Keep the websocket handshake URL bounded even when thousands of
    // threads are active. The complete set is sent as an `options_update`
    // immediately after the socket opens.
    const firstSubject = threads.keys().next().value as string | undefined;
    if (firstSubject) url.searchParams.append("wantedSubjects", firstSubject);

    let current: WebSocketLike;
    try {
      current = webSocketFactory(url.href);
      socket = current;
    } catch {
      scheduleReconnect();
      return;
    }

    current.addEventListener("open", () => {
      if (socket !== current) return;
      socketOpen = true;
      reconnectAttempt = 0;
      // Threads may have joined or left while the socket was connecting.
      updateUpstreamOptions();
      sendStatus("connected");
    });
    current.addEventListener("message", (event) => {
      if (socket !== current) return;
      const message = parseSpacedustMessage(event.data);
      if (!message) return;
      const subscription = threads.get(message.link.subject);
      if (!subscription) return;
      broadcast(
        subscription,
        encodeSse(
          {
            uri: message.link.source_record,
            thread: message.link.subject,
            operation: message.link.operation,
            ...(message.link.source_rev
              ? { rev: message.link.source_rev }
              : {}),
          },
          {
            event: "comment",
            id: message.link.source_record,
          },
        ),
      );
    });
    current.addEventListener("error", () => {
      if (socket !== current) return;
      current.close(1011, "upstream error");
    });
    current.addEventListener("close", () => {
      if (socket !== current) return;
      socket = undefined;
      socketOpen = false;
      sendStatus("reconnecting");
      scheduleReconnect();
    });
  };

  return {
    subscribe(threadUri, signal) {
      let subscription = threads.get(threadUri);
      const isNewThread = subscription === undefined;
      if (!subscription) {
        if (threads.size >= config.maxThreads) {
          throw new CommentStreamCapacityError(
            "Too many active comment threads",
          );
        }
        subscription = {
          threadUri,
          subscribers: new Set(),
        };
        threads.set(threadUri, subscription);
      }
      if (subscriberCount >= config.maxSubscribers) {
        if (subscription.subscribers.size === 0) threads.delete(threadUri);
        throw new CommentStreamCapacityError(
          "Too many active comment stream clients",
        );
      }
      if (subscription.subscribers.size >= config.maxSubscribersPerThread) {
        throw new CommentStreamCapacityError(
          "Too many clients watching this thread",
        );
      }

      let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
      const current = subscription;
      const onAbort = (): void => {
        if (!controller) return;
        const abortedController = controller;
        removeSubscriber(current, abortedController);
        controller = undefined;
        abortedController.close();
      };
      const close = (): void => {
        if (!controller) return;
        removeSubscriber(current, controller);
        controller = undefined;
        signal?.removeEventListener("abort", onAbort);
      };

      return new ReadableStream<Uint8Array>({
        start(nextController) {
          controller = nextController;
          current.subscribers.add(nextController);
          subscriberCount += 1;
          nextController.enqueue(
            encodeSse(
              { thread: current.threadUri },
              { event: "ready", retry: 3_000 },
            ),
          );
          if (!heartbeatTimer) {
            heartbeatTimer = setInterval(
              broadcastHeartbeat,
              config.heartbeatMs,
            );
          }
          if (signal?.aborted) {
            onAbort();
            return;
          }
          signal?.addEventListener("abort", onAbort, { once: true });
          if (!socket) connect();
          else if (isNewThread) {
            updateUpstreamOptions();
            if (socketOpen) {
              nextController.enqueue(
                encodeSse(
                  { thread: current.threadUri, upstream: "connected" },
                  { event: "status" },
                ),
              );
            }
          } else if (socketOpen) {
            nextController.enqueue(
              encodeSse(
                { thread: current.threadUri, upstream: "connected" },
                { event: "status" },
              ),
            );
          }
        },
        cancel: close,
      });
    },
    stats: () => ({
      threads: threads.size,
      subscribers: subscriberCount,
      upstreamConnections: socket ? 1 : 0,
    }),
  };
};

export { COMMENT_SOURCE };
