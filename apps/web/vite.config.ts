import { defineConfig, type PluginOption } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import svebcomponents from "@svebcomponents/ssr/vite";

export default defineConfig({
  plugins: [
    // Cast needed only while @svebcomponents/ssr is consumed via the local
    // link: override (its Plugin type resolves against that checkout's vite
    // copy). Remove together with the override in pnpm-workspace.yaml.
    svebcomponents() as unknown as PluginOption,
    sveltekit(),
  ],
});
