import { Check, ChevronDown, CircleAlert } from "lucide-react";
import { createContext, useContext, useId, type ComponentProps, type ReactNode } from "react";

import { cn } from "@/lib/cn";

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
  hint?: ReactNode;
  error?: string | string[];
  required?: boolean;
  optionalLabel?: boolean;
  className?: string;
  id?: string;
  children: ReactNode;
}

export function Field({ label, hint, error, required = false, className, id, children }: FieldProps) {
  const generated = useId();
  const controlId = id ?? `field${generated}`;
  const messages = Array.isArray(error) ? error : error ? [error] : [];
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = messages.length ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <FieldContext.Provider value={{ id: controlId, describedBy, invalid: messages.length > 0, required }}>
      <div className={cn("flex flex-col gap-1.5", className)}>
        <label htmlFor={controlId} className="flex items-center gap-2 text-sm font-medium text-fg">
          {label}
          {required && <RequiredMark />}
        </label>
        {hint && (
          <p id={hintId} className="text-xs text-muted">
            {hint}
          </p>
        )}
        {children}
        <FieldError id={errorId} messages={messages} />
      </div>
    </FieldContext.Provider>
  );
}

export function RequiredMark() {
  return (
    <span className="rounded-md bg-accent-soft px-1.5 py-px text-[0.6875rem] font-medium text-accent-text">اجباری</span>
  );
}

export function FieldError({ id, messages }: { id?: string; messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p id={id} className="flex items-start gap-1.5 text-xs font-medium text-danger">
      <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>{messages.join(" ")}</span>
    </p>
  );
}

const control =
  "w-full rounded-xl border border-line bg-surface text-sm text-fg shadow-card transition-[border-color,box-shadow,background-color] duration-150 " +
  "placeholder:text-muted hover:border-line-strong focus-visible:border-accent-line focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-soft " +
  "disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger/70 aria-invalid:focus-visible:ring-danger-soft";

export function Input({ className, ...props }: ComponentProps<"input">) {
  const aria = useFieldControl(props);
  return <input className={cn(control, "h-10 px-3.5", className)} {...props} {...aria} />;
}

export function Textarea({ className, rows = 4, ...props }: ComponentProps<"textarea">) {
  const aria = useFieldControl(props);
  return (
    <textarea
      rows={rows}
      className={cn(control, "min-h-24 resize-y px-3.5 py-2.5 leading-7 [field-sizing:content]", className)}
      {...props}
      {...aria}
    />
  );
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  const aria = useFieldControl(props);
  return (
    <div className="relative">
      <select className={cn(control, "h-10 appearance-none ps-3.5 pe-10", className)} {...props} {...aria}>
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted"
      />
    </div>
  );
}

const box =
  "peer relative size-[1.125rem] shrink-0 cursor-pointer appearance-none border border-line-strong bg-surface transition-colors duration-150 " +
  "checked:border-accent checked:bg-accent hover:border-accent-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring " +
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
        "group flex cursor-pointer items-start gap-3 text-sm",
        card &&
          "rounded-xl border border-line bg-surface/60 px-3.5 py-3 transition-colors duration-150 hover:border-line-strong " +
            "has-checked:border-accent-line has-checked:bg-accent-soft has-focus-visible:border-accent-line",
      )}
    >
      {children}
    </label>
  );
}

export function Checkbox({ label, description, card = false, className, ...props }: ChoiceProps) {
  return (
    <ChoiceLabel card={card}>
      <span className="relative mt-[0.1875rem] inline-flex">
        <input type="checkbox" className={cn(box, "rounded-[0.3125rem]", className)} {...props} />
        <Check
          aria-hidden
          strokeWidth={3}
          className="pointer-events-none absolute inset-0 m-auto size-3 text-accent-fg opacity-0 transition-opacity peer-checked:opacity-100"
        />
      </span>
      <ChoiceText label={label} description={description} />
    </ChoiceLabel>
  );
}

export function Radio({ label, description, card = false, className, ...props }: ChoiceProps) {
  return (
    <ChoiceLabel card={card}>
      <span className="relative mt-[0.1875rem] inline-flex">
        <input type="radio" className={cn(box, "rounded-full", className)} {...props} />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 m-auto size-1.5 rounded-full bg-accent-fg opacity-0 transition-opacity peer-checked:opacity-100"
        />
      </span>
      <ChoiceText label={label} description={description} />
    </ChoiceLabel>
  );
}

function ChoiceText({ label, description }: { label: ReactNode; description?: ReactNode }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-fg">{label}</span>
      {description && <span className="text-xs text-muted">{description}</span>}
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
      <legend className="mb-1.5 flex items-center gap-2 text-sm font-medium text-fg">
        {legend}
        {required && <RequiredMark />}
      </legend>
      <div className="flex flex-col gap-2">
        {hint && (
          <p id={hintId} className="-mt-1 text-xs text-muted">
            {hint}
          </p>
        )}
        {children}
        <FieldError id={errorId} messages={messages} />
      </div>
    </fieldset>
  );
}
