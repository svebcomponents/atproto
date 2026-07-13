import { expect, test } from "@playwright/test";

// The load-bearing guarantee of the whole SSR story: the server-rendered
// shadow DOM must be *hydrated in place* — claimed by the element, not wiped
// and re-rendered — even though this page is itself a hydrating SvelteKit
// app. This exact check (node identity across hydration) caught every
// regression class so far: the wrapper's {#if BROWSER} branch flip, the
// Server/Client anchor asymmetry, duplicated svelte runtimes, and missing
// rich-prop porting.
//
// Requires network access: the page server-fetches a live Bluesky thread.
test("SSR'd comments hydrate in place with zero client refetch", async ({
  page,
}) => {
  const appviewRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("public.api.bsky.app")) {
      appviewRequests.push(request.url());
    }
  });

  // delay the app bundle so the SSR'd shadow DOM can be stamped before any
  // JavaScript (SvelteKit's hydration or the element's) runs
  await page.route("**/_app/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });

  await page.goto("/", { waitUntil: "commit" });
  await page.waitForSelector("atproto-comments", { state: "attached" });

  const stamped = await page.evaluate(() => {
    const element = document.querySelector("atproto-comments");
    const author = element?.shadowRoot?.querySelector('a[part="author"]');
    if (!author) return false;
    author.setAttribute("data-ssr-stamp", "kept");
    return true;
  });
  expect(stamped, "SSR output must contain rendered comments pre-JS").toBe(
    true,
  );

  await page.waitForLoadState("networkidle");
  // let both hydrations (host app + custom element) settle
  await page.waitForTimeout(2000);

  const result = await page.evaluate(() => {
    const element = document.querySelector("atproto-comments");
    const shadowRoot = element?.shadowRoot;
    return {
      stampSurvived: !!shadowRoot?.querySelector(
        'a[part="author"][data-ssr-stamp]',
      ),
      authorsRendered:
        shadowRoot?.querySelectorAll('a[part="author"]').length ?? 0,
      // svelte only emits `[` bracket comments during SSR — their presence
      // after load proves the shadow content was claimed, not re-rendered
      ssrMarkersPresent: [...(shadowRoot?.childNodes ?? [])].some(
        (node) => node.nodeType === 8 && node.textContent === "[",
      ),
      // the rich-props transport element must be consumed by hydration
      transportScriptConsumed: !shadowRoot?.querySelector(
        "script[data-svebcomponents-ssr-props]",
      ),
    };
  });

  expect(result.stampSurvived, "server-rendered node must be adopted").toBe(
    true,
  );
  expect(result.authorsRendered).toBeGreaterThan(0);
  expect(result.ssrMarkersPresent).toBe(true);
  expect(result.transportScriptConsumed).toBe(true);
  expect(
    appviewRequests,
    "preloaded threadData must prevent client refetches",
  ).toHaveLength(0);
});

test("hydrated component stays reactive", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // this app configures a service, so comments carry an in-page Reply
  // button; clicking one opens the modal composer dialog with the target
  // comment's author — proof the hydrated component handles events
  const component = page.locator("atproto-comments");
  const replyButton = component
    .locator('li[part="comment"] button[part="reply-button"]')
    .first();
  await expect(replyButton).toHaveText("Reply");
  await replyButton.click();

  const dialogState = await page.evaluate(() => {
    const shadow = document.querySelector("atproto-comments")?.shadowRoot;
    const dialog = shadow?.querySelector("dialog");
    return {
      open: dialog?.open ?? false,
      modal: dialog?.matches(":modal") ?? false,
      // signed out in this test → the dialog shows the sign-in prompt
      hasSigninPrompt: Boolean(shadow?.querySelector("dialog .signin-prompt")),
    };
  });
  expect(dialogState).toEqual({
    open: true,
    modal: true,
    hasSigninPrompt: true,
  });

  // Esc closes it and the component stays healthy
  await page.keyboard.press("Escape");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .querySelector("atproto-comments")
            ?.shadowRoot?.querySelector("dialog")?.open ?? true,
      ),
    )
    .toBe(false);
});
