import type { ParamMatcher } from "@sveltejs/kit";

/**
 * Matches a jsDelivr-acceptable version specifier: an exact semver version
 * (optionally with prerelease/build suffixes) or `latest`.
 *
 * `/cdn@<version>` redirects to
 * `cdn.jsdelivr.net/npm/@svebcomponents/atproto.comments@<version>`, so the
 * parameter is allowlisted instead of forwarded verbatim — otherwise anyone
 * can mint `..%2F`-style redirects to arbitrary jsDelivr paths wearing this
 * domain. Range specifiers (`^1.0.0`) are intentionally not matched; embeds
 * should pin.
 */
export const match: ParamMatcher = (param) => {
  return /^(?:\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?|latest)$/.test(
    param,
  );
};
