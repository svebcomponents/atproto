import { defineElement } from "@svebcomponents/utils";

import AtprotoComments from "./AtprotoComments.svelte";

export default AtprotoComments;
// svelte auto-defines when the tag is declared in <svelte:options>; this is
// the guarded fallback for environments where that module-scope define did
// not (or must not) run
defineElement("atproto-comments", AtprotoComments);
