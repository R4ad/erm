import type { RouteEntry } from "./types";

// سرور هر پیوند را به شکل نشانی صفحه‌ی جنگو می‌دهد (/risks/12/edit/). جدول پیوندهای نشست (apps/api/routes.py)
// می‌گوید کدام نشانی‌ها در این رابط هم هستند و مسیرشان چیست؛ پیوندی که در جدول نیست صفحه‌ی جنگو را باز می‌کند.

interface CompiledRoute {
  regex: RegExp;
  route: string;
  form: boolean;
}

const compiled = new WeakMap<RouteEntry[], CompiledRoute[]>();

function compile(table: RouteEntry[]): CompiledRoute[] {
  let routes = compiled.get(table);
  if (!routes) {
    routes = table.flatMap((entry) => {
      try {
        return [{ regex: new RegExp(entry.pattern, "u"), route: entry.route, form: entry.form }];
      } catch {
        return []; // الگوی نادرست فقط یعنی آن پیوند صفحه‌ی جنگو را باز می‌کند
      }
    });
    compiled.set(table, routes);
  }
  return routes;
}

function parse(href: string): URL | null {
  try {
    const url = new URL(href, window.location.origin);
    return url.origin === window.location.origin ? url : null;
  } catch {
    return null;
  }
}

function match(table: RouteEntry[], pathname: string) {
  for (const entry of compile(table)) {
    const found = entry.regex.exec(pathname);
    if (found) {
      const groups = found.groups ?? {};
      const route = entry.route.replace(/:(\w+)/g, (_, name: string) => encodeURIComponent(groups[name] ?? ""));
      return { route, form: entry.form };
    }
  }
  return null;
}

/** مسیر React یک نشانی جنگو با همان query و #بخش، یا null اگر آن صفحه هنوز فقط در جنگو است. */
export function toRoute(href: string | null | undefined, table: RouteEntry[]): string | null {
  if (!href) return null;
  const url = parse(href);
  if (!url) return null;
  const found = match(table, url.pathname);
  return found ? found.route + url.search + url.hash : null;
}

/**
 * نشانی جنگوی صفحه‌ای که رابط React با پل جنگو (/api/forms/ و /api/pages/) نشان می‌دهد. این صفحه‌ها همیشه همان
 * نشانی جنگو را بدون / آخر دارند (routes.py)، پس نشانی جنگو همان مسیر فعلی با / آخر است.
 */
export function djangoPath(location: { pathname: string; search: string }): string {
  const path = location.pathname.endsWith("/") ? location.pathname : `${location.pathname}/`;
  return path + location.search;
}

/** مسیر فعلی صفحه‌ای است که فرم عمومی رابط نشانش می‌دهد؟ برای فرم‌هایی که بعداً به جدول سرور اضافه می‌شوند. */
export function isFormRoute(pathname: string, table: RouteEntry[]): boolean {
  return Boolean(match(table, pathname.endsWith("/") ? pathname : `${pathname}/`)?.form);
}
