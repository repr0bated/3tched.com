import React, { Suspense, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "/srv/git/operation-dashboard-ui-07/src/components/ui/tooltip";
import { loaders } from "./loaders";
import menu from "./menu.json";
import "/srv/git/operation-dashboard-ui-07/src/index.css";

const query = new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
const id = new URLSearchParams(location.search).get("id") ?? "overview";
const item = menu.find((entry) => entry.id === id);
class Boundary extends React.Component<{children:ReactNode},{error:string|null}>{
  state={error:null as string|null};
  static getDerivedStateFromError(error: Error){return {error:error.message};}
  render(){return this.state.error ? <p role="alert">This legacy JSX requires unavailable live context: {this.state.error}</p>:this.props.children;}
}
function Page(){
 const [Component,setComponent]=useState<ComponentType|null>(null);
 const [failure,setFailure]=useState<string|null>(null);
 useEffect(()=>{let active=true; const load=loaders[id]; if(!load)return; load().then(mod=>{if(active)setComponent(()=>mod.default)}).catch(error=>{if(active)setFailure(error instanceof Error ? error.stack ?? error.message : String(error))}); return()=>{active=false}},[]);
 return <main className="min-h-screen bg-background text-foreground p-8" data-capture-id={id}>
   <div className="mb-5 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm"><strong>OFFLINE LEGACY REFERENCE</strong> · {item?.label ?? id}. No live backend, credentials, or actions. Empty/error states are source behavior.</div>
   {item?.placeholder ? <section><h1>{item.label}</h1><p>Legacy navigation placeholder: no JSX page exists.</p></section>
     : failure ? <p role="alert">Legacy module could not load: {failure}</p>
     : Component ? <Boundary><Component /></Boundary> : <p>Loading legacy JSX…</p>}
 </main>;
}
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={query}><TooltipProvider><BrowserRouter><Suspense fallback={<p>Loading…</p>}><Page/></Suspense></BrowserRouter></TooltipProvider></QueryClientProvider>);
