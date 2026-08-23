export interface PageProps {
  kind: "sign-in" | "callback" | "message";
  title: string;
  heading?: string;
  clientName?: string;
  brandName?: string;
  showBrand?: boolean;
  brandLogoUrl?: string;
  brandHomeUrl?: string;
  accent?: string;
  actionUrl?: string;
  origin?: string;
  claim?: string;
  returnTo?: string;
  privacyUrl?: string;
  supportUrl?: string;
  productUrl?: string;
  error?: string;
  callbackPayload?: string;
  message?: string;
}
