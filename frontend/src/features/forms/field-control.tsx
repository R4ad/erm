import type { RefCallBack } from "react-hook-form";

import { DatePicker } from "@/components/ui/date-picker";
import { Checkbox, Field, FieldError, FieldSet, Input, Radio, Select, Textarea } from "@/components/ui/field";
import { FileInput } from "@/components/ui/file-input";
import { MultiSelect } from "@/components/ui/multi-select";
import { faText } from "@/lib/format";
import type { JalaliDate } from "@/lib/jalali";
import type { FieldValue, FormChoice, FormField } from "@/lib/types";

// کنترل یک فیلد توصیف‌شده‌ی فرم جنگو، از روی نوعش (متن، انتخاب، چندتایی، تاریخ شمسی، فایل و...). فرم عمومی
// (SchemaForm) آن را با react-hook-form می‌گیرد و کادرهای کار در پرونده‌ها (امضای پذیرش، تغییر وضعیت اقدام) با state
// خودشان.

/** «---------» پیش‌فرض جنگو برای گزینه‌ی خالی، در رابط «انتخاب کنید» است. */
function emptyLabel(label: string | undefined) {
  return !label || /^-+$/.test(label.trim()) ? "انتخاب کنید" : label;
}

function grouped(choices: FormChoice[]) {
  const groups: { name: string | undefined; items: FormChoice[] }[] = [];
  for (const choice of choices) {
    const last = groups.at(-1);
    if (last && last.name === choice.group) last.items.push(choice);
    else groups.push({ name: choice.group, items: [choice] });
  }
  return groups;
}

export interface FieldControlProps {
  field: FormField;
  value: FieldValue | undefined;
  onChange: (value: FieldValue) => void;
  onBlur?: () => void;
  error?: string;
  today?: JalaliDate;
  /** شناسه‌ی کنترل، برای پیوند خلاصه‌ی خطاها و تمرکز روی فیلد. */
  id?: string;
  /** نام کنترل در فرم؛ پیش‌فرض نام فیلد جنگو. */
  name?: string;
  ref?: RefCallBack;
}

export function FieldControl({
  field,
  value,
  onChange,
  onBlur,
  error,
  today,
  id = `field-${field.name}`,
  name = field.name,
  ref,
}: FieldControlProps) {
  const common = { label: field.label, hint: field.help || undefined, error, required: field.required };

  switch (field.kind) {
    case "hidden":
      return null;
    case "checkbox":
      return (
        <div className="flex flex-col gap-1.5">
          <Checkbox
            id={id}
            ref={ref}
            name={name}
            label={field.label}
            description={field.help || undefined}
            checked={Boolean(value)}
            disabled={field.disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(event) => onChange(event.target.checked)}
            onBlur={onBlur}
          />
          <FieldError id={`${id}-error`} messages={error ? [error] : []} />
        </div>
      );
    case "radio":
      return (
        <FieldSet id={id} legend={field.label} hint={common.hint} error={error} required={field.required}>
          <div className="flex flex-col gap-2">
            {(field.choices ?? []).map((choice) => (
              <Radio
                key={choice.value}
                card
                name={name}
                value={choice.value}
                label={choice.label}
                checked={value === choice.value}
                disabled={field.disabled}
                onChange={() => onChange(choice.value)}
                onBlur={onBlur}
              />
            ))}
          </div>
        </FieldSet>
      );
    case "multiselect":
      return (
        <FieldSet id={id} legend={field.label} hint={common.hint} error={error} required={field.required}>
          <MultiSelect
            name={name}
            label={field.label}
            choices={field.choices ?? []}
            value={Array.isArray(value) ? value : []}
            disabled={field.disabled}
            invalid={Boolean(error)}
            onChange={onChange}
            onBlur={onBlur}
          />
        </FieldSet>
      );
    case "select":
      return (
        <Field id={id} {...common}>
          <Select
            ref={ref}
            name={name}
            value={typeof value === "string" ? value : ""}
            disabled={field.disabled}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onBlur}
          >
            {field.empty_label !== undefined && <option value="">{emptyLabel(field.empty_label)}</option>}
            {grouped(field.choices ?? []).map((group, index) =>
              group.name ? (
                <optgroup key={`${group.name}-${index}`} label={group.name}>
                  {group.items.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </optgroup>
              ) : (
                group.items.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))
              ),
            )}
          </Select>
        </Field>
      );
    case "textarea":
      return (
        <Field id={id} {...common}>
          <Textarea
            ref={ref}
            name={name}
            rows={field.rows}
            maxLength={field.max_length}
            placeholder={field.placeholder}
            value={typeof value === "string" ? value : ""}
            disabled={field.disabled}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onBlur}
          />
        </Field>
      );
    case "date":
      return (
        <Field id={id} {...common}>
          <DatePicker
            ref={ref}
            name={name}
            today={today}
            placeholder={field.placeholder ? faText(field.placeholder) : undefined}
            value={typeof value === "string" ? value : ""}
            disabled={field.disabled}
            onChange={onChange}
            onBlur={onBlur}
          />
        </Field>
      );
    case "file":
      return (
        <Field id={id} {...common}>
          <FileInput
            ref={ref}
            name={name}
            accept={field.accept}
            maxSize={field.max_size}
            value={value instanceof File ? value : null}
            disabled={field.disabled}
            onChange={onChange}
            onBlur={onBlur}
          />
        </Field>
      );
    default:
      return (
        <Field id={id} {...common}>
          <Input
            ref={ref}
            name={name}
            type={field.kind}
            dir={field.kind === "url" || field.kind === "email" ? "ltr" : undefined}
            inputMode={field.kind === "number" ? "decimal" : undefined}
            maxLength={field.max_length}
            placeholder={field.placeholder}
            value={typeof value === "string" ? value : ""}
            disabled={field.disabled}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onBlur}
          />
        </Field>
      );
  }
}
