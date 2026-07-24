<!-- svebcomponents:auto-options-ignore -->
<script lang="ts">
  import type { Component } from "svelte";

  interface PropDefinition {
    attribute?: string;
    reflect?: boolean;
    type?: "Array" | "Boolean" | "Number" | "Object" | "String";
  }

  interface ReflectingHost {
    $$svebReflect: (
      prop: string,
      value: unknown,
      propDefinition: PropDefinition,
    ) => void;
  }

  interface Props {
    __component: Component<Record<string, unknown>>;
    __host?: ReflectingHost | undefined;
    __propDefinitions?: Record<string, PropDefinition>;
    __initialProps?: Record<string, unknown>;
  }

  // eslint-disable-next-line svelte/no-unused-svelte-ignore -- emitted by the custom-element build, not svelte-check.
  // svelte-ignore custom_element_props_identifier
  const props: Props = $props();
  // svelte-ignore state_referenced_locally
  const UserComponent = props.__component;
  // svelte-ignore state_referenced_locally
  const reflectingHost = props.__host;
  // svelte-ignore state_referenced_locally
  const propDefinitions = props.__propDefinitions ?? {};

  // These values are intentionally snapshots. Later custom-element property
  // updates flow through setProps().
  // svelte-ignore state_referenced_locally
  const componentProps: Record<string, unknown> = $state({
    ...(props.__initialProps ?? {}),
  });
  const hostProp = reflectingHost ? { $$host: reflectingHost } : {};

  export function setProps(next: Record<string, unknown>): void {
    Object.assign(componentProps, next);
  }

  $effect(() => {
    if (!reflectingHost) return;
    for (const key of Object.keys(propDefinitions)) {
      const propDefinition = propDefinitions[key];
      if (!propDefinition?.reflect) continue;
      reflectingHost.$$svebReflect(key, componentProps[key], propDefinition);
    }
  });
</script>

<UserComponent {...componentProps} {...hostProp} />
