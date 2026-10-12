import { z } from "zod";

const short = z.string().max(400);
const label = z.string().trim().min(1).max(400);
const text = z.string().max(20_000);
const tone = z.enum(["neutral", "info", "success", "warning", "danger"]);
const fragment = z
  .string()
  .regex(/^#[a-zA-Z][a-zA-Z0-9_-]*$/)
  .max(200);
const options = z.array(label).min(1).max(100);

/** Approved offline UI primitives. No transport, credentials, HTML injection or backend actions. */
export const uiElementSchemas = {
  uiStack: {
    props: z.object({ label: short.optional() }).strict(),
    slots: ["default"],
    description: "Stack layout with nested elements.",
  },
  uiInline: {
    props: z.object({ label: short.optional() }).strict(),
    slots: ["default"],
    description: "Inline layout with nested elements.",
  },
  uiGrid: {
    props: z
      .object({
        label: short.optional(),
        columns: z.number().int().min(1).max(6).optional(),
      })
      .strict(),
    slots: ["default"],
    description: "Grid layout with nested elements.",
  },
  uiCenter: {
    props: z.object({ label: short.optional() }).strict(),
    slots: ["default"],
    description: "Center layout with nested elements.",
  },
  uiCluster: {
    props: z.object({ label: short.optional() }).strict(),
    slots: ["default"],
    description: "Cluster layout with nested elements.",
  },
  uiCard: {
    props: z.object({ label: short.optional() }).strict(),
    slots: ["default"],
    description: "Card layout with nested elements.",
  },
  uiPanel: {
    props: z.object({ label: short.optional() }).strict(),
    slots: ["default"],
    description: "Panel layout with nested elements.",
  },
  uiSection: {
    props: z.object({ label: short.optional() }).strict(),
    slots: ["default"],
    description: "Section layout with nested elements.",
  },
  uiWell: {
    props: z.object({ label: short.optional() }).strict(),
    slots: ["default"],
    description: "Well layout with nested elements.",
  },
  uiInset: {
    props: z.object({ label: short.optional() }).strict(),
    slots: ["default"],
    description: "Inset layout with nested elements.",
  },
  uiScrollArea: {
    props: z.object({ label: label }).strict(),
    slots: ["default"],
    description: "ScrollArea layout with nested elements.",
  },
  uiAspectRatio: {
    props: z
      .object({
        label: short.optional(),
        ratio: z.number().min(0.25).max(4).optional(),
      })
      .strict(),
    slots: ["default"],
    description: "AspectRatio layout with nested elements.",
  },
  uiDivider: {
    props: z.object({ label: short.optional() }).strict(),
    slots: [],
    description: "Horizontal divider with optional text.",
  },
  uiSpacer: {
    props: z
      .object({ size: z.number().int().min(0).max(128).optional() })
      .strict(),
    slots: [],
    description: "Bounded vertical spacing.",
  },
  uiFieldset: {
    props: z
      .object({ legend: label, disabled: z.boolean().optional() })
      .strict(),
    slots: ["default"],
    description: "Accessible group of nested controls.",
  },
  uiTitle: {
    props: z.object({ text: text }).strict(),
    slots: [],
    description: "Title text, escaped as plain text.",
  },
  uiSubtitle: {
    props: z.object({ text: text }).strict(),
    slots: [],
    description: "Subtitle text, escaped as plain text.",
  },
  uiParagraph: {
    props: z.object({ text: text }).strict(),
    slots: [],
    description: "Paragraph text, escaped as plain text.",
  },
  uiLead: {
    props: z.object({ text: text }).strict(),
    slots: [],
    description: "Lead text, escaped as plain text.",
  },
  uiCaption: {
    props: z.object({ text: text }).strict(),
    slots: [],
    description: "Caption text, escaped as plain text.",
  },
  uiLabel: {
    props: z.object({ text: text }).strict(),
    slots: [],
    description: "Label text, escaped as plain text.",
  },
  uiHelperText: {
    props: z.object({ text: text }).strict(),
    slots: [],
    description: "HelperText text, escaped as plain text.",
  },
  uiInlineCode: {
    props: z.object({ text: text }).strict(),
    slots: [],
    description: "InlineCode text, escaped as plain text.",
  },
  uiKeyboardKey: {
    props: z.object({ text: text }).strict(),
    slots: [],
    description: "KeyboardKey text, escaped as plain text.",
  },
  uiAddress: {
    props: z.object({ text: text }).strict(),
    slots: [],
    description: "Address text, escaped as plain text.",
  },
  uiMark: {
    props: z.object({ text: text }).strict(),
    slots: [],
    description: "Mark text, escaped as plain text.",
  },
  uiCodeBlock: {
    props: z.object({ code: text, language: short.optional() }).strict(),
    slots: [],
    description: "Escaped preformatted code with a language caption.",
  },
  uiBlockquote: {
    props: z.object({ text: text, attribution: short.optional() }).strict(),
    slots: [],
    description: "Quotation and optional attribution.",
  },
  uiAbbreviation: {
    props: z.object({ text: short, expansion: label }).strict(),
    slots: [],
    description: "Abbreviation with its full expansion.",
  },
  uiTimestamp: {
    props: z.object({ datetime: short, text: short }).strict(),
    slots: [],
    description: "Machine-readable date with explicit display text.",
  },
  uiAlert: {
    props: z.object({ title: short.optional(), message: text }).strict(),
    slots: [],
    description: "Alert with accessible live announcement.",
  },
  uiNotice: {
    props: z.object({ title: short.optional(), message: text }).strict(),
    slots: [],
    description: "Notice with accessible live announcement.",
  },
  uiSuccessMessage: {
    props: z.object({ title: short.optional(), message: text }).strict(),
    slots: [],
    description: "SuccessMessage with accessible live announcement.",
  },
  uiWarningMessage: {
    props: z.object({ title: short.optional(), message: text }).strict(),
    slots: [],
    description: "WarningMessage with accessible live announcement.",
  },
  uiErrorMessage: {
    props: z.object({ title: short.optional(), message: text }).strict(),
    slots: [],
    description: "ErrorMessage with accessible live announcement.",
  },
  uiInfoMessage: {
    props: z.object({ title: short.optional(), message: text }).strict(),
    slots: [],
    description: "InfoMessage with accessible live announcement.",
  },
  uiToast: {
    props: z.object({ title: short.optional(), message: text }).strict(),
    slots: [],
    description: "Toast with accessible live announcement.",
  },
  uiStatusBadge: {
    props: z.object({ label: label, tone: tone.optional() }).strict(),
    slots: [],
    description: "Compact status badge.",
  },
  uiStatusDot: {
    props: z.object({ label: label, tone: tone.optional() }).strict(),
    slots: [],
    description: "Status indicator with a visible text equivalent.",
  },
  uiProgress: {
    props: z
      .object({ label: label, value: z.number().min(0).max(100) })
      .strict(),
    slots: [],
    description: "Progress on a zero to one hundred scale.",
  },
  uiMeter: {
    props: z
      .object({ label: label, value: z.number().min(0).max(100) })
      .strict(),
    slots: [],
    description: "Meter on a zero to one hundred scale.",
  },
  uiSpinner: {
    props: z.object({ label: label }).strict(),
    slots: [],
    description: "Loading indicator respecting reduced motion.",
  },
  uiSkeleton: {
    props: z
      .object({
        label: label,
        lines: z.number().int().min(1).max(10).optional(),
      })
      .strict(),
    slots: [],
    description: "Static loading placeholder with accessible status.",
  },
  uiEmptyState: {
    props: z.object({ title: label, description: text.optional() }).strict(),
    slots: [],
    description: "Empty collection explanation.",
  },
  uiValidationMessage: {
    props: z.object({ message: text }).strict(),
    slots: [],
    description: "Validation feedback announcement.",
  },
  uiButton: {
    props: z
      .object({ label: label, disabled: z.boolean().optional() })
      .strict(),
    slots: [],
    events: ["press"] as const,
    description: "Action button; emits press when bound.",
  },
  uiIconButton: {
    props: z
      .object({
        label: label,
        icon: z.enum(["add", "close", "search", "settings", "more"]),
        disabled: z.boolean().optional(),
      })
      .strict(),
    slots: [],
    events: ["press"] as const,
    description: "Icon action with a required accessible label.",
  },
  uiToggleButton: {
    props: z
      .object({
        label: label,
        initialPressed: z.boolean().optional(),
        disabled: z.boolean().optional(),
      })
      .strict(),
    slots: [],
    events: ["change"] as const,
    description: "Local pressed toggle; initialPressed is used on mount.",
  },
  uiTextInput: {
    props: z
      .object({
        label: label,
        initialValue: short.optional(),
        disabled: z.boolean().optional(),
        required: z.boolean().optional(),
      })
      .strict(),
    slots: [],
    events: ["change"] as const,
    description:
      "Native text input with local browser state. Emits change; does not submit or persist.",
  },
  uiSearchInput: {
    props: z
      .object({
        label: label,
        initialValue: short.optional(),
        disabled: z.boolean().optional(),
        required: z.boolean().optional(),
      })
      .strict(),
    slots: [],
    events: ["change"] as const,
    description:
      "Native search input with local browser state. Emits change; does not submit or persist.",
  },
  uiEmailInput: {
    props: z
      .object({
        label: label,
        initialValue: short.optional(),
        disabled: z.boolean().optional(),
        required: z.boolean().optional(),
      })
      .strict(),
    slots: [],
    events: ["change"] as const,
    description:
      "Native email input with local browser state. Emits change; does not submit or persist.",
  },
  uiPasswordInput: {
    props: z
      .object({
        label: label,
        initialValue: short.optional(),
        disabled: z.boolean().optional(),
        required: z.boolean().optional(),
      })
      .strict(),
    slots: [],
    events: ["change"] as const,
    description:
      "Native password input with local browser state. Emits change; does not submit or persist.",
  },
  uiUrlInput: {
    props: z
      .object({
        label: label,
        initialValue: short.optional(),
        disabled: z.boolean().optional(),
        required: z.boolean().optional(),
      })
      .strict(),
    slots: [],
    events: ["change"] as const,
    description:
      "Native url input with local browser state. Emits change; does not submit or persist.",
  },
  uiTelInput: {
    props: z
      .object({
        label: label,
        initialValue: short.optional(),
        disabled: z.boolean().optional(),
        required: z.boolean().optional(),
      })
      .strict(),
    slots: [],
    events: ["change"] as const,
    description:
      "Native tel input with local browser state. Emits change; does not submit or persist.",
  },
  uiNumberInput: {
    props: z
      .object({
        label: label,
        initialValue: short.optional(),
        disabled: z.boolean().optional(),
        required: z.boolean().optional(),
      })
      .strict(),
    slots: [],
    events: ["change"] as const,
    description:
      "Native number input with local browser state. Emits change; does not submit or persist.",
  },
  uiDateInput: {
    props: z
      .object({
        label: label,
        initialValue: short.optional(),
        disabled: z.boolean().optional(),
        required: z.boolean().optional(),
      })
      .strict(),
    slots: [],
    events: ["change"] as const,
    description:
      "Native date input with local browser state. Emits change; does not submit or persist.",
  },
  uiTimeInput: {
    props: z
      .object({
        label: label,
        initialValue: short.optional(),
        disabled: z.boolean().optional(),
        required: z.boolean().optional(),
      })
      .strict(),
    slots: [],
    events: ["change"] as const,
    description:
      "Native time input with local browser state. Emits change; does not submit or persist.",
  },
  uiDateTimeInput: {
    props: z
      .object({
        label: label,
        initialValue: short.optional(),
        disabled: z.boolean().optional(),
        required: z.boolean().optional(),
      })
      .strict(),
    slots: [],
    events: ["change"] as const,
    description:
      "Native datetime-local input with local browser state. Emits change; does not submit or persist.",
  },
  uiMonthInput: {
    props: z
      .object({
        label: label,
        initialValue: short.optional(),
        disabled: z.boolean().optional(),
        required: z.boolean().optional(),
      })
      .strict(),
    slots: [],
    events: ["change"] as const,
    description:
      "Native month input with local browser state. Emits change; does not submit or persist.",
  },
  uiWeekInput: {
    props: z
      .object({
        label: label,
        initialValue: short.optional(),
        disabled: z.boolean().optional(),
        required: z.boolean().optional(),
      })
      .strict(),
    slots: [],
    events: ["change"] as const,
    description:
      "Native week input with local browser state. Emits change; does not submit or persist.",
  },
  uiColorInput: {
    props: z
      .object({
        label: label,
        initialValue: short.optional(),
        disabled: z.boolean().optional(),
        required: z.boolean().optional(),
      })
      .strict(),
    slots: [],
    events: ["change"] as const,
    description:
      "Native color input with local browser state. Emits change; does not submit or persist.",
  },
  uiTextarea: {
    props: z
      .object({
        label: label,
        initialValue: text.optional(),
        rows: z.number().int().min(2).max(20).optional(),
        disabled: z.boolean().optional(),
      })
      .strict(),
    slots: [],
    events: ["change"] as const,
    description: "Multiline local text input.",
  },
  uiCheckbox: {
    props: z
      .object({
        label: label,
        initialChecked: z.boolean().optional(),
        disabled: z.boolean().optional(),
      })
      .strict(),
    slots: [],
    events: ["change"] as const,
    description: "Native checkbox with local state.",
  },
  uiSwitch: {
    props: z
      .object({
        label: label,
        initialChecked: z.boolean().optional(),
        disabled: z.boolean().optional(),
      })
      .strict(),
    slots: [],
    events: ["change"] as const,
    description: "Native switch with local state.",
  },
  uiRadioGroup: {
    props: z
      .object({
        label: label,
        options: options,
        initialValue: short.optional(),
        disabled: z.boolean().optional(),
      })
      .strict(),
    slots: [],
    events: ["change"] as const,
    description: "Native radio group; arrow keys are handled by the browser.",
  },
  uiSelect: {
    props: z
      .object({
        label: label,
        options: options,
        disabled: z.boolean().optional(),
        initialValue: short.optional(),
      })
      .strict(),
    slots: [],
    events: ["change"] as const,
    description: "Native single selection with keyboard support.",
  },
  uiMultiSelect: {
    props: z
      .object({
        label: label,
        options: options,
        disabled: z.boolean().optional(),
        initialValues: z.array(short).max(100).optional(),
      })
      .strict(),
    slots: [],
    events: ["change"] as const,
    description: "Native multiple selection with keyboard support.",
  },
  uiRange: {
    props: z
      .object({
        label: label,
        initialValue: z.number().min(0).max(100).optional(),
        disabled: z.boolean().optional(),
      })
      .strict(),
    slots: [],
    events: ["change"] as const,
    description: "Local zero to one hundred slider with visible value.",
  },
  uiFileInput: {
    props: z
      .object({
        label: label,
        multiple: z.boolean().optional(),
        disabled: z.boolean().optional(),
      })
      .strict(),
    slots: [],
    events: ["change"] as const,
    description: "Local file selection only; never reads or uploads files.",
  },
  uiForm: {
    props: z.object({ label: label, submitLabel: label }).strict(),
    slots: ["default"],
    events: ["submit"] as const,
    description:
      "Local form with native validation. Prevents network submission; emits submit.",
  },
  uiUnorderedList: {
    props: z.object({ label: label, items: z.array(text).max(100) }).strict(),
    slots: [],
    description: "Semantic unorderedlist.",
  },
  uiOrderedList: {
    props: z.object({ label: label, items: z.array(text).max(100) }).strict(),
    slots: [],
    description: "Semantic orderedlist.",
  },
  uiDescriptionList: {
    props: z
      .object({
        items: z.array(z.object({ term: short, description: text })).max(100),
      })
      .strict(),
    slots: [],
    description: "Term and description pairs.",
  },
  uiTable: {
    props: z
      .object({
        caption: label,
        columns: z.array(label).min(1).max(16),
        rows: z.array(z.array(short).max(16)).max(100),
      })
      .strict()
      .refine(
        (value) =>
          value.rows.every((row) => row.length === value.columns.length),
        "Each row must match the columns",
      ),
    slots: [],
    description: "Captioned table with validated row widths.",
  },
  uiAvatar: {
    props: z.object({ name: label }).strict(),
    slots: [],
    description: "Initials avatar without remote image requests.",
  },
  uiAvatarGroup: {
    props: z.object({ label: label, names: z.array(label).max(20) }).strict(),
    slots: [],
    description: "Group of named initials avatars.",
  },
  uiTag: {
    props: z.object({ label: label }).strict(),
    slots: [],
    description: "Compact category label.",
  },
  uiTagGroup: {
    props: z.object({ label: label, tags: z.array(short).max(100) }).strict(),
    slots: [],
    description: "Labeled collection of tags.",
  },
  uiBreadcrumbs: {
    props: z
      .object({
        label: label,
        items: z
          .array(z.object({ label: label, href: fragment }))
          .min(1)
          .max(20),
      })
      .strict(),
    slots: [],
    description: "Breadcrumb trail using in-document fragment links only.",
  },
  uiPagination: {
    props: z
      .object({
        label: label,
        pages: z.number().int().min(1).max(100),
        initialPage: z.number().int().min(1).max(100).optional(),
      })
      .strict()
      .refine(
        (value) => (value.initialPage ?? 1) <= value.pages,
        "Initial page must exist",
      ),
    slots: [],
    events: ["change"] as const,
    description: "Local pagination state; emits change without fetching.",
  },
  uiTabs: {
    props: z
      .object({
        label: label,
        tabs: z
          .array(z.object({ label: label, content: text }))
          .min(1)
          .max(20),
      })
      .strict(),
    slots: [],
    events: ["change"] as const,
    description: "Local tabs with arrow, Home and End keyboard navigation.",
  },
  uiAccordion: {
    props: z
      .object({
        label: label,
        items: z.array(z.object({ title: label, content: text })).max(30),
      })
      .strict(),
    slots: [],
    description: "Native exclusive accordion with keyboard-operable summaries.",
  },
  uiDisclosure: {
    props: z
      .object({ title: label, initiallyOpen: z.boolean().optional() })
      .strict(),
    slots: ["default"],
    description: "Native disclosure containing nested elements.",
  },
  uiToolbar: {
    props: z.object({ label: label }).strict(),
    slots: ["default"],
    description: "Labeled toolbar of independently focusable nested controls.",
  },
  uiButtonGroup: {
    props: z.object({ label: label }).strict(),
    slots: ["default"],
    description:
      "Labeled buttongroup of independently focusable nested controls.",
  },
  uiLink: {
    props: z.object({ label: label, href: fragment }).strict(),
    slots: [],
    description: "In-document fragment link; no remote navigation.",
  },
  uiDownloadLink: {
    props: z
      .object({
        label: label,
        filename: z
          .string()
          .regex(/^[a-zA-Z0-9_-]+\.txt$/)
          .max(80),
        content: text,
      })
      .strict(),
    slots: [],
    description: "Download supplied plain text as a local .txt file.",
  },
  uiStepper: {
    props: z
      .object({
        label: label,
        steps: z.array(label).min(1).max(20),
        current: z.number().int().min(0).max(19),
      })
      .strict()
      .refine(
        (value) => value.current < value.steps.length,
        "Current step must exist",
      ),
    slots: [],
    description: "Ordered progress steps with the current step announced.",
  },
  uiTimeline: {
    props: z
      .object({
        label: label,
        items: z
          .array(z.object({ title: label, detail: text, time: short }))
          .max(100),
      })
      .strict(),
    slots: [],
    description: "Chronological activity list.",
  },
  uiRating: {
    props: z
      .object({
        label: label,
        initialValue: z.number().int().min(1).max(5).optional(),
        disabled: z.boolean().optional(),
      })
      .strict(),
    slots: [],
    events: ["change"] as const,
    description: "Accessible one to five star rating using native radios.",
  },
  uiStatistic: {
    props: z
      .object({ label: label, value: short, detail: short.optional() })
      .strict(),
    slots: [],
    description: "Headline statistic with supporting detail.",
  },
  uiPrice: {
    props: z
      .object({ amount: short, currency: short, period: short.optional() })
      .strict(),
    slots: [],
    description: "Explicitly formatted price and billing period.",
  },
  uiKeyValue: {
    props: z.object({ label: label, value: text }).strict(),
    slots: [],
    description: "Single semantic label/value pair.",
  },
  uiListItem: {
    props: z.object({ title: label, description: text.optional() }).strict(),
    slots: ["default"],
    description: "Content row with optional nested actions.",
  },
  uiNotification: {
    props: z.object({ title: label, message: text }).strict(),
    slots: [],
    description: "Notification content announced politely.",
  },
  uiBanner: {
    props: z
      .object({ title: label, message: text, tone: tone.optional() })
      .strict(),
    slots: ["default"],
    description: "Full-width informational banner with nested actions.",
  },
  uiTooltip: {
    props: z.object({ label: label, text: text }).strict(),
    slots: [],
    description:
      "Tooltip visible on focus or hover; Escape dismisses until focus or hover returns.",
  },
  uiPopover: {
    props: z.object({ label: label, title: label, text: text }).strict(),
    slots: ["default"],
    description: "Keyboard-operable disclosure popover with nested content.",
  },
  uiDialog: {
    props: z
      .object({
        trigger: label,
        title: label,
        description: text.optional(),
        closeLabel: label,
      })
      .strict(),
    slots: ["default"],
    events: ["close"] as const,
    description:
      "Native modal dialog with Escape, focus containment and focus restoration.",
  },
  uiSearchResults: {
    props: z.object({ label: label, items: z.array(text).max(100) }).strict(),
    slots: [],
    description: "Locally filter a supplied list with live result counts.",
  },
};

export type UiElementName = keyof typeof uiElementSchemas;
export type UiProps<K extends UiElementName> = z.infer<
  (typeof uiElementSchemas)[K]["props"]
>;
