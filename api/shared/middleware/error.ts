import type { Request, Response, NextFunction } from "express";
import axios, { AxiosError } from "axios";
import chalk from "chalk";

type StackFrame = {
  fn: string | null;
  file: string;
  line: number;
};

type SafeAxiosError = {
  kind: "axios";
  message: string;
  status?: number;
  url?: string;
  method?: string;
  path?: string;
  where?: string | null;
  request: {
    headers?: Record<string, unknown>;
    contentLength?: number | string;
  };
  response: {
    headers?: Record<string, unknown>;
    data?: unknown;
  };
  _rawStack?: string;
};

type SafeAppError = {
  kind: "app";
  message: string;
  name?: string;
  code?: string | number;
  method?: string;
  path?: string;
  where?: string | null;
  _rawStack?: string;
};

type SafeError = SafeAxiosError | SafeAppError;

function termWidth(): number {
  return Number(process.stdout?.columns) || 120;
}

function twoCol(
  left: string,
  right: string,
  width: number = termWidth(),
): string {
  const space = 2;
  if (left.length + space + right.length > width) return `${left}  ${right}`;
  return left + " ".repeat(width - left.length - right.length) + right;
}

function localTimestamp(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function redactHeaders(
  headers: Record<string, unknown> = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...headers };
  for (const k of Object.keys(out)) {
    const key = k.toLowerCase();
    if (
      key === "authorization" ||
      key === "cookie" ||
      key === "set-cookie" ||
      key.includes("token") ||
      key.includes("secret") ||
      key.includes("api-key")
    ) {
      out[k] = "[REDACTED]";
    }
  }
  return out;
}

function pick<T extends Record<string, unknown>>(
  obj: T | undefined,
  keys: readonly (keyof T)[],
): Partial<T> {
  const out: Partial<T> = {};
  if (!obj) return out;
  for (const k of keys) {
    if (obj[k] != null) out[k] = obj[k];
  }
  return out;
}

function parseStack(stack?: string): StackFrame[] {
  if (!stack) return [];
  const lines = stack.split("\n").slice(1);
  const frames: StackFrame[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    const m =
      line.match(/^at (.+?) \((.*?):(\d+):(\d+)\)$/) ||
      line.match(/^at (.*?):(\d+):(\d+)$/);

    if (!m) continue;

    const fn = m.length === 5 ? m[1] : null;
    const file = m.length === 5 ? m[2] : m[1];
    const lineNo = Number(m[m.length - 2]);

    frames.push({
      fn: fn?.startsWith("file:") ? null : (fn ?? null),
      file: file.replace("file://", ""),
      line: lineNo,
    });
  }

  return frames;
}

function firstUsefulFrame(stack?: string): StackFrame | null {
  return (
    parseStack(stack).find(
      (f) =>
        !f.file.includes("node:internal") &&
        !f.file.includes("/node_modules/") &&
        !f.file.includes("\\node_modules\\"),
    ) ?? null
  );
}

function toAxiosSafe(err: AxiosError, req: Request): SafeAxiosError {
  const frame = firstUsefulFrame(err.stack);
  return {
    kind: "axios",
    message: err.message,
    status: err.response?.status,
    url: err.config?.url,
    method: (err.config?.method || req.method || "").toUpperCase(),
    path: req.originalUrl,
    where: frame ? `${frame.file}:${frame.line}` : null,
    request: {
      headers: redactHeaders(
        pick(err.config?.headers as Record<string, unknown>, [
          "Content-Type",
          "Accept",
          "User-Agent",
        ]),
      ),
      contentLength: (
        err.config?.headers as Record<string, string | number | undefined>
      )?.["Content-Length"],
    },
    response: {
      headers: redactHeaders(
        pick(err.response?.headers as Record<string, unknown>, [
          "content-type",
        ]),
      ),
      data:
        typeof err.response?.data === "object" ? err.response?.data : undefined,
    },
    _rawStack: err.stack,
  };
}

function toAppSafe(err: unknown, req: Request): SafeAppError {
  const e = err as Error & { code?: string | number };
  const frame = firstUsefulFrame(e.stack);
  return {
    kind: "app",
    message: e.message || "Unknown error",
    name: e.name,
    code: e.code,
    method: req.method,
    path: req.originalUrl,
    where: frame ? `${frame.file}:${frame.line}` : null,
    _rawStack: e.stack,
  };
}

function colorStatus(status?: number) {
  if (!status) return chalk.gray;
  if (status >= 500) return chalk.redBright;
  if (status >= 400) return chalk.yellowBright;
  if (status >= 300) return chalk.cyanBright;
  return chalk.greenBright;
}

function prettyPrint(safe: SafeError) {
  const width = termWidth();
  const ts = localTimestamp();

  const tag =
    safe.kind === "axios"
      ? chalk.magentaBright("[AXIOS]")
      : chalk.blueBright("[APP]");

  const method = safe.method ? chalk.bold(safe.method) : chalk.bold("?");
  const pathStr = safe.path ?? "(unknown)";

  console.error(
    twoCol(`${tag} ${method} ${chalk.white(pathStr)}`, chalk.gray(ts), width),
  );

  if (safe.where)
    console.error(chalk.gray("Where: ") + chalk.white(safe.where));

  if (safe.kind === "axios") {
    console.error(
      chalk.gray("Status: ") +
        colorStatus(safe.status)(String(safe.status ?? "—")),
    );
  }

  console.error(chalk.redBright(safe.message));

  if (safe._rawStack && process.env.NODE_ENV !== "production") {
    console.error(chalk.gray("\n" + safe._rawStack));
  }

  console.error(chalk.gray("\n" + "—".repeat(Math.min(width, 120))));
}

export default function error(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  const safe: SafeError = axios.isAxiosError(err)
    ? toAxiosSafe(err, req)
    : toAppSafe(err, req);

  prettyPrint(safe);

  const status =
    safe.kind === "axios"
      ? (safe.status ?? 500)
      : ((err as any)?.statusCode ?? (err as any)?.status ?? 500);

  res.status(status).json({
    success: false,
    error: {
      message:
        safe.kind === "axios"
          ? "Upstream request failed"
          : safe.message || "Server error",
      ...(process.env.NODE_ENV !== "production" && safe.where
        ? { where: safe.where }
        : {}),
    },
  });
}
