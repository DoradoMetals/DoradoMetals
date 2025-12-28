import axios from "axios";
import chalk from "chalk";

function termWidth() {
  return Number(process.stdout?.columns) || 120;
}

function twoCol(left, right, width = termWidth()) {
  const L = String(left);
  const R = String(right);
  const space = 2;

  if (L.length + space + R.length > width) return `${L}  ${R}`;
  return L + " ".repeat(width - L.length - R.length) + R;
}

function padRight(str, width) {
  const s = String(str);
  if (s.length >= width) return s;
  return s + " ".repeat(width - s.length);
}

function localTimestamp() {
  const d = new Date();
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}
function redactHeaders(headers = {}) {
  const h = { ...headers };
  for (const k of Object.keys(h)) {
    const key = k.toLowerCase();
    if (
      key === "authorization" ||
      key === "cookie" ||
      key === "set-cookie" ||
      key.includes("token") ||
      key.includes("secret") ||
      key.includes("api-key")
    ) {
      h[k] = "[REDACTED]";
    }
  }
  return h;
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj && obj[k] != null) out[k] = obj[k];
  return out;
}

function parseStack(stack) {
  if (!stack) return [];
  const lines = String(stack).split("\n").slice(1);
  const frames = [];

  for (const raw of lines) {
    const line = raw.trim();

    const m =
      line.match(/^at (.+?) \((file:\/\/\/.*?):(\d+):(\d+)\)$/) ||
      line.match(/^at (.+?) \((\/.*?):(\d+):(\d+)\)$/) ||
      line.match(/^at (file:\/\/\/.*?):(\d+):(\d+)$/) ||
      line.match(/^at (\/.*?):(\d+):(\d+)$/);

    if (!m) continue;

    const fn = m[1]?.startsWith("file:") || m.length === 4 ? null : m[1];
    const file = (m.length === 4 ? m[1] : m[2]).replace("file://", "");
    const lineNo = Number(m[m.length - 2]);

    frames.push({ fn, file, line: lineNo });
  }

  return frames;
}

function isNoiseFrame(f) {
  const s = f.file;
  return (
    s.includes("node:internal") ||
    s.includes("/node_modules/") ||
    s.includes("\\node_modules\\")
  );
}

function toRelPath(absPath, rootHint) {
  if (!absPath) return absPath;
  if (!rootHint) return absPath;
  return absPath.startsWith(rootHint)
    ? absPath.slice(rootHint.length + 1)
    : absPath;
}

function firstUsefulFrame(stack) {
  const frames = parseStack(stack).filter((f) => !isNoiseFrame(f));
  return frames[0] ?? null;
}

function splitWhere(where) {
  if (!where) return { file: null, line: null };

  const m = String(where).match(/^(.*):(\d+)$/);
  if (!m) return { file: where, line: null };

  return { file: m[1], line: Number(m[2]) };
}

function prettyStack(stack, chalk, opts = {}) {
  const { maxFrames = 6, rootHint = null, showNodeModules = false } = opts;

  const frames = parseStack(stack);
  const filtered = showNodeModules
    ? frames
    : frames.filter((f) => !isNoiseFrame(f));

  const shown = filtered.slice(0, maxFrames);
  const hidden = Math.max(0, filtered.length - shown.length);

  if (!shown.length) return null;

  const leftCol = shown.map((f, idx) => {
    const n = chalk.blueBright(String(idx + 1));
    const fn = f.fn ? chalk.cyan(f.fn) : chalk.cyan("(anonymous)");
    return `${n}  ${fn}`;
  });

  const rightCol = shown.map((f) => {
    const rel = rootHint ? toRelPath(f.file, rootHint) : f.file;
    return chalk.gray(`${rel}:${f.line}`);
  });

  const padLen = Math.max(...leftCol.map((s) => stripAnsiLen(s)));

  const lines = leftCol.map((l, i) => {
    const pad = " ".repeat(Math.max(1, padLen - stripAnsiLen(l) + 2));
    return `  ${l}${pad}${rightCol[i]}`;
  });

  if (hidden) lines.push(chalk.gray(`  … +${hidden} more`));

  return lines.join("\n");
}

