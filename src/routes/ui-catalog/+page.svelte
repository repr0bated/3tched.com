<script lang="ts">
  import { resolve } from "$app/paths";
  import UiCatalogPreview from "../../svelte/UiCatalogPreview.svelte";
  import "../../styles.css";
  const resolvePath = resolve as unknown as (path: string) => string;
</script>

<svelte:head>
  <title>100 UI elements · 3tched</title>
  <meta
    name="description"
    content="Approved local Svelte components for JSON Render, with examples and prop contracts."
  />
</svelte:head>

<UiCatalogPreview homeHref={resolvePath("/")} />
