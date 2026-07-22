# Releasing

This repository publishes through npm trusted publishing. GitHub Actions uses
short-lived OIDC credentials; no npm access token belongs in repository or
organization secrets.

## Initial package bootstrap

npm can only attach a trusted publisher to a package that already exists.
Before merging the initial Changesets release PR, publish the current `0.0.0`
packages once from an npm CLI session protected by 2FA. This claims the package
names without using an automation token:

```sh
pnpm build
pnpm lint:packages
pnpm --filter @svebcomponents/atproto.client publish --access public
pnpm --filter @svebcomponents/atproto.bridge publish --access public
pnpm --filter @svebcomponents/atproto.comments publish --access public
```

Configure the trusted publishers immediately afterward. Once they are in place,
merge the initial release PR; the workflow will publish `0.1.0` through OIDC.

## Configure trusted publishing

For each package on npm, open **Settings → Trusted Publisher**, choose GitHub
Actions, and enter:

- Organization: `svebcomponents`
- Repository: `atproto`
- Workflow filename: `release.yml`
- Environment: leave empty
- Allowed action: `npm publish`

The repository must remain public for npm provenance attestations. After
confirming OIDC publishing works, set each package's publishing access to
**Require two-factor authentication and disallow tokens**.

## Routine releases

Add a changeset with `pnpm changeset` in each feature pull request. Changesets
maintains a **Release packages** pull request. Merging that pull request runs
the release workflow, which builds, validates, and publishes through OIDC.
