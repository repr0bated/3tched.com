import * as uiComponents from "../../svelte/catalog/ui-components";
import { defineCatalog } from "@json-render/core";
import { defineRegistry, type Components } from "@json-render/svelte";
import { schema } from "@json-render/svelte/schema";
import { chatCatalog } from "./chat-catalog";
import { dashboardElementSchemas } from "./dashboard-elements";
import { uiElementSchemas } from "./ui-elements";
import autoTile from "../../svelte/catalog/autoTile.svelte";
import antigravityChatContainer from "../../svelte/catalog/antigravityChatContainer.svelte";
import autoTileItem from "../../svelte/catalog/autoTileItem.svelte";
import badge from "../../svelte/catalog/badge.svelte";
import chatMessage from "../../svelte/catalog/chatMessage.svelte";
import chatModeSelector from "../../svelte/catalog/chatModeSelector.svelte";
import chatThread from "../../svelte/catalog/chatThread.svelte";
import catalogComponent from "../../svelte/catalog/catalogComponent.svelte";
import container from "../../svelte/catalog/container.svelte";
import dashboardBarChart from "../../svelte/catalog/dashboardBarChart.svelte";
import dashboardCode from "../../svelte/catalog/dashboardCode.svelte";
import dashboardDisclosure from "../../svelte/catalog/dashboardDisclosure.svelte";
import dashboardEventLog from "../../svelte/catalog/dashboardEventLog.svelte";
import dashboardFormPreview from "../../svelte/catalog/dashboardFormPreview.svelte";
import dashboardKeyValues from "../../svelte/catalog/dashboardKeyValues.svelte";
import dashboardMetric from "../../svelte/catalog/dashboardMetric.svelte";
import dashboardPanel from "../../svelte/catalog/dashboardPanel.svelte";
import dashboardProgress from "../../svelte/catalog/dashboardProgress.svelte";
import dashboardStatus from "../../svelte/catalog/dashboardStatus.svelte";
import dashboardTable from "../../svelte/catalog/dashboardTable.svelte";
import dashboardTabs from "../../svelte/catalog/dashboardTabs.svelte";
import dashboardTopology from "../../svelte/catalog/dashboardTopology.svelte";
import dashboardTree from "../../svelte/catalog/dashboardTree.svelte";
import generatedRegion from "../../svelte/catalog/generatedRegion.svelte";
import heading from "../../svelte/catalog/heading.svelte";
import menuBar from "../../svelte/catalog/menuBar.svelte";
import menuItem from "../../svelte/catalog/menuItem.svelte";
import menuSection from "../../svelte/catalog/menuSection.svelte";
import notebookHeader from "../../svelte/catalog/notebookHeader.svelte";
import notebookSourceList from "../../svelte/catalog/notebookSourceList.svelte";
import pageHeader from "../../svelte/catalog/pageHeader.svelte";
import routeView from "../../svelte/catalog/routeView.svelte";
import row from "../../svelte/catalog/row.svelte";
import stat from "../../svelte/catalog/stat.svelte";
import tchedRouterPicker from "../../svelte/catalog/tchedRouterPicker.svelte";
import text from "../../svelte/catalog/text.svelte";
import workbenchNavigation from "../../svelte/catalog/workbenchNavigation.svelte";

const components = {
  antigravityChatContainer,
  autoTileItem,
  badge,
  chatMessage,
  chatModeSelector,
  chatThread,
  catalogComponent,
  container,
  generatedRegion,
  heading,
  menuBar,
  menuItem,
  menuSection,
  notebookHeader,
  notebookSourceList,
  pageHeader,
  routeView,
  row,
  stat,
  tchedRouterPicker,
  text,
  workbenchNavigation,
} satisfies Omit<Components<typeof chatCatalog>, "autoTile">;

const keptByChat = new Set(["catalogComponent", "notebookHeader", "notebookSourceList"]);
const retainedSchemas = Object.fromEntries(
  Object.entries(dashboardElementSchemas).filter(([name]) => !keptByChat.has(name)),
) as Omit<typeof dashboardElementSchemas, "catalogComponent" | "notebookHeader" | "notebookSourceList">;

/** Renderers for specs already saved. They are not part of the chatbot catalog. */
const retainedCatalog = defineCatalog(schema, {
  components: { ...retainedSchemas, ...uiElementSchemas },
  actions: {},
});
const retained = {
  ...uiComponents,
  dashboardBarChart,
  dashboardCode,
  dashboardDisclosure,
  dashboardEventLog,
  dashboardFormPreview,
  dashboardKeyValues,
  dashboardMetric,
  dashboardPanel,
  dashboardProgress,
  dashboardStatus,
  dashboardTable,
  dashboardTabs,
  dashboardTopology,
  dashboardTree,
} satisfies Components<typeof retainedCatalog>;

export const chatRegistry = {
  ...defineRegistry(chatCatalog, { components }).registry,
  autoTile,
  ...defineRegistry(retainedCatalog, { components: retained }).registry,
};
