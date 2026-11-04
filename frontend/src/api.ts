import type { Errors } from "./types";

// همه‌ی درخواست‌ها با کوکی نشست همان صفحه‌های جنگو می‌روند؛ درخواست‌های نوشتنی توکن CSRF را در سرآیند می‌فرستند.

export class ApiError extends Error {
  status: number;
  errors: Errors;
  data: Record<string, unknown>;

  constructor(status: number, data: Record<string, unknown>) {
    const detail = typeof data.detail === "string" ? data.detail : undefined;
    const message = typeof data.message === "string" ? data.message : undefined;
    super(message ?? detail ?? describeStatus(status));
    this.status = status;
    this.data = data;
    this.errors = (data.errors as Errors | undefined) ?? {};
  }
}

function describeStatus(status: number) {
  if (status === 403) return "اجازه‌ی این کار را ندارید.";
  if (status === 404) return "پیدا نشد؛ یا وجود ندارد یا اجازه‌ی دیدنش را ندارید.";
  if (status >= 500) return "سرور خطا داد. چند دقیقه‌ی دیگر دوباره امتحان کنید و اگر تکرار شد به مدیر سامانه خبر دهید.";
  return `درخواست انجام نشد (کد ${status}).`;
}

function csrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

/** نشست تمام شده: کاربر را به صفحه‌ی ورود جنگو می‌فرستیم تا بعد از ورود به همین صفحه برگردد. */
function goToLogin(loginUrl: string) {
  const next = window.location.pathname + window.location.search;
  window.location.assign(`${loginUrl}?next=${encodeURIComponent(next)}`);
}

export async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["X-CSRFToken"] = csrfToken();

  let response: Response;
  try {
    response = await fetch(`/api/${path}`, {
      method,
      headers,
      credentials: "same-origin",
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, { detail: "به سرور وصل نشد. اتصال شبکه را بررسی کنید." });
  }

  const data = response.headers.get("Content-Type")?.includes("application/json") ? await response.json() : {};
  if (response.ok) return data as T;
  if (typeof data.login_url === "string") {
    goToLogin(data.login_url);
  }
  throw new ApiError(response.status, data);
}

export const get = <T>(path: string) => request<T>(path);
export const post = <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body });
export const put = <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body });
