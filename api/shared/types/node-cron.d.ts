// node-cron ships no types, and @types/node-cron is not installed here.
//
// Declared locally rather than adding a dependency: this file names only the
// two functions the scheduler actually calls, checked against node-cron 3.0.3's
// own `module.exports = { schedule, validate, getTasks }`. getTasks is included
// for completeness but nothing calls it.
//
// The narrow surface is the point. A hand-written declaration for a third-party
// package is a claim about somebody else's code, so the less it claims the less
// there is to be wrong about - and if a future caller needs an option this does
// not name, the compiler says so rather than silently accepting it.
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
