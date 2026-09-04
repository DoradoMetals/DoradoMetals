export function isTestRun(): boolean {
  return (
    process.env.NODE_ENV === "test" ||
    process.execArgv.some((a) => a.startsWith("--test"))
  );
}
