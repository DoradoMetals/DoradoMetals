// node-cron ships no types and @types/node-cron isn't installed — declared locally, naming only the two functions the scheduler calls (checked against node-cron 3.0.3's own exports).
// Narrow on purpose — the less a hand-written third-party declaration claims, the less there is to be wrong about; an unclaimed option is a compiler error, not silent acceptance.
declare module "node-cron" {
  /** Options accepted by schedule(). Only what this codebase might pass. */
  export interface ScheduleOptions {
    scheduled?: boolean;
    timezone?: string;
    name?: string;
    runOnInit?: boolean;
  }

  export interface ScheduledTask {
    start(): void;
    stop(): void;
    now(): void;
  }

  /** True when the expression is a cron expression node-cron can run. */
  export function validate(expression: string): boolean;

  export function schedule(
    expression: string,
    func: () => void | Promise<void>,
    options?: ScheduleOptions
  ): ScheduledTask;

  export function getTasks(): Map<string, ScheduledTask>;

  const _default: {
    schedule: typeof schedule;
    validate: typeof validate;
    getTasks: typeof getTasks;
  };
  export default _default;
}
