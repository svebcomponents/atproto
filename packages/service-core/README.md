# @svebcomponents/atproto.bridge

A framework-neutral ATProto OAuth and posting bridge for
`@svebcomponents/atproto.comments`. It exposes standard
`Request -> Promise<Response | undefined>` handlers that can be mounted in
SvelteKit, Astro, Hono, or another Fetch API-compatible server.

```sh
pnpm add @svebcomponents/atproto.bridge
```

```ts
import { createAtprotoCommentsService } from "@svebcomponents/atproto.bridge";

const service = createAtprotoCommentsService({
  publicUrl: "https://comments.example.com",
  sessionSecret: process.env.SESSION_SECRET!,
  keys: [process.env.OAUTH_PRIVATE_KEY!],
  stateStore,
  sessionStore,
  serviceSessionStore,
});

const response = await service.fetch(request);
```

Production deployments must use HTTPS, persistent OAuth/session stores, and
secure secret management. See the
[self-hosting documentation](https://github.com/svebcomponents/atproto/blob/main/03-oauth-service.md#self-hosting)
for the complete configuration.
