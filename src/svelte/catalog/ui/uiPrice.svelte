<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiPrice">> = $props();
</script>

<span class="ui ui-price"
  ><strong>{props.currency} {props.amount}</strong>{#if props.period}<small>
      / {props.period}</small
    >{/if}</span
>
