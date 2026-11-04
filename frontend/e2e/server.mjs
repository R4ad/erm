// سرور کوچک آزمون‌های سرتاسری: ساخت نهایی (dist) را همان‌طور می‌دهد که جنگو می‌دهد، تا آزمون‌ها رابط را با همان
// CSP، nonce و Trusted Types محیط واقعی ببینند. /app/... همان index.html با nonce تازه است و /static/spa/... فایل‌های
// ساخته‌شده. API را خود آزمون‌ها در مرورگر جواب می‌دهند (e2e/mock-api.ts)؛ درخواستی که جواب آزمونی نداشته باشد
// این‌جا ۵۰۲ می‌گیرد، مثل وقتی که جنگو در دسترس نیست.
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const port = Number(process.env.PORT ?? 4173);

// همان سیاست apps/api/spa.py (content_security_policy). اگر آن‌جا عوض شد، این‌جا هم عوض شود.
const policy = (nonce) =>
  [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "require-trusted-types-for 'script'",
    "trusted-types 'none'",
  ].join("; ");

const types = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".png": "image/png",
};

createServer(async (request, response) => {
  const { pathname } = new URL(request.url ?? "/", "http://localhost");
  try {
    if (pathname === "/app" || pathname.startsWith("/app/")) {
      const nonce = randomBytes(18).toString("base64url");
      const page = await readFile(join(dist, "index.html"), "utf8");
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": policy(nonce),
        // جنگو با ensure_csrf_cookie همین کوکی را می‌گذارد و رابط آن را در سرآیند X-CSRFToken می‌فرستد.
        "Set-Cookie": "csrftoken=e2e-csrf-token; Path=/; SameSite=Lax",
      });
      response.end(page.replaceAll("__CSP_NONCE__", nonce));
      return;
    }
    if (pathname.startsWith("/static/spa/")) {
      const file = normalize(join(dist, pathname.slice("/static/spa/".length)));
      if (!file.startsWith(dist)) throw new Error("outside dist");
      const body = await readFile(file);
      response.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" });
      response.end(body);
      return;
    }
    if (pathname.startsWith("/api/")) {
      response.writeHead(502, { "Content-Type": "application/json" });
      response.end("{}");
      return;
    }
    response.writeHead(404).end();
  } catch {
    response.writeHead(404).end();
  }
}).listen(port, "127.0.0.1", () => console.log(`e2e server on http://127.0.0.1:${port}/app/`));
