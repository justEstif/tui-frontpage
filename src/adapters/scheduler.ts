// Daemon scheduler (`frontpage d`) — contract in src/md/adapters/scheduler.md. Stub.
import type { Scheduler } from "../domain/ports";

export const scheduler: Scheduler = {
  async run() {
    throw new Error("not implemented: see src/md/adapters/scheduler.md");
  },
  async isRunning() {
    return false;
  },
};
