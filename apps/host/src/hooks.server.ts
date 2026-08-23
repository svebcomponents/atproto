import type { Handle } from "@sveltejs/kit";

let registration: Promise<unknown> | undefined;

const ensureAtprotoCommentsRenderer = (): Promise<unknown> => {
  registration ??= import("@svebcomponents/atproto.comments/ssr").catch(
    (error) => {
      // Don't cache a rejection: a transient failure at startup would
      // otherwise poison every future request until process restart.
      registration = undefined;
      throw error;
    },
  );
  return registration;
};

export const handle: Handle = async ({ event, resolve }) => {
  // Register lazily so adapter-node can finish initializing before the
  // component package's guarded client import reaches its top-level await.
  await ensureAtprotoCommentsRenderer();
  return await resolve(event);
};
