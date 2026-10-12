import outlines from "../../../references/operation-dashboard-ui-07/outlines.json";

interface LegacyOutline {
  label: string;
  section: string | null;
  headings: string[];
  tabs: string[];
  fields: string[];
  columns: string[];
  texts: string[];
}

const pages = outlines as Record<string, LegacyOutline>;

/** What the old design's page for a menu id contained, as one line of reference text. */
export function legacyOutline(id: string): string | null {
  const page = pages[id];
  if (!page) return null;
  const parts = [
    page.headings.length ? `sections ${page.headings.join(", ")}` : "",
    page.tabs.length ? `tabs ${page.tabs.join(", ")}` : "",
    page.fields.length ? `fields ${page.fields.join(", ")}` : "",
    page.columns.length ? `table columns ${page.columns.join(", ")}` : "",
    page.texts.length ? `text ${page.texts.map((text) => `"${text}"`).join(", ")}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join("; ") : null;
}
