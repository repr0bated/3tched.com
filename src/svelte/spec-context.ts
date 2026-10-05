import { getContext, setContext } from "svelte";
import type { Spec } from "@json-render/core";
import type { ComponentRegistry } from "@json-render/svelte";
const key = Symbol("canvas-spec");
export function provideSpec(readSpec: () => Spec, registry: ComponentRegistry) {
  setContext(key, { readSpec, registry });
}
export function getSpec() {
  return getContext<{ readSpec: () => Spec; registry: ComponentRegistry }>(key);
}