function stripAnsiLen(s) {
  return String(s).replace(/\x1b\[[0-9;]*m/g, "").length;
}

function toAxiosSafe(err, req) {
  const status = err.response?.status;
  const data = err.response?.data;

  const frame = firstUsefulFrame(err?.stack);
  const where = frame ? `${frame.file}:${frame.line}` : null;
  return {
    kind: "axios",
    message: err.message,
    status,
    url: err.config?.url,
    method: (err.config?.method || req?.method || "").toUpperCase(),
    path: req?.originalUrl,
    where,
    request: {
      headers: redactHeaders(
        pick(err.config?.headers, ["Content-Type", "Accept", "User-Agent"])
      ),
      contentLength:
        err.config?.headers?.["Content-Length"] ??
        err.config?.headers?.["content-length"],
    },
    response: {
      headers: redactHeaders(
        pick(err.response?.headers, ["content-type", "x-api-mode"])
      ),
      data:
        data && typeof data === "object"
          ? pick(data, ["transactionId", "errors"])
          : data,
    },
    _rawStack: err?.stack,
  };
}

function toAppSafe(err, req) {
  const frame = firstUsefulFrame(err?.stack);
  const where = frame ? `${frame.file}:${frame.line}` : null;
  return {
    kind: "app",
    message: err?.message || "Unknown error",
    name: err?.name,
    code: err?.code,
    method: (req?.method || "").toUpperCase(),
    path: req?.originalUrl,
    where,
    _rawStack: err?.stack,
  };
}

function colorStatus(status) {
  if (!status) return chalk.gray;
  if (status >= 500) return chalk.redBright;
  if (status >= 400) return chalk.yellowBright;
  if (status >= 300) return chalk.cyanBright;
  return chalk.greenBright;
}

function prettyPrint(safe) {
  const width = termWidth();
  const ts = localTimestamp();

  const tag =
    safe.kind === "axios"
      ? chalk.magentaBright("[AXIOS]")
      : chalk.blueBright("[APP]");

  const method = safe.method
    ? chalk.bold(String(safe.method))
    : chalk.bold("?");
  const pathStr = safe.path
    ? chalk.white(String(safe.path))
    : chalk.white("(unknown)");
  console.error(twoCol(`${tag} ${method} ${pathStr}`, chalk.gray(ts), width));

  const { file, line } = splitWhere(safe.where);
  const rootHint = process.cwd();
  const relFile = file ? toRelPath(file, rootHint) : null;

  const tx = safe.kind === "axios" ? safe.response?.data?.transactionId : null;
  const url = safe.kind === "axios" ? safe.url : null;

  const codeColored =
    safe.status != null
      ? colorStatus(safe.status)(String(safe.status))
      : chalk.gray("—");

  const errorColored =
    safe.kind === "axios"
      ? chalk.redBright(String(safe.message || "Upstream request failed"))
      : chalk.redBright(String(safe.message || "Error"));

  if (relFile) console.error(chalk.gray("Source: ") + chalk.white(relFile));
  if (line != null)
    console.error(chalk.gray("Line:   ") + chalk.white(String(line)));

  if (url) console.error(chalk.gray("Url:    ") + chalk.white(String(url)));
  if (tx) console.error(chalk.gray("TX:     ") + chalk.white(String(tx)));

  if (safe.kind === "axios") {
    console.error(chalk.gray("Code:   ") + codeColored);
    console.error(chalk.gray("Error:  ") + errorColored);
  } else {
    if (safe.code)
      console.error(chalk.gray("Code:   ") + chalk.white(String(safe.code)));
    if (safe.name)
      console.error(chalk.gray("Name:   ") + chalk.white(String(safe.name)));
    console.error(chalk.gray("Error:  ") + errorColored);
  }

  if (safe.kind === "axios") {
    const errs = safe.response?.data?.errors;
    if (Array.isArray(errs) && errs.length) {
      console.error(chalk.gray("Upstream Errors:"));
      for (const e of errs.slice(0, 8)) {
        console.error(
          " - " +
            chalk.yellow(e.code ?? "ERROR") +
            chalk.gray(": ") +
            chalk.white(e.message ?? "")
        );
      }
    }
  }

  if (safe._rawStack && process.env.NODE_ENV !== "production") {
    const table = prettyStack(safe._rawStack, chalk, {
      rootHint,
      maxFrames: 10,
    });
    if (table) console.error(chalk.gray("Stack:\n") + table);
  }

  console.error(chalk.gray("\n" + "—".repeat(Math.min(width, 120))));
}

export default function errorHandler(err, req, res, _next) {
  const safe = axios.isAxiosError(err)
    ? toAxiosSafe(err, req)
    : toAppSafe(err, req);

  prettyPrint(safe);

  const status =
    (safe.kind === "axios" && safe.status) ||
    err.statusCode ||
    err.status ||
    500;

  res.status(status).json({
    success: false,
    error: {
      message:
        safe.kind === "axios"
          ? "Upstream carrier request failed"
          : safe.message || "Server error",
      ...(safe.kind === "axios"
        ? {
            carrier_status: safe.status,
            carrier_transaction_id: safe.response?.data?.transactionId,
          }
        : {}),
      ...(process.env.NODE_ENV !== "production" && safe.where
        ? { where: safe.where }
        : {}),
    },
  });
}
