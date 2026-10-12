<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props, emit }: BaseComponentProps<UiProps<"uiTextarea">> = $props();
</script>

<label class="ui ui-field"
  ><span>{props.label}</span><textarea
    rows={props.rows ?? 4}
    value={props.initialValue ?? ""}
    disabled={props.disabled}
    oninput={() => emit("change")}></textarea></label
>
