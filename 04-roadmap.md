# Roadmap & Open Questions

Date: 2026-07-06

## Step 0 — scaffold & housekeeping (before any feature work)

1. `pnpx degit svebcomponents/template` into this repo; `git init`.
2. **Bump the dependency catalog** (template is on mid-2025 versions): svelte → latest 5.x (needed for the async-SSR path `@svebcomponents/ssr` supports), vite → 7.x, @sveltejs/kit → latest, svelte-check/eslint/prettier/turbo accordingly. Check npm for latest `@svebcomponents/build` + `@svebcomponents/ssr` (template catalog says 0.0.9/0.0.8; the local monorepo working copy shows 0.0.8/0.0.7 in package.json — confirm what's actually published, and whether anything needs releasing from the svebcomponents repo first).
3. Rename `apps/svelte-kit` → `apps/web`; swap `adapter-auto` → `adapter-node`.
4. Add `packages/` to the workspace; scaffold `packages/atproto-client`.
5. Rename example component → `components/atproto-comments`; verify the full loop still works: `pnpm build` → SSR'd page shows declarative shadow DOM → client upgrade works.
6. Renovate config already ships in the template — keep it so deps don't rot again.

Deliverable: green build/check/lint/test on the renamed skeleton. **This step also doubles as dogfooding svebcomponents' template DX — file issues upstream for every rough edge.**

### ✅ Step 0 done (2026-07-06)

Scaffold is committed and the full loop (dev SSR + adapter-node production SSR with declarative shadow DOM) is verified. Version reality: published latest is `@svebcomponents/build@0.0.9` / `ssr@0.0.8`, which matches local svebcomponents main — nothing needs releasing. Naming: **`atproto-comments` is unclaimed on npm** and is now the component package name; support packages use the `@atproto-comments/*` scope (org still to be created on npm).

Upstream issues found while scaffolding (details in [01-architecture.md](./01-architecture.md#findings-from-the-scaffold-2026-07-06-verified-against-real-builds)):

1. ✅ **Fixed** (svebcomponents branch `fix/ssr-svelte-536-and-shim-ordering`): sync SSR wrapper broken with svelte ≥5.36 thenable render results.
2. ✅ **Fixed** (same branch): static client-build imports in SSR'd pages crashed `adapter-node` builds via rollup chunk-order vs. the DOM-shim side effect.
3. Still open — template niceties: shared eslint/prettier configs don't ignore `build/` (adapter-node output); template `turbo.json` `outputs` misses kit's `build/`/`.svelte-kit/output/`; app has a `test:e2e` script but no playwright dependency.

Follow-ups tied to the fixes:

- All three fixes are in **[svebcomponents PR #103](https://github.com/svebcomponents/svebcomponents/pull/103)** (sync rendering with svelte ≥5.36, chunk-order-safe SSR entries, parallel-build clean race) including sync-wrapper e2e coverage (verified to fail pre-fix) and changesets.
- After merge + release: **drop the `link:` overrides** in this repo's `pnpm-workspace.yaml` and the cast in `apps/web/vite.config.ts`.

## Phase 1 — read-only `<atproto-comments>` (first shippable)

- `atproto-client`: AT-URI/bsky-URL parsing, `getPostThread` fetch, thread normalization with all edge variants, facet segmentation. Fixture-based unit tests.
- Component: states per [02-component-design.md](./02-component-design.md) (skeleton/empty/comment/tombstones/labels/depth-cap), root stats header (likes/reposts via Bluesky — the "likes shown via Bluesky" feature), "Reply on Bluesky" links, CSS custom props + parts, events.
- SSR: Tier 1 (`threadData` property) + Tier 3 (client self-fetch) working; async-SSR demo page in `apps/web`; Tier 2 (JSON child) if it falls out naturally, else Phase 2.
- `apps/web`: showcase page SSR-rendering the component against a real thread (dogfood: use the Bluesky post of one of your own blog articles).
- Publish to npm + verify the jsdelivr CDN drop-in on a plain HTML page.

**Exit criterion**: a random blog can paste two lines of HTML and get rendered comments, and a SvelteKit blog gets flash-free SSR.

## Phase 2 — Standard.site discovery

- `atproto-client`: DID→PDS resolution, `com.atproto.repo.getRecord`, `site.standard.document` parsing → `bskyPostRef`.
- `components/standard-site-comments`: link discovery, delegation to `<atproto-comments>`, SSR caveats documented (explicit `document-link` for SSR).
- Tier 2 preloaded-JSON channel finalized (matters most for the SSG audience this phase targets).
- Dogfood on your own blog (theosteiner.de publishes Standard.site records? if not, that's its own fun side quest).

## Phase 3 — hosted auth & posting

The big one; see [03-oauth-service.md](./03-oauth-service.md).

- `packages/service-core` + routes in `apps/web`: client metadata, jwks, start/callback, session mint/refresh/logout, `/api/reply`, SQLite stores, rate limiter.
- Component write UX: sign-in button, popup flow + postMessage handshake, composer, optimistic append, signed-in chrome.
- `atproto-client`: service API client.
- Deploy service to Fly/Railway under a real domain; staging test account e2e.
- Security pass before announcing: origin binding, token TTLs, secrets handling, rate limits (consider running the repo's /security-review here).

**Exit criterion**: stranger signs into a demo blog with their Bluesky handle and their comment appears on Bluesky.

## Phase 4 — site-owner controls (product maturation, demand-driven)

Site registration + origin allowlists, moderation prefs (hide-by-label defaults, blocklists), per-site rate limits, optional thread-read caching/proxy (only if AppView rate limits bite), minimal dashboard. Prioritize by real usage; don't build speculatively.

## Phase 5 — `<standard-site-post>`

Article rendering from `site.standard.document`. Decide `content` union coverage when the ecosystem's dominant `$type`s are clearer.

## Open questions & recommendations

| Question | Recommendation |
| --- | --- |
| npm scope / naming | New scope (e.g. `@atproto-comments/*` or a product name); components are a product, not part of `@svebcomponents/*` infra. **Check name availability early.** Keep `<atproto-comments>` as the tag. `<bsky-comments>` at most as a documented alias — two registered tags for one element is doc noise; skip unless there's SEO value. |
| AppView vs direct repo reads | AppView for threads (aggregation is the whole point — you can't assemble a thread from one repo); direct PDS reads only for Standard.site records. Revisit only if AppView dependence becomes a values problem. |
| Minimal OAuth scope | `atproto` + `repo:app.bsky.feed.post?action=create`; try dropping the `getProfile` rpc scope by reading profiles from the public AppView. Adopt a permission set when a fitting one exists. |
| Reply ordering | Default `oldest` (blog-native reading), `sort` attribute for the rest. |
| Quote posts of the root | Out of scope for the thread list v1; a "mentions elsewhere" section later. |
| Service caches thread reads? | Not in MVP (client → public AppView directly). Add proxy caching in Phase 4 only if rate limits or privacy concerns demand it. |
| Custom domains for auth callbacks | No — one canonical service origin keeps the OAuth client_id story simple. Self-hosters run the whole service (it's OSS) and become their own client. |
| Mirror Bluesky moderation by default? | Respect labels with `collapse` default + site-owner override in Phase 4. Full label-service subscription mirroring is overkill for v1. |
| Where do sessions live client-side | localStorage per (service, origin), short-TTL JWT — rationale in [03-oauth-service.md](./03-oauth-service.md). |
| Standard.site rendering in initial product | No — Phase 5. Comments are the sharp wedge. |

## Risks

- **Svelte async SSR is still experimental** — the async render path may shift under us. Mitigation: Tier 1/2 preloading are the primary SSR paths; async SSR is a demo/differentiator, not a dependency.
- **ATProto OAuth spec velocity** (scopes → permission sets migration). Mitigation: `@atproto/oauth-client-node` + thin `service-core` abstraction; scope strings in config, not code.
- **svebcomponents alpha status**: we're building on our own alpha tooling — expect to fix upstream bugs as they surface. That's partly the point (dogfooding), but budget time for it.
- **Abuse of the hosted service**: mitigations designed (reply-only, rate limits, origin binding, revocation); the real answer is Phase 4 registration if it grows.
- **Bundle size** creeping up with rich text/moderation features — set a CI size budget early (e.g. <40KB gz for the CDN bundle).
