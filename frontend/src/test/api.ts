import { vi } from "vitest";

// جای fetch را در آزمون‌های Vitest می‌گیرد: هر مسیر /api/ با «روش مسیر» (مثل "GET risks/") پیدا می‌شود و جواب
// ثابت یا تابعی می‌گیرد. هر درخواست ثبت می‌شود تا آزمون سرآیندها و بدنه‌ی فرستاده‌شده را ببیند.

export interface ApiCall {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Headers;
  body: unknown;
}

interface Reply {
  status: number;
  body: unknown;
}

type Answer = unknown | Reply | Promise<unknown | Reply>;
type Route = Answer | ((call: ApiCall) => Answer);

const REPLY = Symbol("reply");

/** جوابی با کد وضعیت دلخواه؛ بدون آن، هر جواب ۲۰۰ است. */
export function reply(status: number, body: unknown = {}): Reply {
  return { [REPLY]: true, status, body } as Reply;
}

function isReply(value: unknown): value is Reply {
  return typeof value === "object" && value !== null && REPLY in value;
}

/** جوابی که تا صدا زدن resolve نمی‌رسد؛ برای دیدن حالت «در حال ارسال». */
export function deferred() {
  let resolve!: (value: Answer) => void;
  const promise = new Promise<Answer>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export function mockApi(routes: Record<string, Route>) {
  const calls: ApiCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), window.location.origin);
    const path = url.pathname.replace(/^\/api\//, "");
    const method = (init.method ?? "GET").toUpperCase();
    const call: ApiCall = {
      method,
      path,
      query: url.searchParams,
      headers: new Headers(init.headers),
      // بدنه‌ی JSON خوانده می‌شود و FormData (بارگذاری فایل) همان‌طور که هست می‌ماند.
      body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
    };
    calls.push(call);
    const key = `${method} ${path}`;
    if (!(key in routes)) throw new Error(`no mock for ${key}`);
    const route = routes[key];
    const answer = await (typeof route === "function" ? (route as (call: ApiCall) => Answer)(call) : route);
    const { status, body } = isReply(answer) ? answer : { status: 200, body: answer };
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    calls,
    /** درخواست‌های یک «روش مسیر». */
    callsTo: (key: string) => calls.filter((call) => `${call.method} ${call.path}` === key),
  };
}
