import type { AuthorizeTask, Elevate } from "../chat/elevation";
interface Task {
  plugin: string;
  method: string;
  args: Record<string, unknown>;
  resolve: () => void;
  reject: (e: Error) => void;
}
export class Elevation {
  task = $state.raw<Task | null>(null);
  password = $state("");
  busy = $state(false);
  error = $state<string | null>(null);
  private disposed = false;
  constructor(private authorize?: AuthorizeTask) {}
  elevate: Elevate = (plugin, method, args) =>
    new Promise((resolve, reject) => {
      if (this.disposed || !this.authorize) {
        reject(
          new Error("Password authorization is unavailable without the door."),
        );
        return;
      }
      this.cancel("Password authorization replaced by another task.");
      this.task = { plugin, method, args, resolve, reject };
    });
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
        task.resolve();
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
    this.task?.reject(new Error(message));
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
