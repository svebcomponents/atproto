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
- ~~After merge + release: drop the `link:` overrides~~ **Done (2026-07-13)**: PR #105 merged and all `@svebcomponents/*` packages released at 0.1.0; this repo consumes them from npm (no overrides, no vite-plugin cast).

## Phase 1 — read-only `<atproto-comments>` (first shippable)

- `atproto-client`: AT-URI/bsky-URL parsing, `getPostThread` fetch, thread normalization with all edge variants, facet segmentation. Fixture-based unit tests.
- Component: states per [02-component-design.md](./02-component-design.md) (skeleton/empty/comment/tombstones/labels/depth-cap), root stats header (likes/reposts via Bluesky — the "likes shown via Bluesky" feature), "Reply on Bluesky" links, CSS custom props + parts, events.
- SSR: Tier 1 (`threadData` property) + Tier 3 (client self-fetch) working; async-SSR demo page in `apps/web`; Tier 2 (JSON child) if it falls out naturally, else Phase 2.
- `apps/web`: showcase page SSR-rendering the component against a real thread (dogfood: use the Bluesky post of one of your own blog articles).
- Publish to npm + verify the jsdelivr CDN drop-in on a plain HTML page.

**Exit criterion**: a random blog can paste two lines of HTML and get rendered comments, and a SvelteKit blog gets flash-free SSR.

### ✅ Phase 1 substantially done (2026-07-07)

- `atproto-client`: parsing, `getPostThread`, handle resolution, normalization (tombstones/truncation/labels), UTF-8 facet segmentation, sorting, URL helpers — 36 unit tests, wire types grounded against real AppView responses.
- `<atproto-comments>`: all rendering states, root stats header, Reply-on-Bluesky links, rich text, relative timestamps, custom props + parts, `atproto-comments:*` events, Tier 1 (`threadData`) + Tier 3 (self-fetch). Self-contained bundle **25.8 KB gz** (under the 40 KB budget; svebcomponents client builds now minified + svelte-deduped upstream).
- Showcase (`apps/web`): server-side prefetch of a live thread (`?thread=` override), SSR verified in adapter-node prod.
- **Verified via browser automation**: on a static/non-svelte host the SSR'd DOM is hydrated in place (same-node identity, zero client refetch — rich props travel via the new serialized-props channel in svebcomponents PR #105).
- ~~Known limitation: hydrating SvelteKit hosts re-created the element~~ **Fixed upstream (PR #105, wrapper symmetry)**: SvelteKit hosts now claim the SSR'd element — verified same-node identity + zero refetch in the adapter-node showcase. **Both halves of the exit criterion are met.**
- Still open from the Phase 1 list: npm publish (user action; `@atproto-comments` org needed), async-SSR demo page, Tier 2 JSON child.

## Phase 2 — hosted auth & posting (the killer feature)

> Reordered 2026-07-07: originally Phase 3. Posting is the differentiator (all
> prior art is read-only) and nothing in it depends on Standard.site
> discovery, which only changes where the thread URI comes from.

The big one; see [03-oauth-service.md](./03-oauth-service.md).

- `packages/service-core` + routes in `apps/web`: client metadata, jwks, start/callback, session mint/refresh/logout, `/api/reply`, SQLite stores, rate limiter.
- Component write UX: sign-in button, popup flow + postMessage handshake, composer, optimistic append, signed-in chrome.
- `atproto-client`: service API client.
- Deploy service to Fly/Railway under a real domain; staging test account e2e.
- Security pass before announcing: origin binding, token TTLs, secrets handling, rate limits (consider running the repo's /security-review here).

**Exit criterion**: stranger signs into a demo blog with their Bluesky handle and their comment appears on Bluesky.

### 🚧 Phase 2 in progress (2026-07-07)

Server side **done and running**; component write UX is the remaining piece.

- ✅ `packages/service-core`: framework-agnostic `fetch(Request) → Response` bridge — origin-bound HS256 session JWTs (BFF; ATProto tokens stay server-side), `client-metadata.json`/`jwks.json`, `oauth/start` (handle page + PDS redirect), `oauth/callback` (postMessage to the exact embedding origin), `api/session|refresh|logout|reply`. Narrow scope `atproto repo:app.bsky.feed.post?action=create`. Loopback client mode for keyless local dev. **39 tests** (token binding/expiry/revocation, reply validation, full handler flow vs. injected fake OAuth client + fake PDS).
- ✅ Mounted in `apps/web` via a `/atproto/[...path]` catch-all + `node:sqlite` stores (built-in, no native rebuild). Verified on the running adapter-node server: valid loopback metadata, correct 401/400 guards, sign-in page renders.
- ⏳ **Remaining — component write UX** (`atproto-client` service client + component: sign-in button, popup + postMessage handshake, composer with grapheme counter, optimistic append, signed-in chrome). Needs interactive OAuth against a real test account to verify end-to-end — the natural next working session.
- ⏳ Deploy to Fly/Railway under a real domain (needs an ES256 keypair for `private_key_jwt`); security pass before announcing.

Node bumped to 24 (`.nvmrc`): `@atproto/oauth-client-node` → undici 8 requires node ≥22.19; also unlocks built-in `node:sqlite`.

### ✅ Phase 2 write UX done (2026-07-22)

Component write UX is **built and merged**; the OAuth/posting bridge runs end-to-end locally.

- ✅ `atproto-client` gained a `ServiceClient` (session mint/refresh/logout + reply); the component grew a signed-out sign-in button, a COOP-safe popup + **nonce-claim** handshake (poll on focus/visibility rather than relying on `window.opener`, which cross-origin isolation blocks), a composer with an `Intl.Segmenter` grapheme counter, optimistic append, and signed-in `@handle · sign out` chrome.
- ✅ **Reply to any comment** via a modal composer dialog (not just the root); optimistic replies key off the target post's URI.
- ✅ `viewer` prop routes every outbound post/profile link through any bsky.app-scheme viewer (e.g. deer.social); default stays bsky.app.
- ✅ User-facing copy says **atmosphere**, not Bluesky; the OAuth callback tab now closes itself.
- ✅ Element registered via `defineElement` from `@svebcomponents/utils`; events emitted through `$host()`; the web app prefetches via a SvelteKit **remote function** (`thread.remote.ts`) awaited during async SSR — the manual async-wrapper flag is gone (svebcomponents auto-detects it).
- ⏳ Still open: interactive OAuth against a real test account for a full e2e pass, deploy the bridge to a public domain, and a security review — all prerequisites for announcing.

## Phase 3 — Standard.site discovery

- `atproto-client`: DID→PDS resolution, `com.atproto.repo.getRecord`, `site.standard.document` parsing → `bskyPostRef`.
- `components/standard-site-comments`: link discovery, delegation to `<atproto-comments>`, SSR caveats documented (explicit `document-link` for SSR).
- Tier 2 preloaded-JSON channel finalized (matters most for the SSG audience this phase targets).
- Dogfood on your own blog (theosteiner.de publishes Standard.site records? if not, that's its own fun side quest).

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
