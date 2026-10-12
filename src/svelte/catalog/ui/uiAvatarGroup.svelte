<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiAvatarGroup">> = $props();
</script>

<ul class="ui ui-inline ui-plain-list" aria-label={props.label}>
  {#each props.names as name, i (i)}<li>
      <span class="ui-avatar" role="img" aria-label={name}
        >{name
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part[0])
          .join("")
          .toUpperCase()}</span
      >
    </li>{/each}
</ul>
