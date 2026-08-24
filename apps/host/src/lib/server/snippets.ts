/**
 * The code samples printed on the marketing page, highlighted once at startup.
 *
 * The samples are constants, so there is nothing to recompute per request —
 * importing this module does the work. Only the tokens are rendered, never
 * Shiki's own <pre> wrapper: the page keeps its own markup so the component's
 * scoped styles still reach it, and so the hero's copy button can go on reading
 * the snippet back out of the DOM as plain text.
 */
import { createHighlighterCore, type ThemedToken } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";
import html from "shiki/langs/html.mjs";
import javascript from "shiki/langs/javascript.mjs";
import shellscript from "shiki/langs/shellscript.mjs";

type Lang = "html" | "javascript" | "shellscript";
type Segment = { lang: Lang; code: string };

/* A Shiki theme is plain data, so the page keeps its own palette rather than
   importing someone else's scheme. These are the dark-panel colors from the
   :root block in routes/+page.svelte; change one and change the other. */
const FG = "#eef2fb"; // --dark-text
const KEYWORD = "#b99bfa"; // tags, CSS selectors, JS keywords, shell commands
const NAME = "#7cc3ff"; // attributes, CSS properties, JS keys and callees
const VALUE = "#7ddccb"; // strings, CSS values
const MUTED = "#8d9bb8"; // --dark-meta

const THEME = "svebcomponents-dark";

const highlighter = await createHighlighterCore({
  // css comes along with html, which embeds it.
  langs: [html, javascript, shellscript],
  themes: [
    {
      name: THEME,
      type: "dark",
      colors: { "editor.foreground": FG, "editor.background": "#141b2b" },
      settings: [
        { scope: ["comment"], settings: { foreground: MUTED } },
        {
          scope: [
            "entity.name.tag", // HTML tags, and CSS element selectors
            "keyword",
            "storage.type",
            "entity.name.command", // the verb in a shell line
          ],
          settings: { foreground: KEYWORD },
        },
        {
          scope: [
            "entity.other.attribute-name",
            "support.type.property-name", // CSS properties
            "variable.css", // CSS custom properties
            "meta.object-literal.key",
            "entity.name.function",
          ],
          settings: { foreground: NAME },
        },
        {
          scope: [
            "string",
            "constant.numeric",
            "constant.other.color",
            "keyword.other.unit", // the px in 4px, part of the value
            "support.constant", // font names and other bare CSS values
          ],
          settings: { foreground: VALUE },
        },
        // Bare shell arguments are strings to the grammar but read as prose,
        // and a key's colon is separator rather than name.
        {
          scope: [
            "string.unquoted.argument",
            "punctuation.separator.key-value",
          ],
          settings: { foreground: FG },
        },
      ],
    },
  ],
  engine: createOnigurumaEngine(import("shiki/wasm")),
});

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/* The hero block wraps instead of scrolling, and its URLs are long enough to
   deserve a say in where they break. <wbr> leaves textContent untouched, so
   what the copy button lifts out of the DOM is unaffected. */
function withBreakPoints(content: string): string {
  if (content.length <= 24 || /\s/.test(content)) return content;
  return content.replaceAll(/\/(?!\/)/g, "/<wbr>");
}

function renderToken(token: ThemedToken): string {
  const content = withBreakPoints(escapeHtml(token.content));
  // Plain text carries no span of its own. Shiki hands hex back upper-cased,
  // so this cannot be a straight comparison against the palette above.
  const colored = token.color && token.color.toLowerCase() !== FG;
  return colored
    ? `<span style="color:${token.color}">${content}</span>`
    : content;
}

/**
 * Renders the body of one <code> element. Multiple segments let a single block
 * mix languages — the install step is a shell line followed by an import — with
 * a blank line between them, which is how the samples already read.
 */
function highlight(...segments: Segment[]): string {
  return segments
    .map(({ lang, code }) =>
      highlighter
        .codeToTokens(code, { lang, theme: THEME })
        .tokens.map((line) => line.map(renderToken).join(""))
        .join("\n"),
    )
    .join("\n\n");
}

export const snippets = {
  hero: highlight({
    lang: "html",
    code: `<script type="module"
  src="https://atproto.svebcomponents.dev/cdn">
</script>

<atproto-comments
  thread="https://bsky.app/profile/theosteiner.de/post/3mreni33v7k2c"
></atproto-comments>

<style>
  atproto-comments {
    --atproto-comments-accent: #2563eb;
    --atproto-comments-radius: 4px;
    font-family: ui-monospace, monospace;
  }
</style>`,
  }),

  quickstart: highlight(
    { lang: "shellscript", code: `pnpm add @svebcomponents/atproto.comments` },
    { lang: "javascript", code: `import "@svebcomponents/atproto.comments";` },
  ),

  markup: highlight({
    lang: "html",
    code: `<atproto-comments
  thread="https://bsky.app/profile/bsky.app/post/…"
></atproto-comments>`,
  }),

  selfHostedMarkup: highlight({
    lang: "html",
    code: `<atproto-comments
  thread="at://did:plc:…/app.bsky.feed.post/…"
  service="/atproto"
></atproto-comments>`,
  }),

  selfHostedConfig: highlight({
    lang: "javascript",
    code: `createAtprotoCommentsService({
  publicUrl: "https://your.blog",
  basePath: "/atproto",
  sessionMode: "cookie",
  sessionSecret,
  keys,
  stateStore,
  sessionStore,
  serviceSessionStore,
});`,
  }),
};
