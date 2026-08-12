// Registers the component's generated element types with Svelte's template
// types, so `<atproto-comments>` on the showcase page is checked like any other
// element rather than silently accepting anything.
//
// Opt-in rather than automatic: this package does not declare `svelte`, because
// it has to stay usable from a plain HTML page, and declaring it would oblige
// every consumer to install Svelte. This app already has it.
//
// A `.d.ts` on purpose: the import is types-only and never reaches runtime.
import "@svebcomponents/atproto.comments/svelte";
