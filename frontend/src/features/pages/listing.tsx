import { type UseQueryResult } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { PageSkeleton, Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { useSession } from "@/features/session/session";
import { faText } from "@/lib/format";
import { useDebouncedValue } from "@/lib/hooks";
import { formatJalali, parseJalali } from "@/lib/jalali";
import type { FormField, FormSchema, Listing } from "@/lib/types";

import { activeFilters } from "./page-data";

// صفحه‌های خواندنی جنگو (فهرست و پرونده) از راه /api/pages/. فیلترها و صفحه در نشانی صفحه‌اند و همان فرم فیلتر
// جنگو را دارند، پس نشانی رابط و صفحه‌ی جنگو یک فیلتر را یک‌جور می‌فهمند.

function SearchBox({ field, value, onSearch }: { field: FormField; value: string; onSearch: (value: string) => void }) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  // اگر نشانی از بیرون عوض شد (دکمه‌ی برگشت، پاک کردن فیلترها)، کادر هم همان را نشان دهد.
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }
  const typed = text.trim();
  const debounced = useDebouncedValue(typed, 350);
  useEffect(() => {
    if (debounced === typed && debounced !== value) onSearch(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- فقط وقتی تایپ متوقف شد
  }, [debounced]);
  return (
    <Field label={field.label}>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
        />
        <Input
          type="search"
          name={field.name}
          enterKeyHint="search"
          value={text}
          placeholder={field.placeholder}
          className="ps-10"
          onChange={(event) => setText(event.target.value)}
        />
      </div>
    </Field>
  );
}

/**
 * تیک فیلتر. تغییر نشانی با transition مسیریاب انجام می‌شود و تا آن تمام شود مقدار نشانی هنوز قبلی است؛ پس تیک
 * همان لحظه از دست کاربر عوض می‌شود و اگر نشانی از بیرون عوض شد (برگشت، پاک کردن فیلترها) دوباره با آن یکی می‌شود.
 */
function FilterCheckbox({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: boolean;
  onChange: (checked: boolean) => void;
}) {
  const [checked, setChecked] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setChecked(value);
  }
  return (
    <Checkbox
      name={field.name}
      label={field.label}
      checked={checked}
      onChange={(event) => {
        setChecked(event.target.checked);
        onChange(event.target.checked);
      }}
    />
  );
}

/**
 * تاریخ شمسی فیلتر (مثل «از تاریخ» سوابق ممیزی). نشانی فقط با تاریخ کامل و درست یا کادر خالی عوض می‌شود، نه با
 * هر رقمی که تایپ می‌شود؛ تاریخ نادرست را خود فرم جنگو هم رد می‌کند و خطایش زیر کادر می‌آید.
 */
function FilterDate({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: string;
  onChange: (value: string) => void;
}) {
  const { today } = useSession();
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }
  return (
    <Field label={field.label} error={field.errors.map(faText)}>
      <DatePicker
        name={field.name}
        value={text}
        today={parseJalali(today.jalali) ?? undefined}
        placeholder={field.placeholder ? faText(field.placeholder) : undefined}
        onChange={(next) => {
          setText(next);
          const date = parseJalali(next);
          if (date) onChange(formatJalali(date));
          else if (!next.trim()) onChange("");
        }}
      />
    </Field>
  );
}

interface FilterBarProps {
  schema: FormSchema | null | undefined;
  label: string;
}

