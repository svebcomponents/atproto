import config from "@svebcomponents/eslint-config/svelte";

export default [
  // adapter-node emits the server bundle to ./build
  { ignores: ["build/"] },
  ...config,
];
