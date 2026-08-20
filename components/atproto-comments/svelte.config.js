// Read only by `svelte-check`. `@svebcomponents/build` forces
// `customElement: true` on the browser target itself (and `false` on the
// server one), so this file does not affect the build — without it the
// checker just flags `<svelte:options customElement>` as missing its
// compile option.
/** @type {{ compilerOptions: import("svelte/compiler").CompileOptions }} */
export default {
  compilerOptions: {
    customElement: true,
  },
};
