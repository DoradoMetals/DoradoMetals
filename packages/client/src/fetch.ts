// THE ONE PLACE A REQUEST IS MADE.
//
// The frontend had this twice - `shared/queries/axios.ts` and the ad-hoc
// `fetch` calls beside it - and every feature folder then wrapped it again.
// It is one function here, and it is `fetch` rather than axios so the package
// carries no runtime dependency at all: a hook is a query key, a URL and a
// contract type.
//
// The base URL is the app's, read once at module load; `credentials: include`
// is what carries the session cookie, which every authenticated read needs.

export type ApiMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

// The API answers a domain refusal as `{ message }` with a status the kind
// decides (404/403/409/422 - api/shared/errors.ts). A caller that wants to
// branch reads `status`; one that only shows the message reads `message`.
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

const baseUrl = (): string =>
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL) || "";

const withQuery = (url: string, params?: Record<string, unknown>): string => {
  if (!params) return url;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${url}${url.includes("?") ? "&" : "?"}${query}` : url;
};

export async function apiRequest<T>(
  method: ApiMethod,
  url: string,
  data?: unknown,
  params?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${baseUrl()}${withQuery(url, params)}`, {
    method,
    credentials: "include",
    headers: data === undefined ? undefined : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });

  const text = await response.text();
  const body: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      (body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : null) ?? `${method} ${url} failed with ${response.status}`;
    throw new ApiError(response.status, message, body);
  }
  return body as T;
}

// The one BLOB response on the wire (PDF generation). Same request shape,
// the body is never JSON so there is no message to recover on failure - the
// status is all a caller gets.
export async function apiRequestBlob(
  method: ApiMethod, url: string, data?: unknown
): Promise<Blob> {
  const response = await fetch(`${baseUrl()}${url}`, {
    method,
    credentials: "include",
    headers: data === undefined ? undefined : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  if (!response.ok) {
    throw new ApiError(response.status, `${method} ${url} failed with ${response.status}`, null);
  }
  return response.blob();
}
