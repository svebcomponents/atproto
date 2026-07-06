// add web component shims
import { ElementRendererRegistry } from "@svebcomponents/ssr";
import AtprotoCommentsRenderer from "atproto-comments/ssr";
import type { Handle } from "@sveltejs/kit";

ElementRendererRegistry.set("atproto-comments", AtprotoCommentsRenderer);

export const handle: Handle = async ({ event, resolve }) => {
  return await resolve(event);
};
