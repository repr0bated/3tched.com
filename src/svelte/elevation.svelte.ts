import type { AuthorizeTask, Elevate } from "../chat/elevation";
interface TaskResolve {
  resolve: () => void;
  reject: (e: Error) => void;
}

/** Gate wrapping a withResolvers promise so stored callbacks can fire later. */
class Gate {
  #promise: Promise<void>;
  #resolve: () => void;
  #reject: (e: Error) => void;

  constructor() {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    this.#promise = promise;
    this.#resolve = resolve;
    this.#reject = reject;
  }

  open(): void { this.#resolve(); }
  fail(e: Error): void { this.#reject(e); }
  get promise(): Promise<void> { return this.#promise; }
}
interface Task {
  plugin: string;
  method: string;
  args: Record<string, unknown>;
  gate: Gate;
}
export class Elevation {
  task = $state.raw<Task | null>(null);
  password = $state("");
  busy = $state(false);
  error = $state<string | null>(null);
  private disposed = false;
  constructor(private authorize?: AuthorizeTask) {}
  elevate: Elevate = (plugin, method, args) => {
    if (this.disposed || !this.authorize) {
      const { promise, reject } = Promise.withResolvers<void>();
      reject(new Error("Password authorization is unavailable without the door."));
      return promise;
    }
    this.cancel("Password authorization replaced by another task.");
    const gate = new Gate();
    this.task = { plugin, method, args, gate };
    return gate.promise;
  };
  async submit() {
    const task = this.task;
    if (!task || !this.authorize || !this.password || this.busy) return;
    this.busy = true;
    this.error = null;
    const password = this.password;
    this.password = "";
    try {
      await this.authorize(task.plugin, task.method, task.args, password);
      if (this.task === task) {
        this.task = null;
        task.gate.open();
      }
    } catch (e) {
      if (this.task === task)
        this.error =
          e instanceof Error ? e.message : "Root password was not accepted.";
    } finally {
      if (this.task === task || this.task === null) this.busy = false;
    }
  }
  cancel(message = "Password authorization cancelled.") {
    const task = this.task;
    task?.gate.fail(new Error(message));
    this.task = null;
    this.password = "";
    this.error = null;
    this.busy = false;
  }
  dispose() {
    this.disposed = true;
    this.cancel(
      "Password authorization cancelled because the task context changed.",
    );
  }
}
