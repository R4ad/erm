import type { ReactNode } from "react";

import type { SourceSlug } from "./sources";

// تصویرسازی‌های خطی «شناسایی ریسک» (11 v2): سبز برند با نقطه‌ی نارنجی، هم‌سبک فریم و بازسازی‌شده به SVG. رنگ‌ها فقط
// نام نقش‌اند (stroke-brand، fill-tangerine-bright، ...) تا از index.css بیایند. همه تزئینی‌اند و صفحه‌خوان آن‌ها را نمی‌خواند.

const line = "fill-none stroke-brand-subtle-strong";

/** تصویر کارت بزرگ «پاسخنامه‌ها»: پاسخنامه با تیک‌ها، گفت‌وگو و دو کارت پاسخ. */
export function ResponsesIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 551 452" aria-hidden focusable="false" className={className} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="responses-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="[stop-color:var(--brand-subtle)]" />
          <stop offset="1" className="[stop-color:var(--bg-surface)]" />
        </linearGradient>
      </defs>
      <rect width="551" height="452" fill="url(#responses-bg)" />
      <path d="M0 330 L551 150 L551 330 L0 452 Z" className="fill-brand-subtle opacity-70" />
      <path d="M0 360 L140 205" className={`${line} stroke-2 [stroke-dasharray:3_6]`} />
      <path d="M193 196 H215 M340 196 H551" className={`${line} stroke-2 [stroke-dasharray:3_6]`} />

      {/* گفت‌وگو */}
      <path
        d="M127 133 H183 A10 10 0 0 1 193 143 V180 A10 10 0 0 1 183 190 H150 L136 204 V190 H127 A10 10 0 0 1 117 180 V143 A10 10 0 0 1 127 133 Z"
        className="fill-panel stroke-brand stroke-[3]"
        strokeLinejoin="round"
      />
      <circle cx="139" cy="161" r="4" className="fill-brand" />
      <circle cx="155" cy="161" r="4" className="fill-brand" />
      <circle cx="171" cy="161" r="4" className="fill-brand" />

      {/* پاسخنامه */}
      <rect x="215" y="112" width="125" height="167" rx="12" className="fill-panel stroke-brand stroke-[3]" />
      <rect x="250" y="102" width="55" height="16" rx="6" className="fill-panel stroke-brand stroke-[3]" />
      <path d="M233 162 H286 M241 197 H286 M233 234 H274" className={`${line} stroke-[5]`} strokeLinecap="round" />
      <path
        d="M299 162 L307 170 L320 154 M299 197 L307 205 L320 189"
        className="fill-none stroke-brand stroke-[3]"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="310" cy="234" r="6" className="fill-tangerine-bright" />

      {/* کارت پاسخ تأییدشده */}
      <rect
        x="94"
        y="252"
        width="100"
        height="46"
        rx="9"
        className="fill-panel stroke-brand-subtle-strong stroke-[2.5]"
      />
      <path d="M110 268 H152 M110 281 H146" className={`${line} stroke-[3]`} strokeLinecap="round" />
      <circle cx="174" cy="275" r="9" className="fill-brand" />
      <path
        d="M169.5 275 L173 278.5 L179 271.5"
        className="fill-none stroke-on-brand stroke-2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* کارت پاسخ منتظر */}
      <rect
        x="355"
        y="228"
        width="125"
        height="58"
        rx="10"
        className="fill-panel stroke-brand-subtle-strong stroke-[2.5]"
      />
      <path d="M372 249 H430 M372 264 H420" className={`${line} stroke-[3]`} strokeLinecap="round" />
      <circle cx="457" cy="257" r="10" className="fill-panel stroke-brand stroke-[2.5]" />
    </svg>
  );
}

function Tile({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 250 150"
      aria-hidden
      focusable="false"
      className="h-full w-full"
      preserveAspectRatio="xMidYMid slice"
    >
      <path d="M0 62 L150 0 H232 L0 112 Z M70 150 L250 76 V128 L196 150 Z" className="fill-brand-subtle" />
      {children}
    </svg>
  );
}

const ink = "fill-none stroke-brand stroke-[2.5]";
const round = { strokeLinecap: "round", strokeLinejoin: "round" } as const;

const TILES: Record<SourceSlug, ReactNode> = {
  audit: (
    <>
      <rect x="85" y="25" width="64" height="74" rx="7" className={`${ink} fill-panel`} />
      <path d="M97 43 H137 M97 55 H131 M97 67 H117" className={`${line} stroke-[3]`} strokeLinecap="round" />
      <circle cx="146" cy="86" r="19" className={`${ink} fill-panel`} />
      <path d="M137 86 L144 93 L155 80" className="fill-none stroke-tangerine-bright stroke-[3]" {...round} />
      <path d="M160 100 L171 111" className={`${ink} stroke-[4]`} strokeLinecap="round" />
    </>
  ),
  changes: (
    <>
      <rect x="80" y="47" width="46" height="60" rx="6" className="fill-panel stroke-brand-subtle-strong stroke-2" />
      <path d="M89 66 H112 M89 76 H108" className={`${line} stroke-[3]`} strokeLinecap="round" />
      <rect x="106" y="28" width="62" height="72" rx="8" className={`${ink} fill-panel`} />
      <circle cx="124" cy="46" r="4.5" className={`${ink} fill-panel`} />
      <circle cx="124" cy="84" r="4.5" className={`${ink} fill-panel`} />
      <path d="M124 51 V79 M124 72 C124 60 146 66 146 56" className={ink} {...round} />
      <circle cx="148" cy="52" r="5" className="fill-tangerine-bright" />
    </>
  ),
  monitoring: (
    <>
      <rect x="72" y="28" width="106" height="82" rx="7" className={`${ink} fill-panel`} />
      <path d="M72 44 H178" className={ink} />
      <circle cx="158" cy="36" r="2" className="fill-ink-3" />
      <circle cx="165" cy="36" r="2" className="fill-ink-3" />
      <circle cx="172" cy="36" r="2" className="fill-ink-3" />
      <path d="M84 100 L102 84 L116 92 L136 74 L150 82 L162 62 V100 Z" className="fill-brand-subtle" />
      <path d="M84 100 L102 84 L116 92 L136 74 L150 82 L162 62" className={ink} {...round} />
      <circle cx="163" cy="61" r="4.5" className="fill-tangerine-bright" />
    </>
  ),
  dependencies: (
    <>
      <path
        d="M82 75 H106 M144 75 H167 M125 94 V108 M98 46 L109 59"
        className={`${line} stroke-2 [stroke-dasharray:4_4] stroke-brand`}
      />
      <rect x="106" y="56" width="38" height="38" rx="8" className="fill-brand" />
      <path
        d="M115 85 V70 L125 63 L135 70 V85 Z M121 85 V77 H129 V85"
        className="fill-none stroke-on-brand stroke-2"
        {...round}
      />
      <circle cx="75" cy="75" r="7.5" className={`${ink} fill-panel`} />
      <circle cx="175" cy="75" r="8" className="fill-tangerine-bright" />
      <circle cx="93" cy="40" r="6.5" className="fill-panel stroke-ink-3 stroke-2" />
      <circle cx="125" cy="116" r="7.5" className={`${ink} fill-panel`} />
    </>
  ),
};

export function SourceIllustration({ slug }: { slug: SourceSlug }) {
  return <Tile>{TILES[slug]}</Tile>;
}
