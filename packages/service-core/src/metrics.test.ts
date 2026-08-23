import { describe, expect, it, vi } from "vitest";

import {
  createMemoryMetricsStore,
  createMetricsRecorder,
  utcDay,
  type MetricsStore,
} from "./metrics.js";

const ORIGIN = "https://blog.example";
const OTHER = "https://other.example";

describe("utcDay", () => {
  it("is day-granular and UTC", () => {
    expect(utcDay(new Date("2026-08-22T23:59:59.999Z"))).toBe("2026-08-22");
    expect(utcDay(new Date("2026-08-23T00:00:00.000Z"))).toBe("2026-08-23");
  });
});

describe("memory metrics store", () => {
  it("accumulates rather than replaces", async () => {
    const store = createMemoryMetricsStore();
    await store.add(ORIGIN, "2026-08-22", { reply: 2 });
    await store.add(ORIGIN, "2026-08-22", { reply: 3, signIn: 1 });
    expect(await store.totals()).toMatchObject({
      sites: 1,
      replies: 5,
      signIns: 1,
      since: "2026-08-22",
    });
  });

  it("counts distinct sites and the earliest day", async () => {
    const store = createMemoryMetricsStore();
    await store.add(ORIGIN, "2026-08-22", { signIn: 1 });
    await store.add(OTHER, "2026-08-20", { signIn: 1 });
    await store.add(OTHER, "2026-08-21", { signIn: 1 });
    expect(await store.totals()).toMatchObject({
      sites: 2,
      signIns: 3,
      since: "2026-08-20",
    });
  });

  it("reports zeroes before anything is recorded", async () => {
    expect(await createMemoryMetricsStore().totals()).toEqual({
      sites: 0,
      signIns: 0,
      replies: 0,
      reactions: 0,
      streamConnects: 0,
      rateLimited: 0,
    });
  });
});

describe("metrics recorder", () => {
  it("buffers and only writes through on flush", async () => {
    const store = createMemoryMetricsStore();
    const add = vi.spyOn(store, "add");
    const recorder = createMetricsRecorder({ store, flushIntervalMs: 60_000 });

    recorder.record(ORIGIN, "reply");
    recorder.record(ORIGIN, "reply");
    expect(add).not.toHaveBeenCalled();

    await recorder.flush();
    expect(add).toHaveBeenCalledTimes(1);
    expect(await store.totals()).toMatchObject({ sites: 1, replies: 2 });
  });

  it("flushes before reporting totals", async () => {
    const recorder = createMetricsRecorder({
      store: createMemoryMetricsStore(),
    });
    recorder.record(ORIGIN, "signIn");
    expect(await recorder.totals()).toMatchObject({ sites: 1, signIns: 1 });
  });

  it("writes through once the flush interval has elapsed", async () => {
    let clock = 1_000;
    const store = createMemoryMetricsStore();
    const recorder = createMetricsRecorder({
      store,
      flushIntervalMs: 1_000,
      now: () => clock,
    });

    recorder.record(ORIGIN, "reply");
    clock += 2_000;
    recorder.record(ORIGIN, "reply");
    await recorder.flush();

    expect(await store.totals()).toMatchObject({ replies: 2 });
  });

  it("coalesces concurrent flushes into a single write", async () => {
    // two overlapping flush() calls must share one write-through, or deltas
    // buffered between them can be counted twice
    const store = createMemoryMetricsStore();
    const add = vi.spyOn(store, "add");
    const recorder = createMetricsRecorder({ store, flushIntervalMs: 60_000 });
    recorder.record(ORIGIN, "reply");

    await Promise.all([recorder.flush(), recorder.flush()]);
    expect(add).toHaveBeenCalledTimes(1);
  });

  it("attributes events with no origin without dropping them", async () => {
    const recorder = createMetricsRecorder({
      store: createMemoryMetricsStore(),
    });
    recorder.record(null, "streamConnect");
    recorder.record(undefined, "streamConnect");
    expect(await recorder.totals()).toMatchObject({
      streamConnects: 2,
      sites: 1,
    });
  });

  it("never throws into the request path when the store fails", async () => {
    const failing: MetricsStore = {
      add: vi.fn(async () => {
        throw new Error("disk on fire");
      }),
      totals: vi.fn(async () => ({
        sites: 0,
        signIns: 0,
        replies: 0,
        reactions: 0,
        streamConnects: 0,
        rateLimited: 0,
      })),
    };
    const recorder = createMetricsRecorder({
      store: failing,
      flushIntervalMs: 0,
    });

    expect(() => recorder.record(ORIGIN, "reply")).not.toThrow();
    await expect(recorder.totals()).resolves.toMatchObject({ sites: 0 });
  });

  it("keeps no per-reader detail — only origin, day, and counts", async () => {
    const seen: unknown[] = [];
    const store: MetricsStore = {
      add: async (origin, day, counts) => {
        seen.push({ origin, day, counts });
      },
      totals: async () => ({
        sites: 0,
        signIns: 0,
        replies: 0,
        reactions: 0,
        streamConnects: 0,
        rateLimited: 0,
      }),
    };
    const recorder = createMetricsRecorder({ store });
    recorder.record(ORIGIN, "reply");
    await recorder.flush();

    expect(seen).toEqual([
      { origin: ORIGIN, day: utcDay(), counts: { reply: 1 } },
    ]);
  });
});
