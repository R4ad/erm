import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useBlocker, useNavigate, useSearchParams } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, FieldError, Input, RequiredMark, Select } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ProcessSteps, type StepState } from "@/components/ui/process-step";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Alert, ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ApiError, get, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { daysLeft, fa, faText, shortDate } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type {
  IdentificationChoices,
  IdentificationPage as PageData,
  IdentificationPart,
  IdentificationRow,
  IdentificationTextField,
  IdentificationValues,
  Moment,
} from "@/lib/types";

import { entryChecks, similarScenarios, type Match } from "./identification";

// «شناسایی ریسک» به چیدمان فیگما ۱۱: گام‌نمای فرایند، فرم ورودی مدیر واحد با پیش‌نمایش زنده‌ی جمله‌ی سناریو، پرسش‌های
// جلسه‌ی شناسایی، پیامد و شاهد؛ در ستون کناری شرط پذیرش ورودی، سناریوهای مشابه کتابخانه، دسته‌ی اصلی و منبع
// شناسایی؛ و زیر همه ورودی‌های اخیر. «ارسال برای شناسایی» ریسک را در رجیستر ثبت می‌کند.

type Errors = Partial<Record<keyof IdentificationValues | "__all__", string[]>>;

interface SaveResult {
  message: string;
  draft?: { id: number; saved_at: Moment };
  recent?: IdentificationRow[];
  risk?: { id: number; code: string };
  redirect?: string;
}

const PROCESS: { label: string; state: StepState }[] = [
  { label: "تعیین بافتار", state: "done" },
  { label: "شناسایی", state: "current" },
  { label: "گردآوری شواهد", state: "upcoming" },
  { label: "تحلیل", state: "upcoming" },
  { label: "ارزیابی", state: "upcoming" },
  { label: "تصمیم و اجرا", state: "upcoming" },
  { label: "آزمون و بازسنجی", state: "upcoming" },
  { label: "پایش و گزارش", state: "upcoming" },
];

const FIELD_LABELS: Partial<Record<keyof IdentificationValues, string>> = {
  org_unit: "واحد و تکمیل‌کننده",
  target: "خدمت، مشتری و تعهد",
  mission: "مأموریت و خروجی اصلی",
  impact: "پیامد برای شرکت و مشتری",
  dependencies: "وابستگی و جایگزین",
  evidence: "شاهد، تجربه و تغییر اخیر",
  category: "دسته‌ی اصلی",
  source: "منبع شناسایی",
};

const fieldId = (name: string) => `identification-${name}`;

// ─────────────────────────────── قطعه‌های مشترک ───────────────────────────────

