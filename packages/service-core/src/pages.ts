import { render } from "svelte/server";

import Page from "./Page.svelte";
import type { PageProps } from "./pageTypes.js";

const document = (props: PageProps): string => {
  const { body, head } = render(Page, { props });
  return `<!doctype html><html lang="en"><head>${head}</head><body>${body}</body></html>`;
};

/** Values supplied to a custom server-side sign-in page renderer. */
export interface SignInPageRenderProps {
  /** OAuth client identity; presentation can use brandName instead. */
  clientName: string;
  /** Browser document title. */
  documentTitle: string;
  /** Main visible heading. */
  title: string;
  brandName: string;
  /** Whether the default renderer should show the brand header. */
  showBrand: boolean;
  brandLogoUrl?: string;
  brandHomeUrl?: string;
  accent?: string;
  /** GET form action owned by the bridge. */
  actionUrl: string;
  /** Embedding origin; custom forms must preserve it in a hidden input. */
  origin: string;
  /** claim nonce the opener polls with — must survive the form submission */
  claim?: string;
  /** no-JS redirect flow: page to bounce back to after sign-in — must survive the form submission */
  returnTo?: string;
  privacyUrl?: string;
  supportUrl?: string;
  /** Legacy hosted-project link; the default renderer uses it for its pitch. */
  productUrl?: string;
  error?: string;
}

export type SignInPageRenderer = (
  props: Readonly<SignInPageRenderProps>,
) => string | Promise<string>;

/** Default Svelte SSR handle-input page. */
export const signInPage = ({
  clientName,
  documentTitle,
  title,
  brandName,
  showBrand,
  brandLogoUrl,
  brandHomeUrl,
  accent,
  actionUrl,
  origin,
  claim,
  returnTo,
  privacyUrl,
  supportUrl,
  productUrl,
  error,
}: SignInPageRenderProps): string =>
  document({
    kind: "sign-in",
    title: documentTitle,
    heading: title,
    clientName,
    brandName,
    showBrand,
    ...(brandLogoUrl ? { brandLogoUrl } : {}),
    ...(brandHomeUrl ? { brandHomeUrl } : {}),
    ...(accent ? { accent } : {}),
    actionUrl,
    origin,
    ...(claim ? { claim } : {}),
    ...(returnTo ? { returnTo } : {}),
    ...(privacyUrl ? { privacyUrl } : {}),
    ...(supportUrl ? { supportUrl } : {}),
    ...(productUrl ? { productUrl } : {}),
    ...(error ? { error } : {}),
  });

/**
 * Callback landing page: posts the freshly minted session to the opener with
 * an exact targetOrigin (the origin the token is bound to), then closes.
 */
export const callbackPage = ({
  origin,
  payload,
}: {
  origin: string;
  payload: Record<string, unknown>;
}): string =>
  document({
    kind: "callback",
    title: "Signed in",
    origin,
    callbackPayload: JSON.stringify({
      type: "atproto-comments:session",
      ...payload,
    }).replaceAll("<", "\\u003C"),
  });

export const errorPage = (message: string): string =>
  document({ kind: "message", title: "Something went wrong", message });

/** shown after a no-JS form submission succeeds with no return url to bounce back to */
export const successPage = (): string =>
  document({ kind: "message", title: "Done" });
