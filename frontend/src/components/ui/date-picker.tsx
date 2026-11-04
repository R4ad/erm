import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Popover } from "radix-ui";
import { useEffect, useId, useRef, useState, type ComponentProps, type KeyboardEvent } from "react";

import { cn } from "@/lib/cn";
import { fa } from "@/lib/format";
import { locale } from "@/lib/i18n";
import {
  addDays,
  addMonths,
  describeJalali,
  formatJalali,
  latinDigits,
  MONTH_NAMES,
  monthLength,
  parseJalali,
  sameDay,
  toJalali,
  weekdayIndex,
  WEEKDAYS,
  type JalaliDate,
} from "@/lib/jalali";

import { Input } from "./field";

// تاریخ شمسی به همان شکلی که فرم جنگو می‌گیرد (1405/08/13). کادر متن برای تایپ است و تقویم برای انتخاب؛ هر دو
// یک مقدار دارند و اعتبارسنجی نهایی با خود فرم جنگوست.

interface CalendarProps {
  selected: JalaliDate | null;
  today: JalaliDate;
  onSelect: (date: JalaliDate) => void;
}

/** جدول یک ماه، با پیمایش صفحه‌کلید الگوی date picker دستورالعمل ARIA؛ در راست‌به‌چپ، چپ یعنی روز بعد. */
export function Calendar({ selected, today, onSelect }: CalendarProps) {
  const [focused, setFocused] = useState<JalaliDate>(selected ?? today);
  const grid = useRef<HTMLTableElement>(null);
  const moveFocus = useRef(false);
  const titleId = useId();
  const rtl = locale.dir === "rtl";

  // بعد از جابه‌جایی با صفحه‌کلید، فوکوس روی دکمه‌ی روز تازه می‌رود؛ با کلیک روی ماه بعد فوکوس همان‌جا می‌ماند.
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    grid.current?.querySelector<HTMLButtonElement>("button[tabindex='0']")?.focus();
  });

  function go(date: JalaliDate, focus = true) {
    moveFocus.current = focus;
    setFocused(date);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTableElement>) {
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const back = rtl ? "ArrowRight" : "ArrowLeft";
    const moves: Record<string, () => JalaliDate> = {
      [forward]: () => addDays(focused, 1),
      [back]: () => addDays(focused, -1),
      ArrowDown: () => addDays(focused, 7),
      ArrowUp: () => addDays(focused, -7),
      Home: () => addDays(focused, -weekdayIndex(focused)),
      End: () => addDays(focused, 6 - weekdayIndex(focused)),
      PageDown: () => addMonths(focused, event.shiftKey ? 12 : 1),
      PageUp: () => addMonths(focused, event.shiftKey ? -12 : -1),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    go(move());
  }

  const { year, month } = focused;
  const first = { year, month, day: 1 };
  const offset = weekdayIndex(first);
  const length = monthLength(year, month);
  const cells: (JalaliDate | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length }, (_, index) => ({ year, month, day: index + 1 })),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));

  const nav = "grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-fg";
  const flip = "ltr:-scale-x-100";

  return (
    <div className="flex w-[18.5rem] max-w-full flex-col gap-3">
      <div className="flex items-center justify-between gap-1">
        <div className="flex">
          <button type="button" className={nav} aria-label="سال قبل" onClick={() => go(addMonths(focused, -12), false)}>
            <ChevronsRight aria-hidden className={cn("size-4", flip)} />
          </button>
          <button type="button" className={nav} aria-label="ماه قبل" onClick={() => go(addMonths(focused, -1), false)}>
            <ChevronRight aria-hidden className={cn("size-4", flip)} />
          </button>
        </div>
        <p id={titleId} aria-live="polite" className="text-sm font-semibold text-fg">
          {MONTH_NAMES[month - 1]} {fa(year)}
        </p>
        <div className="flex">
          <button type="button" className={nav} aria-label="ماه بعد" onClick={() => go(addMonths(focused, 1), false)}>
            <ChevronLeft aria-hidden className={cn("size-4", flip)} />
          </button>
          <button type="button" className={nav} aria-label="سال بعد" onClick={() => go(addMonths(focused, 12), false)}>
            <ChevronsLeft aria-hidden className={cn("size-4", flip)} />
          </button>
        </div>
      </div>
      {/* الگوی date picker در WAI-ARIA APG: جدول با نقش grid و جابه‌جایی با کلیدهای جهت. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role */}
      <table ref={grid} role="grid" aria-labelledby={titleId} className="w-full border-collapse" onKeyDown={onKeyDown}>
        <thead>
          <tr>
            {WEEKDAYS.map((name) => (
              <th
                key={name}
                scope="col"
                abbr={name}
                className="pb-1 text-center text-[0.6875rem] font-medium text-muted"
              >
                {name.slice(0, 1)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, row) => (
            <tr key={row}>
              {week.map((date, column) => {
                if (!date) return <td key={column} />;
                const isSelected = sameDay(date, selected);
                const isToday = sameDay(date, today);
                const isFocused = sameDay(date, focused);
                return (
                  <td key={column} role="gridcell" aria-selected={isSelected} className="p-0.5 text-center">
                    <button
                      type="button"
                      tabIndex={isFocused ? 0 : -1}
                      aria-label={describeJalali(date)}
                      aria-current={isToday ? "date" : undefined}
                      onClick={() => onSelect(date)}
                      onFocus={() => !isFocused && setFocused(date)}
                      className={cn(
                        "grid size-9 place-items-center rounded-lg text-sm tabular transition-colors",
                        "hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                        isToday && "font-semibold text-accent-text ring-1 ring-accent-line ring-inset",
                        isSelected && "bg-accent text-accent-fg ring-0 hover:bg-accent-hover",
                      )}
                    >
                      {fa(date.day)}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between border-t border-line pt-2 text-xs">
        <button
          type="button"
          className="rounded-md px-1.5 py-1 text-accent-text hover:underline"
          onClick={() => onSelect(today)}
        >
          امروز، {describeJalali(today)}
        </button>
      </div>
    </div>
  );
}

interface DatePickerProps extends Omit<ComponentProps<"input">, "value" | "onChange" | "type"> {
  value: string;
  onChange: (value: string) => void;
  /** امروز برای نشانه‌گذاری تقویم؛ پیش‌فرض ساعت همین دستگاه. */
  today?: JalaliDate;
}

/** کادر تاریخ شمسی با تقویم. متن تایپ‌شده هم پذیرفته است و رقم فارسی هنگام خروج از کادر لاتین می‌شود. */
export function DatePicker({ value, onChange, onBlur, today, disabled, className, ...props }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const readoutId = useId();
  const parsed = parseJalali(value);
  const now = today ?? toJalali(new Date());

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <Input
          {...props}
          type="text"
          dir="ltr"
          inputMode="numeric"
          autoComplete="off"
          value={value}
          disabled={disabled}
          aria-describedby={
            [props["aria-describedby"], parsed ? readoutId : undefined].filter(Boolean).join(" ") || undefined
          }
          className={cn("pe-12 text-right tabular", className)}
          onChange={(event) => onChange(event.target.value)}
          onBlur={(event) => {
            const date = parseJalali(value);
            if (date) onChange(formatJalali(date));
            else if (value !== latinDigits(value)) onChange(latinDigits(value));
            onBlur?.(event);
          }}
        />
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger
            type="button"
            disabled={disabled}
            aria-label="انتخاب تاریخ از تقویم"
            className="absolute end-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-fg disabled:opacity-50"
          >
            <CalendarDays aria-hidden className="size-[1.125rem]" />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="end"
              sideOffset={8}
              collisionPadding={12}
              aria-label="تقویم"
              onOpenAutoFocus={(event) => {
                // فوکوس به‌جای دکمه‌ی «سال قبل» روی روز انتخاب‌شده یا امروز می‌رود.
                event.preventDefault();
                const content = event.currentTarget as HTMLElement | null;
                requestAnimationFrame(() =>
                  content?.querySelector<HTMLButtonElement>("table button[tabindex='0']")?.focus(),
                );
              }}
              className={cn(
                "z-50 rounded-2xl border border-line bg-elevated p-3 text-fg shadow-pop",
                "origin-(--radix-popover-content-transform-origin) data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in",
              )}
            >
              <Calendar
                selected={parsed}
                today={now}
                onSelect={(date) => {
                  onChange(formatJalali(date));
                  setOpen(false);
                }}
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
      {parsed && (
        <p id={readoutId} className="text-xs text-muted">
          {describeJalali(parsed)}
        </p>
      )}
    </div>
  );
}
