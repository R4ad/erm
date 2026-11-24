import { createContext, useContext, useId, type ComponentProps, type ReactNode } from "react";

import { cn } from "@/lib/cn";

import { Icon } from "./icon";

// Field برچسب، راهنما و خطا را می‌سازد و شناسه‌هایشان را به کنترل درونش می‌دهد (htmlFor، aria-describedby،
// aria-invalid)؛ کنترل‌ها با register خود react-hook-form یا value/onChange عادی کار می‌کنند.

interface FieldContextValue {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

type AriaInvalid = boolean | "true" | "false" | "grammar" | "spelling" | undefined;

export function useFieldControl(props: { id?: string; "aria-describedby"?: string; "aria-invalid"?: AriaInvalid }) {
  const field = useContext(FieldContext);
  return {
    id: props.id ?? field?.id,
    "aria-describedby": [field?.describedBy, props["aria-describedby"]].filter(Boolean).join(" ") || undefined,
    "aria-invalid": (props["aria-invalid"] ?? (field?.invalid ? true : undefined)) as AriaInvalid,
    "aria-required": field?.required || undefined,
  } as const;
}

interface FieldProps {
  label: ReactNode;
  /** کنار برچسب در سمت پایان خط، بیرون از label: پیوند یا شمار (مثل «بازگرداندن پیشنهاد AI» در 12d). */
  aside?: ReactNode;
  hint?: ReactNode;
  error?: string | string[];
  required?: boolean;
  optionalLabel?: boolean;
  className?: string;
  id?: string;
  children: ReactNode;
}

// «Form Field» فیگما: برچسب همیشه دیده می‌شود (۱۳ Medium) و ستاره‌ی قرمز برای الزامی؛ راهنما و خطا زیر همان فیلد.
export function Field({ label, aside, hint, error, required = false, className, id, children }: FieldProps) {
  const generated = useId();
  const controlId = id ?? `field${generated}`;
  const messages = Array.isArray(error) ? error : error ? [error] : [];
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = messages.length ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <FieldContext.Provider value={{ id: controlId, describedBy, invalid: messages.length > 0, required }}>
      <div className={cn("flex flex-col gap-1.5", className)}>
        {aside ? (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <label htmlFor={controlId} className="flex items-center gap-1 text-sm font-medium text-ink">
              {label}
              {required && <RequiredMark />}
            </label>
            {aside}
          </div>
        ) : (
          <label htmlFor={controlId} className="flex items-center gap-1 text-sm font-medium text-ink">
            {label}
            {required && <RequiredMark />}
          </label>
        )}
        {children}
        {hint && !messages.length && (
          <p id={hintId} className="text-xs text-ink-3">
            {hint}
          </p>
        )}
        {hint && messages.length > 0 && (
          <p id={hintId} className="sr-only">
            {hint}
          </p>
        )}
        <FieldError id={errorId} messages={messages} />
      </div>
    </FieldContext.Provider>
  );
}

export function RequiredMark() {
  return (
    <span className="text-sm font-medium text-danger">
      <span aria-hidden>*</span>
      <span className="sr-only">اجباری</span>
    </span>
  );
}

export function FieldError({ id, messages }: { id?: string; messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p id={id} className="flex items-start gap-1 text-xs text-danger">
      <Icon name="warning" size={14} className="mt-0.5" />
      <span>{messages.join(" ")}</span>
    </p>
  );
}

/** ظاهر مشترک کنترل‌های فرم، برای کنترلی که خودش input نیست (مثل دکمه‌ی بازکننده‌ی انتخاب چندتایی). */
export const control =
  "w-full rounded-md border border-line-strong bg-panel text-base text-ink transition-[border-color,box-shadow] duration-150 " +
  "placeholder:text-ink-3 hover:border-ink-3 focus-visible:border-focus focus-visible:outline-none " +
  "focus-visible:shadow-[0_0_0_1px_var(--border-focus),var(--focus-ring)] " +
  "disabled:cursor-not-allowed disabled:bg-subtle disabled:opacity-70 " +
  "aria-invalid:border-danger-solid aria-invalid:shadow-[0_0_0_1px_var(--status-danger-solid)]";

export function Input({ className, ...props }: ComponentProps<"input">) {
  const aria = useFieldControl(props);
  return <input className={cn(control, "h-[2.625rem] px-3", className)} {...props} {...aria} />;
}