/** کارت فیگما با سرکارت جداشده: عنوان H3، توضیح ۱۳ و نشان یا اقدام در سمت چپ. */
function Panel({
  title,
  description,
  aside,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  description?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const id = useId();
  return (
    <Card role="region" aria-labelledby={id} className={cn("overflow-hidden", className)}>
      <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 id={id} className="text-h3 font-semibold text-ink">
            {title}
          </h2>
          {description && <p className="text-sm leading-[1.375rem] text-ink-3">{description}</p>}
        </div>
        {aside && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
      </div>
      <div className={cn("px-5 py-4", bodyClassName)}>{children}</div>
    </Card>
  );
}

function Chip({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning" | "info";
  children: ReactNode;
}) {
  const tones = {
    neutral: "bg-subtle text-ink-2",
    success: "bg-success-subtle text-success",
    warning: "bg-warning-subtle text-warning",
    info: "bg-info-subtle text-info",
  };
  return (
    <span
      className={cn(
        "inline-flex h-[1.375rem] items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

function TextField({
  name,
  value,
  onChange,
  errors,
  required,
  hint,
  label,
  limit,
}: {
  name: IdentificationTextField;
  value: string;
  onChange: (value: string) => void;
  errors?: string[];
  required?: boolean;
  hint?: string;
  label: string;
  limit: number;
}) {
  return (
    <Field label={label} required={required} hint={hint} error={errors} id={fieldId(name)}>
      <Input value={value} maxLength={limit} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

// ─────────────────────────────── جمله‌ی سناریو ───────────────────────────────

function Sentence({ values, parts }: { values: IdentificationValues; parts: IdentificationPart[] }) {
  const token = (name: IdentificationPart["name"]) => {
    const text = values[name].trim();
    const part = parts.find((item) => item.name === name);
    return text ? (
      <span className="font-semibold text-brand underline decoration-from-font underline-offset-4">{text}</span>
    ) : (
      <span className="rounded-sm border-b border-dashed border-ink-3 text-ink-3">[{part?.token}]</span>
    );
  };
  return (
    <p className="rounded-lg border border-brand-subtle-strong bg-brand-subtle px-[1.125rem] py-4 text-base leading-8 text-ink">
      در خدمت یا فرآیند {token("subject")}، به علت یا در شرایط {token("conditions")}، ممکن است {token("event")} رخ دهد و
      انجام {token("objective")} برای {token("customer")} را مختل کند. پیامد قابل مشاهده‌ی آن {token("harm")} است.
    </p>
  );
}

// ─────────────────────────────── ستون کناری ───────────────────────────────

function EntryCriteria({ values, owner }: { values: IdentificationValues; owner: string | null }) {
  const { checks, evidence, met } = entryChecks(values, owner);
  return (
    <Panel
      title="شرط پذیرش ورودی"
      description="سناریوی قابل ارزیابی"
      aside={<Chip tone={met === 5 ? "success" : "warning"}>{`${fa(met)} از ۵`}</Chip>}
    >
      <ul className="flex flex-col gap-2.5">
        {checks.map((check) => (
          <li key={check.key} className="flex items-start gap-2 text-sm text-ink">
            <Icon
              name={check.met ? "check-circle" : "x-circle"}
              size={16}
              className={cn("mt-0.5 shrink-0", check.met ? "text-success" : "text-ink-3")}
            />
            <span className={check.met ? "font-medium" : "text-ink-2"}>
              {check.label}
              <span className="sr-only">{check.met ? " (برقرار)" : " (برقرار نیست)"}</span>
            </span>
          </li>
        ))}
        <li className="flex items-start gap-2 text-sm">
          <Icon
            name={evidence === "met" ? "check-circle" : evidence === "assumption" ? "warning" : "x-circle"}
            size={16}
            className={cn(
              "mt-0.5 shrink-0",
              evidence === "met" ? "text-success" : evidence === "assumption" ? "text-warning" : "text-ink-3",
            )}
          />
          <span className="flex flex-col gap-0.5">
            <span className={evidence === "missing" ? "text-ink-2" : "font-medium text-ink"}>
              شاهد یا فرض قابل آزمون
            </span>
            {evidence === "assumption" && (
              <span className="text-xs text-ink-3">با عدم قطعیت زیاد و اقدام جمع‌آوری شاهد ثبت می‌شود</span>
            )}
          </span>
        </li>
      </ul>
      <p className="mt-3 border-t border-line pt-2.5 text-xs text-ink-3">
        عبارت مبهم با سؤال مشخص و مهلت ۵ روز کاری به واحد بازمی‌گردد.
      </p>
    </Panel>
  );
}

function SimilarScenarios({
  matches,
  linked,
  onLink,
  libraryUrl,
}: {
  matches: Match[];
  linked: string;
  onLink: (id: string, category?: number) => void;
  libraryUrl: string;
}) {
  const best = matches[0];
  const tone = (percent: number) => (percent >= 75 ? "success" : percent >= 50 ? "warning" : "info");
  return (
    <Panel
      title="سناریوهای مشابه در کتابخانه"
      description="بررسی هم‌پوشانی پیش از ثبت نمونه‌ی جدید"
      bodyClassName="py-3"
    >
      {matches.length ? (
        <ul className="flex flex-col divide-y divide-line" aria-label="سناریوهای مشابه">
          {matches.map(({ scenario, percent }) => {
            const selected = linked === String(scenario.id);
            return (
              <li key={scenario.id} className="py-1">
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onLink(selected ? "" : String(scenario.id), scenario.category.id)}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-md px-2 py-2.5 text-start transition-colors",
                    selected ? "bg-brand-subtle" : "hover:bg-subtle",
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="code text-xs font-medium text-ink-2">{scenario.code}</span>
                    <span className="text-sm font-medium text-ink">{scenario.title}</span>
                    <span className="text-xs text-ink-3">
                      {scenario.risk_count ? `${fa(scenario.risk_count)} نمونه‌ی ریسک` : "بدون نمونه"} ·{" "}
                      {scenario.category.code} {scenario.category.name}
                    </span>
                  </span>
                  <span className="mt-2.5 flex shrink-0 flex-col items-end gap-1">
                    <Chip tone={tone(percent)}>
                      <span className="sr-only">شباهت </span>
                      {fa(percent)}٪
                    </Chip>
                    {selected && <span className="text-xs font-medium text-brand">پیوند خورده</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-2 text-sm text-ink-3">
          با نوشتن رویداد و شرایط، سناریوهای هم‌پوشان کتابخانه همین‌جا پیدا می‌شوند.{" "}
          <AppLink href={libraryUrl}>دیدن کتابخانه</AppLink>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-2">
        {best && (
          <Button
            variant="outline"
            size="sm"
            aria-pressed={linked === String(best.scenario.id)}
            onClick={() => onLink(String(best.scenario.id), best.scenario.category.id)}
          >
            <Icon name="link" />
            پیوند به <bdi className="code">{best.scenario.code}</bdi>
          </Button>
        )}
        <Button variant="ghost" size="sm" aria-pressed={!linked} onClick={() => onLink("")}>
          <Icon name="plus" />
          ثبت مورد جدید
        </Button>
      </div>
    </Panel>
  );
}

function CategoryPicker({
  choices,
  value,
  tags,
  onChange,
  onTags,
  errors,
}: {
  choices: IdentificationChoices["category"];
  value: string;
  tags: string[];
  onChange: (value: string) => void;
  onTags: (tags: string[]) => void;
  errors?: string[];
}) {
  const [draft, setDraft] = useState("");
  function addTag() {
    const names = draft
      .split(/[،,]/)
      .map((name) => name.trim())
      .filter(Boolean);
    if (names.length) onTags([...new Set([...tags, ...names])]);
    setDraft("");
  }
  return (
    <Panel
      title="دسته‌ی اصلی"
      description="طبقه‌بندی برای تخصیص مالک و گزارش است و امتیاز را تغییر نمی‌دهد"
      bodyClassName="flex flex-col gap-3"
    >
      <fieldset id={fieldId("category")} aria-invalid={errors ? true : undefined}>
        <legend className="sr-only">دسته‌ی اصلی ریسک</legend>
        <div className="grid grid-cols-2 gap-2">
          {choices.map((choice) => (
            <label
              key={choice.value}
              className={cn(
                "flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors has-focus-visible:shadow-focus",
                value === choice.value
                  ? "border-brand bg-brand-subtle text-brand"
                  : "border-transparent bg-subtle text-ink-2 hover:border-line-strong",
              )}
            >
              <input
                type="radio"
                name="category"
                value={choice.value}
                checked={value === choice.value}
                onChange={() => onChange(choice.value)}
                className="sr-only"
              />
              <span className={cn("code font-medium", value === choice.value ? "text-brand" : "text-ink-3")}>
                {choice.code}
              </span>
              <span>{choice.label}</span>
            </label>
          ))}
        </div>
        <FieldError messages={errors} />
      </fieldset>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-ink-3">برچسب فرعی:</span>
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex h-[1.375rem] items-center gap-1 rounded-full bg-subtle ps-2.5 pe-1 text-xs font-medium text-ink-2"
          >
            {tag}
            <button
              type="button"
              onClick={() => onTags(tags.filter((item) => item !== tag))}
              className="grid size-4 place-items-center rounded-full hover:bg-line"
              aria-label={`برداشتن برچسب ${tag}`}
            >
              <Icon name="x" size={10} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "," || event.key === "،") {
              event.preventDefault();
              addTag();
            }
          }}
          onBlur={addTag}
          placeholder="افزودن برچسب"
          aria-label="افزودن برچسب فرعی"
          className="h-[1.375rem] w-28 rounded-full border border-dashed border-line-strong bg-transparent px-2.5 text-xs text-ink outline-none focus:border-brand"
        />
      </div>
    </Panel>
  );
}

function SourcePicker({
  choices,
  value,
  onChange,
  errors,
}: {
  choices: IdentificationChoices["source"];
  value: string;
  onChange: (value: string) => void;
  errors?: string[];
}) {
  return (
    <Panel title="منبع شناسایی" description="ریسک از چه مجرایی اعلام شده است" bodyClassName="px-3 py-2">
      <fieldset id={fieldId("source")} aria-invalid={errors ? true : undefined} className="flex flex-col gap-0">
        <legend className="sr-only">منبع شناسایی ریسک</legend>
        {choices.map((choice) => (
          <label
            key={choice.value}
            className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-panel px-3.5 py-2.5 text-base text-ink transition-colors hover:border-line-strong has-checked:border-[1.5px] has-checked:border-brand has-checked:bg-brand-subtle has-focus-visible:shadow-focus [&+&]:mt-0"
          >
            <input
              type="radio"
              name="source"
              value={choice.value}
              checked={value === choice.value}
              onChange={() => onChange(choice.value)}
              className="size-[1.125rem] shrink-0 cursor-pointer appearance-none rounded-full border-[1.5px] border-line-strong bg-panel checked:border-[5.5px] checked:border-brand"
            />
            {choice.label}
          </label>
        ))}
        <div className="px-1 pt-1">
          <FieldError messages={errors} />
        </div>
      </fieldset>
    </Panel>
  );
}

// ─────────────────────────────── ورودی‌های اخیر ───────────────────────────────

function RecentEntries({ rows, registerUrl }: { rows: IdentificationRow[]; registerUrl: string }) {
  return (
    <Panel
      title="ورودی‌های اخیر شناسایی"
      description="گردش کار: پیش‌نویس ← شناسایی‌شده ← در ارزیابی · ادغام یا تفکیک با حفظ شناسه‌ی مبدأ"
      aside={
        <AppLink href={registerUrl} button={{ variant: "ghost", size: "sm" }}>
          همه‌ی ورودی‌ها
          <Icon name="arrow-left" className="ltr:rotate-180" />
        </AppLink>
      }
      bodyClassName="p-0"
    >
      {rows.length ? (
        <div className="table-shell">
          <table className="data-table">
            <caption className="sr-only">ورودی‌های اخیر شناسایی</caption>
            <thead>
              <tr>
                <th scope="col">کد</th>
                <th scope="col">سناریو</th>
                <th scope="col">خدمت · مشتری</th>
                <th scope="col">منبع</th>
                <th scope="col">وضعیت</th>
                <th scope="col">مالک</th>
                <th scope="col">مهلت</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td data-label="کد" data-wide className="code text-xs whitespace-nowrap text-ink-2">
                    {row.code ?? "—"}
                  </td>
                  <td data-primary className="min-w-56">
                    {row.route ? (
                      <Link to={row.route} className="text-base font-medium text-ink hover:text-brand">
                        {row.title}
                      </Link>
                    ) : (
                      <AppLink href={row.href ?? "#"} className="text-base font-medium text-ink hover:text-brand">
                        {row.title}
                      </AppLink>
                    )}
                    <span className="block text-xs text-ink-3">
                      {[row.category, row.scenario ?? (row.code ? "مورد جدید" : null)].filter(Boolean).join(" · ")}
                    </span>
                  </td>
                  <td data-label="خدمت · مشتری" data-wide className="text-ink-2">
                    {row.service ? `${row.service} · ${row.customer ?? "همه"}` : "—"}
                  </td>
                  <td data-label="منبع" className="text-ink-2">
                    {row.source || "—"}
                  </td>
                  <td data-label="وضعیت">
                    <Badge tone={row.stage.tone}>{row.stage.label}</Badge>
                  </td>
                  <td data-label="مالک" className="text-ink-2">
                    {row.owner?.name ?? "—"}
                  </td>
                  <td data-label="مهلت" className="whitespace-nowrap text-ink-2 tabular">
                    {row.due ? (
                      <span className={row.due.overdue ? "text-danger" : undefined} title={shortDate(row.due)}>
                        {daysLeft(row.due)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-ink-3">هنوز ورودی شناسایی‌ای ثبت نشده است.</p>
      )}
    </Panel>
  );
}

// ─────────────────────────────── فرم ───────────────────────────────

function IdentificationForm({ data, onDraftSaved }: { data: PageData; onDraftSaved: (id: string) => void }) {
  const choices = data.choices as IdentificationChoices;
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [values, setValues] = useState<IdentificationValues>(data.values);
  const [saved, setSaved] = useState(() => JSON.stringify(data.values));
  const [draftId, setDraftId] = useState<number | null>(data.draft?.id ?? null);
  const [errors, setErrors] = useState<Errors>({});
  const [confirming, setConfirming] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const dirty = JSON.stringify(values) !== saved;
  const limit = data.text_limit;

  const unit = choices.org_unit.find((item) => item.value === values.org_unit);
  const target = choices.target.find((item) => item.value === values.target);
  const matches = useMemo(
    () => similarScenarios(values, data.scenarios, target?.service.id ?? null),
    [values, data.scenarios, target],
  );
  // سناریوی پیوندشده حتی اگر دیگر جزو سه مورد شبیه نباشد در فهرست می‌ماند.
  const linked = data.scenarios.find((scenario) => String(scenario.id) === values.scenario);
  const shown =
    linked && !matches.some((match) => match.scenario.id === linked.id)
      ? [...matches, { scenario: linked, percent: 0 }]
      : matches;
  const answered = data.parts.filter((part) => values[part.name].trim()).length;

  function set<K extends keyof IdentificationValues>(name: K, value: IdentificationValues[K]) {
    setValues((current) => ({ ...current, [name]: value }));
    if (errors[name]) setErrors((current) => ({ ...current, [name]: undefined }));
  }

  function chooseTarget(value: string) {
    const option = choices.target.find((item) => item.value === value);
    setValues((current) => ({
      ...current,
      target: value,
      // جواب‌های خالی از خدمت و تعهد انتخاب‌شده پیشنهاد می‌شوند؛ چیزی که کاربر نوشته عوض نمی‌شود.
      subject: current.subject.trim() || !option ? current.subject : option.service.name,
      customer:
        current.customer.trim() || !option
          ? current.customer
          : option.customer
            ? `${option.customer} و داتین`
            : "همه‌ی مشتریان",
      objective: current.objective.trim() || !option?.commitment ? current.objective : option.commitment,
    }));
    if (errors.target) setErrors((current) => ({ ...current, target: undefined }));
  }

  function link(id: string, category?: number) {
    setValues((current) => ({
      ...current,
      scenario: id,
      category: id && category && !current.category ? String(category) : current.category,
    }));
  }

  const save = useMutation({
    mutationFn: (submit: boolean) => post<SaveResult>("identification/", { values, submit, draft: draftId }),
    onSuccess: (result, submit) => {
      setErrors({});
      setConfirming(false);
      setSaved(JSON.stringify(values));
      toast({ title: faText(result.message) });
      if (submit && result.redirect) {
        void queryClient.invalidateQueries({ queryKey: ["identification"] });
        void queryClient.invalidateQueries({ queryKey: ["risks"] });
        navigate(result.redirect);
        return;
      }
      if (result.draft) {
        const id = String(result.draft.id);
        setDraftId(result.draft.id);
        // داده‌ی نشانی تازه همین فرم است، تا با ?draft= دوباره خوانده و از نو ساخته نشود و فوکوس سر جایش بماند.
        queryClient.setQueryData<PageData>(["identification", id], {
          ...data,
          values,
          draft: result.draft,
          recent: result.recent ?? data.recent,
        });
        onDraftSaved(id);
        const next = new URLSearchParams(params);
        next.set("draft", id);
        next.delete("new");
        setParams(next, { replace: true });
      }
    },
    onError: (error) => {
      setConfirming(false);
      if (error instanceof ApiError && error.errors) {
        setErrors(error.errors as Errors);
        requestAnimationFrame(() => summaryRef.current?.focus());
      } else {
        setErrors({ __all__: [error.message] });
      }
    },
  });

  // Ctrl+S پیش‌نویس را ذخیره می‌کند.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!save.isPending) save.mutate(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !save.isPending && currentLocation.pathname !== nextLocation.pathname,
  );

  const errorList = Object.entries(errors).filter(
    (entry): entry is [string, string[]] => entry[0] !== "__all__" && Boolean(entry[1]?.length),
  );
  const partLabel = (name: string) =>
    FIELD_LABELS[name as keyof IdentificationValues] ?? data.parts.find((part) => part.name === name)?.label ?? name;

  function focusField(name: string) {
    const element = document.getElementById(fieldId(name));
    element?.scrollIntoView?.({ block: "center" });
    const control = element?.matches("input, select, textarea")
      ? element
      : element?.querySelector<HTMLElement>("input, select, textarea");
    (control as HTMLElement | null | undefined)?.focus({ preventScroll: true });
  }

  return (
    <>
      {errorList.length > 0 && (
        <Alert
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          tone="danger"
          className="outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
          title={`${fa(errorList.length)} مورد پیش از ارسال درست شود:`}
        >
          <ul className="mt-1 flex flex-col gap-1">
            {errorList.map(([name, messages]) => (
              <li key={name}>
                <a
                  href={`#${fieldId(name)}`}
                  className="text-ink underline underline-offset-4 hover:text-danger"
                  onClick={(event) => {
                    event.preventDefault();
                    focusField(name);
                  }}
                >
                  {partLabel(name)}
                </a>
                : {messages.join(" ")}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      {errors.__all__ && (
        <Alert tone="danger" role="alert">
          {faText(errors.__all__.join(" "))}
        </Alert>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_23.5rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel
            title="فرم ورودی مدیر واحد"
            description="مأموریت، تعهد و موقعیت اختلال ثبت می‌شود؛ فهرست دارایی و اصطلاحات تهدید و آسیب‌پذیری شرط آغاز نیست."
            aside={<Badge tone="neutral">{draftId ? "پیش‌نویس" : "ورودی تازه"}</Badge>}
            bodyClassName="flex flex-col gap-3.5"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="واحد و تکمیل‌کننده" required error={errors.org_unit} id={fieldId("org_unit")}>
                <Select value={values.org_unit} onChange={(event) => set("org_unit", event.target.value)}>
                  <option value="">انتخاب واحد</option>
                  {choices.org_unit.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="خدمت، مشتری و تعهد" required error={errors.target} id={fieldId("target")}>
                <Select value={values.target} onChange={(event) => chooseTarget(event.target.value)}>
                  <option value="">انتخاب خدمت</option>
                  {choices.target.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <TextField
              name="mission"
              label="مأموریت و خروجی اصلی"
              required
              hint="سه تا پنج کارکرد اصلی و تعهد قابل مشاهده‌ی واحد"
              value={values.mission}
              onChange={(value) => set("mission", value)}
              errors={errors.mission}
              limit={limit}
            />
            <hr className="border-line" />
            <div className="flex items-center gap-2">
              <h3 className="flex-1 text-sm font-semibold text-ink">الگوی ثبت سناریو</h3>
              <Chip tone="info">
                پیش‌نمایش زنده
                <Icon name="eye" size={12} />
              </Chip>
            </div>
            <div aria-live="polite">
              <Sentence values={values} parts={data.parts} />
            </div>
            <ul className="flex flex-wrap gap-1.5" aria-label="اجزای الگو">
              {data.parts.map((part) => (
                <li key={part.name}>
                  <span className="inline-flex h-[1.375rem] items-center rounded-full bg-brand-subtle px-2.5 text-xs font-medium text-brand">
                    {part.token}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            title="پرسش‌های جلسه‌ی شناسایی"
            description="هر پرسش یک جزء از الگوی ثبت سناریو را کامل می‌کند."
            aside={
              <Chip tone={answered === data.parts.length ? "success" : "warning"}>
                {`${fa(answered)} از ${fa(data.parts.length)} کامل`}
                <Icon name="check" size={12} />
              </Chip>
            }
          >
            <ul className="grid gap-2 sm:grid-cols-2">
              {data.parts.map((part) => {
                const value = values[part.name];
                const filled = value.trim().length > 0;
                const error = errors[part.name];
                return (
                  <li
                    key={part.name}
                    className={cn(
                      "flex items-start gap-2.5 rounded-md bg-subtle px-3 py-2.5 ring-brand/30 focus-within:ring-2",
                      error && "ring-2 ring-danger/40",
                    )}
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <label htmlFor={fieldId(part.name)} className="text-sm font-medium text-ink">
                        {part.label}
                        {part.name !== "subject" && (
                          <>
                            {" "}
                            <RequiredMark />
                          </>
                        )}
                      </label>
                      <input
                        id={fieldId(part.name)}
                        value={value}
                        maxLength={limit}
                        onChange={(event) => set(part.name, event.target.value)}
                        placeholder="پاسخ کوتاه و مشخص"
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? `${fieldId(part.name)}-error` : undefined}
                        className="w-full bg-transparent text-xs text-ink-2 outline-none placeholder:text-ink-3/80"
                      />
                      {error && (
                        <span id={`${fieldId(part.name)}-error`} className="text-xs text-danger">
                          {error.join(" ")}
                        </span>
                      )}
                    </div>
                    <Icon
                      name={filled ? "check-circle" : "warning"}
                      size={18}
                      className={cn("mt-0.5 shrink-0", filled ? "text-success" : "text-warning")}
                    />
                    <span className="sr-only">{filled ? "جواب دارد" : "بی‌جواب"}</span>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel title="پیامد، وابستگی و شاهد" bodyClassName="flex flex-col gap-3.5">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                name="impact"
                label="پیامد برای شرکت و مشتری"
                value={values.impact}
                onChange={(value) => set("impact", value)}
                errors={errors.impact}
                limit={limit}
              />
              <TextField
                name="dependencies"
                label="وابستگی و جایگزین"
                value={values.dependencies}
                onChange={(value) => set("dependencies", value)}
                errors={errors.dependencies}
                limit={limit}
              />
            </div>
            <TextField
              name="evidence"
              label="شاهد، تجربه و تغییر اخیر"
              required
              hint="شاهد یا فرض قابل آزمون؛ نبود شاهد به معنی رد ریسک نیست"
              value={values.evidence}
              onChange={(value) => set("evidence", value)}
              errors={errors.evidence}
              limit={limit}
            />
            <EvidencePicker
              choices={choices.evidence}
              selected={values.evidence_items}
              onChange={(items) => set("evidence_items", items)}
              evidenceUrl={data.evidence_url}
            />
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3.5">
              <Button
                variant="outline"
                loading={save.isPending && save.variables === false}
                disabled={save.isPending}
                onClick={() => save.mutate(false)}
                title="Ctrl+S"
              >
                ذخیره‌ی پیش‌نویس
              </Button>
              <Button disabled={save.isPending} onClick={() => setConfirming(true)}>
                ارسال برای شناسایی
                <Icon name="arrow-left" className="ltr:rotate-180" />
              </Button>
            </div>
          </Panel>
        </div>

        <aside className="flex flex-col gap-4" aria-label="شرط پذیرش، سناریوهای مشابه، دسته و منبع">
          <EntryCriteria values={values} owner={unit?.owner?.name ?? null} />
          <SimilarScenarios matches={shown} linked={values.scenario} onLink={link} libraryUrl={data.scenarios_url} />
          <CategoryPicker
            choices={choices.category}
            value={values.category}
            tags={values.tags}
            onChange={(value) => set("category", value)}
            onTags={(tags) => set("tags", tags)}
            errors={errors.category}
          />
          <SourcePicker
            choices={choices.source}
            value={values.source}
            onChange={(value) => set("source", value)}
            errors={errors.source}
          />
        </aside>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="ورودی برای شناسایی فرستاده شود؟"
        description={
          values.scenario
            ? `ریسک با پیوند به سناریوی ${linked?.code ?? ""} در رجیستر ثبت می‌شود و عضو GRC آن را برای ارزیابی می‌فرستد یا با پرسش مشخص برمی‌گرداند.`
            : "ریسک به‌عنوان «مورد جدید» بدون سناریوی مرجع در رجیستر ثبت می‌شود و عضو GRC آن را برای ارزیابی می‌فرستد یا با پرسش مشخص برمی‌گرداند."
        }
        confirmLabel="ارسال برای شناسایی"
        loading={save.isPending}
        onConfirm={() => save.mutate(true)}
      />
      <ConfirmDialog
        open={blocker.state === "blocked"}
        onOpenChange={(open) => !open && blocker.reset?.()}
        title="تغییرات ذخیره نشده است"
        description="اگر از این صفحه بروید، چیزی که بعد از آخرین ذخیره نوشته‌اید از دست می‌رود."
        cancelLabel="ماندن در صفحه"
        confirmLabel="رفتن بدون ذخیره"
        tone="danger"
        onConfirm={() => blocker.proceed?.()}
      />
    </>
  );
}

function EvidencePicker({
  choices,
  selected,
  onChange,
  evidenceUrl,
}: {
  choices: IdentificationChoices["evidence"];
  selected: string[];
  onChange: (items: string[]) => void;
  evidenceUrl: string;
}) {
  const items = choices.filter((choice) => selected.includes(choice.value));
  return (
    <div className="flex flex-wrap items-center gap-2" id={fieldId("evidence_items")}>
      {items.map((item) => (
        <span
          key={item.value}
          className="inline-flex h-[1.375rem] max-w-full items-center gap-1 rounded-full bg-subtle ps-2.5 pe-1 text-xs font-medium text-ink-2"
        >
          <Icon name="paperclip" size={12} />
          <span className="truncate">
            <bdi className="code">{item.code}</bdi> · {item.label}
          </span>
          <button
            type="button"
            onClick={() => onChange(selected.filter((value) => value !== item.value))}
            className="grid size-4 shrink-0 place-items-center rounded-full hover:bg-line"
            aria-label={`برداشتن شاهد ${item.code}`}
          >
            <Icon name="x" size={10} />
          </button>
        </span>
      ))}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm">
            <Icon name="upload" />
            پیوست شاهد
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="flex max-h-80 flex-col gap-2 overflow-y-auto p-3">
          <p className="text-xs text-ink-3">شاهد معتبری را که این سناریو را پشتیبانی می‌کند انتخاب کنید.</p>
          {choices.length ? (
            <ul className="flex flex-col gap-1">
              {choices.map((choice) => (
                <li key={choice.value}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-subtle">
                    <input
                      type="checkbox"
                      checked={selected.includes(choice.value)}
                      onChange={(event) =>
                        onChange(
                          event.target.checked
                            ? [...selected, choice.value]
                            : selected.filter((value) => value !== choice.value),
                        )
                      }
                      className="mt-1 size-4 shrink-0 accent-brand"
                    />
                    <span>
                      <bdi className="code text-xs text-ink-2">{choice.code}</bdi> {choice.label}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-2">شاهد معتبری که بتوانید ببینید ثبت نشده است.</p>
          )}
          <AppLink href={evidenceUrl} className="text-xs">
            ثبت شاهد تازه در کتابخانه‌ی شواهد
          </AppLink>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ─────────────────────────────── صفحه ───────────────────────────────

export function IdentificationPage() {
  useTitle("شناسایی ریسک");
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const draft = params.get("draft") ?? "";
  const fresh = params.get("new") ?? "";
  // رفتن به پیش‌نویس دیگر یا «ثبت سناریوی جدید» فرم را از نو می‌سازد؛ پیش‌نویسی که همین فرم ذخیره کرده نه.
  const [saved, setSaved] = useState<string | null>(null);
  const [formKey, setFormKey] = useState({ draft, fresh, key: `${draft}-${fresh}` });
  if (formKey.draft !== draft || formKey.fresh !== fresh) {
    const keep = saved === draft && formKey.fresh === fresh;
    setFormKey({ draft, fresh, key: keep ? formKey.key : `${draft}-${fresh}` });
  }
  const query = useQuery({
    queryKey: ["identification", draft],
    queryFn: ({ signal }) => get<PageData>(`identification/${draft ? `?draft=${draft}` : ""}`, signal),
  });

  const header = (
    <PageHeader
      title="شناسایی ریسک"
      description="ثبت سناریو از مأموریت و تعهد واحد طبق الگوی بخش ۴ روش · افق پیش‌فرض ۱۲ ماه · دارایی ورودی اجباری نیست"
      breadcrumb={[{ label: "شناسایی ریسک" }]}
      actions={
        <>
          <AppLink href={query.data?.scenarios_url ?? "/risks/scenarios/"} button={{ variant: "outline" }}>
            <Icon name="books" />
            کتابخانه‌ی سناریو
          </AppLink>
          {query.data?.can_identify && (
            <Button onClick={() => navigate(`/identification?new=${Date.now()}`)}>
              <Icon name="plus" />
              ثبت سناریوی جدید
            </Button>
          )}
        </>
      }
    />
  );

  return (
    <div className="flex flex-col gap-4">
      {header}
      <Card
        className="overflow-x-auto px-5 py-[0.9375rem]"
        role="region"
        tabIndex={0}
        aria-label="گام‌های فرایند مدیریت ریسک"
      >
        <ProcessSteps steps={PROCESS} className="min-w-[44rem]" />
      </Card>
      {query.isPending ? (
        <PageSkeleton rows={6} />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => query.refetch()} />
      ) : (
        <>
          {query.data.can_identify && query.data.choices ? (
            <IdentificationForm key={formKey.key} data={query.data} onDraftSaved={setSaved} />
          ) : (
            <Alert tone="info" title="ثبت ورودی شناسایی با مدیر واحد و عضو GRC است">
              ورودی‌های اخیری را که به آن‌ها دسترسی دارید پایین همین صفحه می‌بینید.
            </Alert>
          )}
          <RecentEntries rows={query.data.recent} registerUrl={query.data.register_url} />
        </>
      )}
    </div>
  );
}
