import { createContext, useContext, useState, type ReactNode } from "react";
import "./workbench.css";

export type WorkbenchView = "canvas" | "accountability" | "compliance" | "routing";
export type WorkbenchLayout = "balanced" | "conversation" | "canvas";

interface WorkbenchState {
  view: WorkbenchView;
  setView: (view: WorkbenchView) => void;
  layout: WorkbenchLayout;
  setLayout: (layout: WorkbenchLayout) => void;
  inspecting: boolean;
  setInspecting: (inspecting: boolean) => void;
  renderRevision: number;
  refreshRender: () => void;
}

const WorkbenchContext = createContext<WorkbenchState | null>(null);

/** Presentation state only. Navigation never changes a chat session or route. */
export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<WorkbenchView>("canvas");
  const [layout, setLayout] = useState<WorkbenchLayout>("balanced");
  const [inspecting, setInspecting] = useState(false);
  const [renderRevision, setRenderRevision] = useState(0);
  return <WorkbenchContext.Provider value={{
    view, setView, layout, setLayout, inspecting, setInspecting, renderRevision,
    refreshRender: () => setRenderRevision(previous => previous + 1),
  }}>{children}</WorkbenchContext.Provider>;
}

export function useWorkbench(): WorkbenchState {
  const context = useContext(WorkbenchContext);
  if (!context) throw new Error("WorkbenchProvider is required for workspace controls.");
  return context;
}
