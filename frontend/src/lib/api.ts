import { t } from "./i18n";
import { leaveTo } from "./navigation";
import type { Errors } from "./types";

// همه‌ی درخواست‌ها با کوکی نشست همان صفحه‌های جنگو می‌روند؛ درخواست‌های نوشتنی توکن CSRF را در سرآیند می‌فرستند.
// هیچ کلید یا توکنی در کد رابط یا localStorage نیست: نشست در کوکی HttpOnly جنگوست و توکن CSRF از کوکی خوانده می‌شود.

export class ApiError extends Error {
  status: number;
  errors: Errors;
  data: Record<string, unknown>;

  constructor(status: number, data: Record<string, unknown>) {
    const detail = typeof data.detail === "string" ? data.detail : undefined;
    const message = typeof data.message === "string" ? data.message : undefined;
    super(message ?? detail ?? describeStatus(status));
    this.name = "ApiError";
    this.status = status;
    this.data = data;
    this.errors = (data.errors as Errors | undefined) ?? {};
  }

  /** خطای شبکه (سرور در دسترس نیست یا اینترنت قطع است)، نه جواب سرور. */
  get isNetwork() {
    return this.status === 0;
  }
}

function describeStatus(status: number) {
  if (status === 403) return t("error.forbidden");
  // ۵۰۲ و ۵۰۴ یعنی جنگو اصلاً جواب نداده: پشت nginx روی سرور، یا پشت npm run dev وقتی runserver اجرا نشده است.
  if (status === 502 || status === 504) return t("error.noServer");
  if (status === 404) return t("error.notFound");
  if (status >= 500) return t("error.server");
  return t("error.status", { status });
}

export function csrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

/** نشست تمام شده: کاربر به صفحه‌ی ورود می‌رود تا بعد از ورود به همین صفحه برگردد. */
function goToLogin(loginUrl: string): Promise<never> {
  const next = window.location.pathname + window.location.search;
  leaveTo(`${loginUrl}?next=${encodeURIComponent(next)}`);
  // تا صفحه عوض شود، صفحه در حالت «در حال خواندن» می‌ماند و خطایی نشان نمی‌دهد.
  return new Promise<never>(() => {});
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  /** درخواست با بسته شدن یا ترک صفحه هم فرستاده می‌شود (fetch keepalive)، مثل تأیید در ۱۰ ثانیه‌ی بازگردانی. */
  keepalive?: boolean;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  // FormData (فرم با فایل) را مرورگر خودش با مرز multipart می‌فرستد؛ بقیه JSON است.
  const multipart = options.body instanceof FormData;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined && !multipart) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["X-CSRFToken"] = csrfToken();

  let response: Response;
  try {
    response = await fetch(`/api/${path}`, {
      method,
      headers,
      credentials: "same-origin",
      signal: options.signal,
      keepalive: options.keepalive,
      body:
        options.body === undefined ? undefined : multipart ? (options.body as FormData) : JSON.stringify(options.body),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, { detail: t("error.network") });
  }

  const isJson = response.headers.get("Content-Type")?.includes("application/json");
  const data = (isJson ? await response.json().catch(() => ({})) : {}) as Record<string, unknown>;
  if (response.ok) return data as T;
  if (typeof data.login_url === "string") return goToLogin(data.login_url);
  throw new ApiError(response.status, data);
}

export const get = <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal });
export const post = <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body });
export const put = <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body });
export const patch = <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body });

/** نشانی endpoint پل برای یک صفحه‌ی جنگو: forms/?path=/risks/12/edit/ */
export const bridge = (kind: "forms" | "pages", djangoPath: string) =>
  `${kind}/?path=${encodeURIComponent(djangoPath)}`;

/** پیام قابل نمایش هر خطا. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return t("state.unknownError");
}
