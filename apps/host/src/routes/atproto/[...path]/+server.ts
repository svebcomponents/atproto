import type { RequestHandler } from "./$types";
import { getService } from "$lib/server/service.js";

// Delegates every /atproto/* request to the framework-agnostic bridge. The
// service returns `undefined` only for paths outside its base — which can't
// happen here since this route already scopes to /atproto — so a miss is a
// genuine 404 from the service's own router.
const handle: RequestHandler = async ({ request }) => {
  const response = await getService().fetch(request);
  return response ?? new Response("Not found", { status: 404 });
};

export const GET = handle;
export const POST = handle;
export const OPTIONS = handle;
