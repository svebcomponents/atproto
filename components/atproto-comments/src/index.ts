import AtprotoComments from "./AtprotoComments.svelte";

export default AtprotoComments;

if (
  !customElements.get("atproto-comments") &&
  // we want to only register our custom element, if the compiler actually emitted a constructor for one
  // (check necessary for SSR-ing svelte-built web components)
  "element" in AtprotoComments
) {
  customElements.define(
    "atproto-comments",
    AtprotoComments.element as CustomElementConstructor,
  );
}