/** فرم فیلتر جنگوی صفحه، همگام با نشانی: هر تغییر صفحه را به اول برمی‌گرداند. */
export function FilterBar({ schema, label }: FilterBarProps) {
  const [params, setParams] = useSearchParams();
  if (!schema?.fields.length) return null;
  const fields = schema.fields.filter((field) => field.kind !== "hidden");
  const active = activeFilters(schema, params);
  const defaults = schema.defaults ?? {};

  /** مقدار فیلتر در نشانی، یا اگر نیست همان پیش‌فرضی که view به کار برده است. */
  function current(name: string) {
    return params.get(name) ?? defaults[name] ?? "";
  }

  /** «همه» برای فیلتری که پیش‌فرض دارد پارامتر خالی است؛ برداشتن فیلتر (remove) پیش‌فرض را برمی‌گرداند. */
  function update(name: string, value: string, { replace = false, remove = false } = {}) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else if (name in defaults && !remove) next.set(name, "");
    else next.delete(name);
    next.delete("page");
    // خروج از کادر تاریخ همان تاریخ را دوباره می‌فرستد؛ نشانی یکسان دوباره ثبت نمی‌شود.
    if (next.toString() !== params.toString()) setParams(next, { replace });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = new URLSearchParams(params);
    // انتخاب‌ها و تیک‌ها همان لحظه در نشانی‌اند؛ Enter فقط متن و تاریخ را می‌فرستد.
    for (const field of fields.filter((item) => item.kind === "text" || item.kind === "date")) {
      const value = String(data.get(field.name) ?? "").trim();
      if (value) next.set(field.name, value);
      else next.delete(field.name);
    }
    next.delete("page");
    setParams(next);
  }

  const chips = active
    .filter((field) => field.kind !== "text")
    .map((field) => {
      if (field.kind === "checkbox") return { name: field.name, label: field.label };
      const value = params.get(field.name) ?? "";
      const choice = field.choices?.find((option) => option.value === value);
      return { name: field.name, label: `${field.label}: ${choice?.label ?? value}` };
    });

  return (
    <Card className="p-4 sm:p-5">
      <form role="search" aria-label={label} onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {fields.map((field) =>
            field.kind === "text" ? (
              <div key={field.name} className="md:col-span-2 xl:col-span-1">
                <SearchBox
                  field={field}
                  value={params.get(field.name) ?? ""}
                  onSearch={(value) => update(field.name, value, { replace: true })}
                />
              </div>
            ) : field.kind === "select" || field.kind === "radio" ? (
              <Field key={field.name} label={field.label} error={field.errors.map(faText)}>
                <Select
                  name={field.name}
                  value={current(field.name)}
                  onChange={(event) => update(field.name, event.target.value)}
                >
                  {/* فیلتر اجباری (نوع رکورد سوابق ممیزی) گزینه‌ی «همه» ندارد، مثل فرم جنگو. */}
                  {!field.required && (
                    <option value="">
                      {field.empty_label && !/^-+$/.test(field.empty_label) ? field.empty_label : "همه"}
                    </option>
                  )}
                  {(field.choices ?? []).map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : field.kind === "date" ? (
              <FilterDate
                key={field.name}
                field={field}
                value={params.get(field.name) ?? ""}
                onChange={(value) => update(field.name, value, { replace: true })}
              />
            ) : field.kind === "checkbox" ? (
              // هم‌تراز با پایین کادرهای کنارش، که برچسبشان بالای کادر است.
              <div key={field.name} className="flex items-end pb-2">
                <FilterCheckbox
                  field={field}
                  value={Boolean(params.get(field.name))}
                  onChange={(checked) => update(field.name, checked ? "on" : "")}
                />
              </div>
            ) : null,
          )}
        </div>
        {(chips.length > 0 || active.length > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            {chips.length > 0 && (
              <ul className="flex flex-wrap items-center gap-2" aria-label="فیلترهای فعال">
                {chips.map((chip) => (
                  <li key={chip.name}>
                    <button
                      type="button"
                      onClick={() => update(chip.name, "", { remove: true })}
                      className="inline-flex h-7 items-center gap-1.5 rounded-full border border-accent-line/60 bg-accent-soft ps-3 pe-2 text-xs text-fg transition-colors hover:border-accent"
                      aria-label={`برداشتن فیلتر ${chip.label}`}
                    >
                      {chip.label}
                      <X aria-hidden className="size-3.5 text-muted" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Button
              variant="link"
              size="sm"
              className="ms-auto text-xs"
              onClick={() => setParams(new URLSearchParams())}
            >
              پاک کردن همه‌ی فیلترها
            </Button>
          </div>
        )}
        <button type="submit" className="sr-only">
          جست‌وجو
        </button>
      </form>
    </Card>
  );
}

export function TableSkeleton({ label, rows = 6 }: { label: string; rows?: number }) {
  return (
    <Card className="overflow-clip">
      <div role="status" className="flex flex-col divide-y divide-line">
        <span className="sr-only">{label}</span>
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center gap-6 px-5 py-4">
            <Skeleton className="h-4 w-24" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full max-sm:hidden" />
          </div>
        ))}
      </div>
    </Card>
  );
}

interface ListBodyProps<T, D extends Listing<T>> {
  query: UseQueryResult<D> & { path: string };
  /** نام چیزهای فهرست برای متن خواندن و صفحه‌ها، مثل «شواهد». */
  label: string;
  filtered: boolean;
  empty: { icon: ReactNode; title: string; filteredTitle?: string; description?: string };
  children: (data: D) => ReactNode;
}

/** بدنه‌ی هر فهرست: در حال خواندن، خطا، خالی، جدول و صفحه‌ها. */
export function ListBody<T, D extends Listing<T>>({ query, label, filtered, empty, children }: ListBodyProps<T, D>) {
  const [params, setParams] = useSearchParams();
  const data = query.data;
  if (query.isPending) return <TableSkeleton label={`در حال خواندن ${label}…`} />;
  if (query.isError && !data) return <ErrorState error={query.error} retry={() => query.refetch()} />;
  if (!data) return null;
  if (!data.results.length) {
    return (
      <EmptyState
        icon={empty.icon}
        title={filtered ? (empty.filteredTitle ?? "با این فیلترها چیزی پیدا نشد") : empty.title}
        description={filtered ? "فیلترها را کم کنید یا عبارت جست‌وجو را کوتاه‌تر بنویسید." : empty.description}
        action={
          filtered && (
            <Button variant="secondary" onClick={() => setParams(new URLSearchParams())}>
              پاک کردن فیلترها
            </Button>
          )
        }
      />
    );
  }
  const fetching = query.isFetching && query.isPlaceholderData;
  return (
    <div className="flex flex-col gap-4">
      {data.filters?.errors.map((error) => (
        <p key={error} className="text-sm text-danger">
          {faText(error)}
        </p>
      ))}
      <Card
        className={cn("table-shell overflow-clip transition-opacity", fetching && "opacity-60")}
        aria-busy={query.isFetching}
      >
        {children(data)}
      </Card>
      <Pagination
        page={data.page}
        pages={data.pages}
        label={`صفحه‌های ${label}`}
        onChange={(page) => {
          const next = new URLSearchParams(params);
          next.set("page", String(page));
          setParams(next);
          window.scrollTo({ top: 0 });
        }}
      />
    </div>
  );
}

/** صفحه‌ی پرونده: در حال خواندن یا خطا، با همان سرصفحه. */
export function DetailState({ query, header }: { query: UseQueryResult<unknown>; header: ReactNode }) {
  if (query.isPending) return <PageSkeleton rows={6} />;
  return (
    <div className="flex flex-col gap-6">
      {header}
      <ErrorState error={query.error} retry={() => query.refetch()} />
    </div>
  );
}
