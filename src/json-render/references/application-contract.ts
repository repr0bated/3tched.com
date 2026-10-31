import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/svelte/schema";
import { z } from "zod";
import profile from "../../../references/application-profile.json";

/** Authored here as data, consumed by UI and exported verbatim for backend sealing. */
export const applicationProfile = profile;
export const applicationCatalog = defineCatalog(schema, {
  components: Object.fromEntries(profile.components.map(component => [component.name, {
    props: z.fromJSONSchema(component.props_schema),
    slots: component.slots,
    events: component.events,
    description: component.description,
  }])),
  actions: Object.fromEntries(profile.actions.map(action => [action.name, {
    params: z.fromJSONSchema(action.params_schema),
    description: action.description,
  }])),
});
