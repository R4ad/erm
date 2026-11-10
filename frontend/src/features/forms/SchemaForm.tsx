import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useController, useForm, useFormState, useWatch, type Control } from "react-hook-form";

import { AppLink } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { useGoTo } from "@/features/session/links";
import { ApiError, bridge, errorMessage, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { faText, formatNumber } from "@/lib/format";
import type { JalaliDate } from "@/lib/jalali";
import type { AppHref, FormField, FormResult, FormSchema } from "@/lib/types";

import { FieldControl } from "./field-control";
import { LeaveGuard } from "./leave-guard";
import { editable, formSchema, initialValues, needsMultipart, toFormData, toJson, type FormValues } from "./schema";

// فرم عمومی هر صفحه‌ی فرم جنگو از روی توصیف همان فرم. کنترل هر فیلد از نوعش می‌آید، خطاهای جنگو کنار همان فیلد
// می‌نشیند و بعد از ذخیره پیام جنگو نشان داده می‌شود و کاربر به همان صفحه‌ای می‌رود که جنگو گفته است.

const fieldId = (name: string) => `field-${name}`;

interface SchemaFieldProps {
  field: FormField;
  control: Control<FormValues>;
  today?: JalaliDate;
}

/** هر فیلد با useController خودش مشترک وضعیت همان فیلد است؛ پس با React Compiler خطا و مقدارش تازه می‌ماند. */
function SchemaField({ field, control, today }: SchemaFieldProps) {
  // ref جدا گرفته می‌شود تا بقیه‌ی مقدارهای کنترل در رندر خواندنی بمانند (قاعده‌ی react-hooks/refs).
  const {
    field: { ref, name, value, onChange, onBlur },
    fieldState,
  } = useController({ name: field.name, control });
  return (
    <FieldControl
      field={field}
      id={fieldId(field.name)}
      name={name}
      ref={ref}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      error={fieldState.error?.message}
      today={today}
    />
  );
}

interface SchemaFormProps {
  schema: FormSchema;
  /** نشانی جنگوی صفحه‌ی فرم؛ فرم به همان view جنگو فرستاده می‌شود. */
  path: string;
  submitLabel?: string;
  submitIcon?: ReactNode;
  cancel?: AppHref | null;
  /** بعد از ذخیره؛ پیش‌فرض رفتن به همان صفحه‌ای است که جنگو گفته است. */
  onSaved?: (result: FormResult) => void;
  today?: JalaliDate;
  /** چیزی میان فیلدها و دکمه‌ها، مثل توضیح پیامد. */
  footer?: ReactNode;
  /**
   * چیدمان دلخواه فیلدها برای فرم‌هایی مثل پروفایل پیامد؛ field(name) کنترل همان فیلد را می‌دهد. بی آن، فیلدها
   * پشت سر هم می‌آیند.
   */
  layout?: (field: (name: string) => ReactNode) => ReactNode;
  /** نام فیلد در خلاصه‌ی خطاها، وقتی برچسب خودش تنها کافی نیست (مثل «سطح» در چند ردیف). */
  summaryLabel?: (field: FormField) => string;
  /** دکمه‌ها در فرم بلند پایین صفحه می‌مانند تا ذخیره بی‌رفتن به ته فرم در دسترس باشد. */
  stickyActions?: boolean;
  scenarioCreate?: boolean;
}

function ScenarioFields({
  field,
  fields,
  control,
}: {
  field: (name: string) => ReactNode;
  fields: FormField[];
  control: Control<FormValues>;
}) {
  const values = useWatch({ control });
  const newService = Boolean(values.new_service);
  const service = newService
    ? values.new_service_name
    : fields
        .find((item) => item.name === "service")
        ?.choices?.find((choice) => choice.value === values.service)
        ?.label.replace(/ \([^()]*\)$/, "");
  const part = (value: unknown, placeholder: string) =>
    typeof value === "string" && value.trim() ? value.trim() : `[${placeholder}]`;
  const preview = `در خدمت یا فرآیند ${part(service, "نام")}، به علت یا در شرایط ${part(values.conditions, "عامل و وضعیت")}، ممکن است ${part(values.event, "رویداد مشخص")} رخ دهد و انجام ${part(values.objective, "هدف یا تعهد")} برای ${part(values.customer_text, "داتین یا مشتری")} را مختل کند. پیامد قابل مشاهده آن ${part(values.consequence, "نوع و دامنه پیامد")} است.`;
  return (
    <div className="flex flex-col gap-5">
      {field("new_service")}
      {newService ? (
        <div className="flex flex-col gap-5 rounded-xl border border-line p-4">
          <p className="text-sm text-muted">برای ثبت خدمت جدید، مشخصات ضروری آن را وارد کنید.</p>
          {["code", "name", "kind", "org_unit", "owner", "lifecycle_stage", "environment"].map((name) =>
            field(`new_service_${name}`),
          )}
        </div>
      ) : (
        field("service")
      )}
      {["conditions", "event", "objective", "customer_text", "consequence", "category"].map(field)}
      <section aria-label="پیش‌نمایش سناریو" className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-semibold">پیش‌نمایش سناریو</h2>
        <p className="mt-2 text-sm leading-8 whitespace-pre-line">{preview}</p>
      </section>
    </div>
  );
}

export function SchemaForm({
  schema,
  path,
  submitLabel = "ذخیره",
  submitIcon = <Save aria-hidden />,
  cancel,
  onSaved,
  today,
  footer,
  layout,
  summaryLabel = (field) => field.label,
  stickyActions = false,
  scenarioCreate = false,
}: SchemaFormProps) {
  const fields = schema.fields;
  const byName = new Map(fields.map((field) => [field.name, field]));
  const form = useForm<FormValues>({
    defaultValues: initialValues(fields),
    resolver: zodResolver(formSchema(fields)),
    reValidateMode: "onChange",
    // فوکوس بعد از فرستادن ناموفق روی خلاصه‌ی خطاهاست (پایین‌تر)، نه اولین فیلد؛ خلاصه به همه‌ی فیلدها پیوند دارد.
    shouldFocusError: false,
  });
  const formState = useFormState({ control: form.control });
  const [problems, setProblems] = useState<string[]>(schema.errors);
  const [attempt, setAttempt] = useState(0);
  const summary = useRef<HTMLDivElement>(null);
  const focusSummary = useRef(false);
  const released = useRef(false);
  const queryClient = useQueryClient();
  const toast = useToast();
  const goTo = useGoTo();
  const multipart = needsMultipart(fields, schema.multipart);

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      post<FormResult>(bridge("forms", path), multipart ? toFormData(fields, values) : toJson(fields, values)),
    onSuccess: (result) => {
      toast({ title: faText(result.message) });
      // هر صفحه‌ای که این ذخیره عوضش کرده باشد دوباره خوانده می‌شود.
      queryClient.removeQueries({ queryKey: ["form"] });
      void queryClient.invalidateQueries();
      // جواب ممکن است پیش از رندرِ «در حال ذخیره» برسد؛ پس رفتن بعد از ذخیره صریحاً از پرسش ترک صفحه آزاد است.
      released.current = true;
      if (onSaved) onSaved(result);
      else goTo(result.redirect, cancel?.route ?? "/");
    },
    onError: (error) => {
      const messages: string[] = [];
      if (error instanceof ApiError && error.status === 400) {
        for (const [name, list] of Object.entries(error.errors)) {
          const field = byName.get(name);
          if (field && editable(field)) form.setError(name, { type: "server", message: list.join(" ") });
          else messages.push(...list);
        }
        if (!Object.keys(error.errors).length) messages.push(error.message);
      } else {
        messages.push(errorMessage(error));
      }
      setProblems(messages);
      failed();
    },
  });

  function failed() {
    focusSummary.current = true;
    setAttempt((count) => count + 1);
  }

  // بعد از هر فرستادن ناموفق، فوکوس روی خلاصه‌ی خطاها می‌رود تا صفحه‌خوان و صفحه‌کلید از آن‌جا شروع کنند. خطاهای
  // فیلدها ممکن است یک رندر بعد از شمارش تلاش برسند، پس فوکوس وقتی داده می‌شود که خلاصه واقعاً روی صفحه باشد.
  useEffect(() => {
    if (focusSummary.current && summary.current) {
      focusSummary.current = false;
      summary.current.focus();
    }
  });

  const invalid = fields.filter((field) => form.getFieldState(field.name, formState).error);
  const showSummary = attempt > 0 && (invalid.length > 0 || problems.length > 0);

  function focusField(name: string) {
    const element = document.getElementById(fieldId(name));
    element?.scrollIntoView({ block: "center" });
    const target = element?.matches("input, select, textarea")
      ? element
      : element?.querySelector<HTMLElement>("input, select, textarea, button");
    target?.focus({ preventScroll: true });
  }

  return (
    <>
      <form
        noValidate
        encType={multipart ? "multipart/form-data" : undefined}
        aria-busy={save.isPending}
        className="flex flex-col gap-6"
        onSubmit={(event) =>
          void form.handleSubmit(
            (values) => {
              setProblems([]);
              save.mutate(values);
            },
            () => {
              setProblems([]);
              failed();
            },
          )(event)
        }
      >
        {showSummary && (
          <Alert
            ref={summary}
            tabIndex={-1}
            role="alert"
            tone="danger"
            className="outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
            title={invalid.length ? `${formatNumber(invalid.length)} مورد فرم درست نیست:` : "فرم ذخیره نشد."}
          >
            <ul className="mt-1 flex flex-col gap-1">
              {problems.map((problem) => (
                <li key={problem}>{faText(problem)}</li>
              ))}
              {invalid.map((field) => (
                <li key={field.name}>
                  <a
                    href={`#${fieldId(field.name)}`}
                    className="text-fg underline underline-offset-4 hover:text-danger"
                    onClick={(event) => {
                      event.preventDefault();
                      focusField(field.name);
                    }}
                  >
                    {summaryLabel(field)}: {form.getFieldState(field.name, formState).error?.message}
                  </a>
                </li>
              ))}
            </ul>
          </Alert>
        )}

        {scenarioCreate ? (
          <ScenarioFields
            fields={fields}
            control={form.control}
            field={(name) => {
              const field = byName.get(name);
              return field ? <SchemaField key={name} field={field} control={form.control} today={today} /> : null;
            }}
          />
        ) : layout ? (
          layout((name) => {
            const field = byName.get(name);
            return field ? <SchemaField key={name} field={field} control={form.control} today={today} /> : null;
          })
        ) : (
          <div className="flex flex-col gap-5">
            {fields.map((field) => (
              <SchemaField key={field.name} field={field} control={form.control} today={today} />
            ))}
          </div>
        )}

        {footer}

        <div
          className={cn(
            "flex flex-wrap items-center gap-2 border-t border-line pt-5",
            stickyActions &&
              "sticky bottom-0 z-10 -mx-1 bg-canvas/90 px-1 pb-4 backdrop-blur supports-[backdrop-filter]:bg-canvas/75",
          )}
        >
          <Button type="submit" variant="primary" loading={save.isPending}>
            {!save.isPending && submitIcon}
            {submitLabel}
          </Button>
          {cancel && (
            <AppLink href={cancel.href} button={{ variant: "secondary" }}>
              انصراف
            </AppLink>
          )}
        </div>
      </form>
      {/* بعد از ذخیره پرسشی نمی‌آید؛ هنگام ذخیره هم نه، چون رفتن را خود فرم انجام می‌دهد. */}
      <LeaveGuard when={formState.isDirty && !save.isPending && !save.isSuccess} released={released} />
    </>
  );
}
