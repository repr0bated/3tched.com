import { dashboardReferences } from "./dashboard-examples";
import { canvasCatalog } from "./canvas-contract";
export const referenceBundle = {
  format: "3tched.dashboard-reference.v1",
  usage: "Static examples and illustrative data; pages are compositions, not catalog elements.",
  catalogPrompt: canvasCatalog.prompt(),
  catalogSchema: canvasCatalog.jsonSchema(),
  examples: dashboardReferences.map(({ id, label, placeholder, sourcePaths, spec }) => ({ id, label, placeholder, sourcePaths, spec })),
};