export function Textarea({ className, rows = 4, ...props }: ComponentProps<"textarea">) {
  const aria = useFieldControl(props);
  return (
    <textarea
      rows={rows}
      className={cn(control, "min-h-24 resize-y px-3 py-2 [field-sizing:content]", className)}
      {...props}
      {...aria}
    />
  );
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  const aria = useFieldControl(props);
  return (
    <div className="relative">
      <select className={cn(control, "h-[2.625rem] appearance-none ps-3 pe-10", className)} {...props} {...aria}>
        {children}
      </select>
      <Icon
        name="chevron-down"
        size={18}
        className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-ink-2"
      />
    </div>
  );
}

// «Choice» فیگما: گزینه‌ی کارتی (کل کارت قابل کلیک)، کنترل در سمت راست؛ انتخاب‌شده زمینه‌ی brand/subtle و حاشیه‌ی برند.
const box =
  "peer relative size-[1.125rem] shrink-0 cursor-pointer appearance-none border-[1.5px] border-line-strong bg-panel transition-[border-color,border-width,background-color] duration-150 " +
  "hover:border-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus " +
  "disabled:cursor-not-allowed disabled:opacity-50";

interface ChoiceProps extends Omit<ComponentProps<"input">, "type"> {
  label: ReactNode;
  description?: ReactNode;
  /** گزینه به شکل کارت قابل انتخاب، برای فهرست گزینه‌های یک پرسش. */
  card?: boolean;
}

function ChoiceLabel({ card, children }: { card: boolean; children: ReactNode }) {
  return (
    <label
      className={cn(
        "group flex cursor-pointer items-start gap-2.5 text-base",
        card &&
          "min-h-11 rounded-lg border border-line bg-panel px-3.5 py-2.5 transition-colors duration-150 hover:border-line-strong " +
            "has-checked:border-[1.5px] has-checked:border-brand has-checked:bg-brand-subtle has-focus-visible:shadow-focus",
      )}
    >
      {children}
    </label>
  );
}

/** خود کادر انتخاب بی‌برچسب، برای ردیفی که برچسبش را با aria-labelledby می‌دهد و دکمه‌ی دیگری کنارش دارد (مثل 12e). */
export function CheckboxControl({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  return (
    <span className="relative mt-[0.1875rem] inline-flex">
      <input
        type="checkbox"
        className={cn(box, "rounded-sm checked:border-brand checked:bg-brand", className)}
        {...props}
      />
      <Icon
        name="check"
        size={14}
        className="pointer-events-none absolute inset-0 m-auto text-white opacity-0 transition-opacity peer-checked:opacity-100"
      />
    </span>
  );
}

export function Checkbox({ label, description, card = false, className, ...props }: ChoiceProps) {
  return (
    <ChoiceLabel card={card}>
      <CheckboxControl className={className} {...props} />
      <ChoiceText label={label} description={description} />
    </ChoiceLabel>
  );
}

export function Radio({ label, description, card = false, className, ...props }: ChoiceProps) {
  return (
    <ChoiceLabel card={card}>
      <span className="relative mt-[0.1875rem] inline-flex">
        <input
          type="radio"
          className={cn(box, "rounded-full checked:border-[5.5px] checked:border-brand", className)}
          {...props}
        />
      </span>
      <ChoiceText label={label} description={description} />
    </ChoiceLabel>
  );
}

function ChoiceText({ label, description }: { label: ReactNode; description?: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="text-ink">{label}</span>
      {description && <span className="text-xs text-ink-3">{description}</span>}
    </span>
  );
}

interface FieldSetProps {
  legend: ReactNode;
  hint?: ReactNode;
  error?: string | string[];
  required?: boolean;
  className?: string;
  id?: string;
  children: ReactNode;
}

/** گروهی از کنترل‌ها با یک برچسب (fieldset و legend)، مثل گزینه‌های رادیویی یا انتخاب چندتایی. */
export function FieldSet({ legend, hint, error, required = false, className, id, children }: FieldSetProps) {
  const generated = useId();
  const baseId = id ?? `fieldset${generated}`;
  const messages = Array.isArray(error) ? error : error ? [error] : [];
  const hintId = hint ? `${baseId}-hint` : undefined;
  const errorId = messages.length ? `${baseId}-error` : undefined;
  return (
    <fieldset
      id={baseId}
      aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
      className={cn("min-w-0", className)}
    >
      <legend className="mb-1.5 flex items-center gap-1 text-sm font-medium text-ink">
        {legend}
        {required && <RequiredMark />}
      </legend>
      <div className="flex flex-col gap-2">
        {hint && (
          <p id={hintId} className="-mt-1 text-xs text-ink-3">
            {hint}
          </p>
        )}
        {children}
        <FieldError id={errorId} messages={messages} />
      </div>
    </fieldset>
  );
}
