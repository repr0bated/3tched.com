/**
 * Per-task password elevation. A protected call (the Control Plane model,
 * catalog promote and retire) first needs a one-time ticket from the
 * `elevation` plugin for that exact call: plugin, method and arguments. The
 * user types the root password each time; it goes over the door
 * once, in `authorize_task`, and is never kept here.
 */
export type Elevate = (
  plugin: string,
  method: string,
  args: Record<string, unknown>,
) => Promise<void>;
export type AuthorizeTask = (
  plugin: string,
  method: string,
  args: Record<string, unknown>,
  password: string,
) => Promise<void>;
