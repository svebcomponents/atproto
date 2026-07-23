// self-registers the atproto-comments SSR renderer with ElementRendererRegistry
import "@svebcomponents/atproto.comments/ssr";
import type { Handle } from "@sveltejs/kit";

export const handle: Handle = async ({ event, resolve }) => {
  return await resolve(event);
};
