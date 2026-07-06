# atproto-comments

> [!WARNING]
> Pre-alpha: planning + scaffolding stage.

Drop-in Bluesky/ATProto comments for any blog, built as SSR-able web components with [svebcomponents](https://svebcomponents.dev). Readers sign in with their ATProto account; comments live in the social web, not in our database.

## Planning docs

- [00-overview.md](./00-overview.md) — executive summary & decisions
- [01-architecture.md](./01-architecture.md) — system architecture & SSR design
- [02-component-design.md](./02-component-design.md) — component APIs
- [03-oauth-service.md](./03-oauth-service.md) — hosted auth/posting bridge & self-hosting
- [04-roadmap.md](./04-roadmap.md) — phases & open questions

## Workspace

```
apps/web                    showcase site + hosted OAuth/posting service (SvelteKit)
components/atproto-comments <atproto-comments> web component
packages/atproto-client     isomorphic ATProto read utilities + service client
configs/*                   shared eslint/prettier/tsconfig presets
```

## Development

```bash
pnpm install
pnpm dev      # turbo watch dev
pnpm build
pnpm test
```
