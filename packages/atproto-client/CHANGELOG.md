# @svebcomponents/atproto.client

## 0.3.0

### Minor Changes

- 6b1769a: Remove the unused `ServiceClient.hasToken` getter.

  Nothing consumed it, and class members are never tree-shaken, so it shipped in every bundle that touched `ServiceClient`. Callers that need to know whether a session exists should use `getSession()`, which reflects whether the token is still valid rather than merely present.

  Marked minor rather than patch because it removes a member from a published class, even though the surface was almost certainly unused outside this repo.

## 0.2.0

### Minor Changes

- 10bf336: Make the hosted auth and live-update backend the component default. Add a
  public SSE endpoint backed by one multiplexed Microcosm Spacedust connection,
  event-driven thread revalidation, and same-origin cookie sessions for
  self-hosters.

## 0.1.0

### Minor Changes

- 56c9841: Publish the initial ATProto comments packages, including component-owned
  server fetching and serialized hydration through svebcomponents SSR.
