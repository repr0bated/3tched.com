import React from "react";
export const loaders: Record<string, () => Promise<{default: React.ComponentType}>> = {
  "tched-router-config": () => import("/srv/git/operation-dashboard-ui-07/src/json-render/catalog/components/tched-router-config.tsx").then(module => ({default: () => React.createElement(module.TchedRouterConfigEl, {props:{title:"3tched Config", subtitle:null}})})),
};
