declare module "node-cron" {
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
