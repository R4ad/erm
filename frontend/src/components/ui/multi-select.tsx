import { Search, X } from "lucide-react";
import { useId, useState } from "react";

import { cn } from "@/lib/cn";
import { count, formatNumber } from "@/lib/format";
import type { FormChoice } from "@/lib/types";

import { Checkbox } from "./field";

/** ی و ک عربی، فاصله‌ی مجازی و حروف بزرگ و کوچک در جست‌وجو یکی‌اند؛ «بانک ملي» همان «بانک ملی» است. */
function normalize(text: string) {
  return text.replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/‌/g, " ").toLocaleLowerCase("fa").trim();
}

interface MultiSelectProps {
  choices: FormChoice[];
  value: string[];
  onChange: (value: string[]) => void;
  onBlur?: () => void;
  /** نام فیلد، برای برچسب جست‌وجو («جست‌وجو در بانک‌ها»). */
  label: string;
  disabled?: boolean;
  invalid?: boolean;
  name?: string;
}

/**
 * انتخاب چندتایی با فهرست تیک‌ها، جست‌وجو و نشان انتخاب‌شده‌ها. همه‌ی گزینه‌ها checkbox بومی‌اند، پس با Tab و
 * فاصله و هر صفحه‌خوانی کار می‌کنند. باید درون FieldSet باشد تا برچسب گروه را داشته باشد.
 */
export function MultiSelect({ choices, value, onChange, onBlur, label, disabled, invalid, name }: MultiSelectProps) {
  const [query, setQuery] = useState("");
  const listId = useId();
  const selected = new Set(value);
  const searchable = choices.length > 7;
  const needle = normalize(query);
  const visible = needle ? choices.filter((choice) => normalize(choice.label).includes(needle)) : choices;
  const chosen = choices.filter((choice) => selected.has(choice.value));

  function toggle(option: string, on: boolean) {
    const next = on ? [...value, option] : value.filter((item) => item !== option);
    // ترتیب فرستادن همان ترتیب گزینه‌هاست، نه ترتیب کلیک.
    onChange(choices.map((choice) => choice.value).filter((item) => next.includes(item)));
  }

  const groups: { name: string | undefined; items: FormChoice[] }[] = [];
  for (const choice of visible) {
    const last = groups.at(-1);
    if (last && last.name === choice.group) last.items.push(choice);
    else groups.push({ name: choice.group, items: [choice] });
  }

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card",
        invalid && "border-danger/70",
        disabled && "opacity-60",
      )}
    >
      {chosen.length > 0 && (
        <ul aria-label="انتخاب‌شده‌ها" className="flex flex-wrap gap-1.5 border-b border-line p-2.5">
          {chosen.map((choice) => (
            <li key={choice.value}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => toggle(choice.value, false)}
                aria-label={`برداشتن ${choice.label}`}
                className="inline-flex h-7 max-w-64 items-center gap-1.5 rounded-full border border-accent-line/60 bg-accent-soft ps-3 pe-2 text-xs text-fg transition-colors hover:border-accent"
              >
                <span className="truncate">{choice.label}</span>
                <X aria-hidden className="size-3.5 shrink-0 text-muted" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {searchable && (
        <div className="relative border-b border-line">
          <Search
            aria-hidden
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={query}
            disabled={disabled}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={`جست‌وجو در ${label}`}
            aria-controls={listId}
            placeholder="جست‌وجو…"
            className="h-10 w-full bg-transparent ps-9 pe-3 text-sm text-fg outline-none placeholder:text-muted focus-visible:bg-elevated"
          />
        </div>
      )}
      <div id={listId} className="max-h-64 overflow-y-auto overscroll-contain p-2.5">
        {visible.length === 0 ? (
          <p className="px-1 py-3 text-center text-sm text-muted">گزینه‌ای با «{query}» پیدا نشد.</p>
        ) : (
          groups.map((group, index) => (
            <div key={`${group.name ?? ""}-${index}`} className="flex flex-col gap-2 py-1">
              {group.name && <p className="px-1 pt-1 text-xs font-medium text-muted">{group.name}</p>}
              {group.items.map((choice) => (
                <Checkbox
                  key={choice.value}
                  name={name}
                  value={choice.value}
                  label={choice.label}
                  checked={selected.has(choice.value)}
                  disabled={disabled}
                  onChange={(event) => toggle(choice.value, event.target.checked)}
                  onBlur={onBlur}
                />
              ))}
            </div>
          ))
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2 text-xs text-muted">
        <span aria-live="polite">
          {chosen.length ? `${formatNumber(chosen.length)} انتخاب‌شده` : "هنوز چیزی انتخاب نشده"}
          {needle && `، ${count(visible.length, "گزینه")} پیدا شد`}
        </span>
        {chosen.length > 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange([])}
            className="rounded-md text-accent-text hover:underline"
          >
            پاک کردن انتخاب‌ها
          </button>
        )}
      </div>
    </div>
  );
}
