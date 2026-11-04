import { Building2, Lightbulb, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { FormPage } from "@/features/forms/FormPage";
import { SchemaForm } from "@/features/forms/SchemaForm";
import { cn } from "@/lib/cn";
import { fa, faText, formatNumber } from "@/lib/format";
import type { JalaliDate } from "@/lib/jalali";
import type { FormPageData, FormSchema, ImpactGroup, ImpactRow } from "@/lib/types";

// پروفایل پیامد (assessments/impact_form.html): برای داتین و هر بانک متأثر یک گروه و برای هر بُعد یک ردیف. هر ردیف
// فرم جدای جنگو با پیشوند خودش است (datin-S، 12-F) و همه با هم به همان view فرستاده می‌شوند؛ خطای هر خانه کنار همان
// خانه می‌نشیند.

type FieldSlot = (name: string) => ReactNode;

/** ویژگی‌های ذی‌نفع که پیشنهاد سطح S و F از آن‌ها می‌آید. */
function GroupFacts({ group }: { group: ImpactGroup }) {
  const { facts } = group;
  const minutes = (value: number | null) => (value === null ? "ثبت‌نشده" : `${fa(value)} دقیقه`);
  return (
    <div className="flex flex-col gap-2 px-5 pb-4">
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={facts.critical ? "warning" : "neutral"}>
          {facts.critical ? "خدمت حیاتی" : "خدمت غیرحیاتی یا بدون خدمت"}
        </Badge>
      </div>
      {group.is_datin ? (
        <p className="text-xs text-muted">
          مبنای مالی داتین درآمد عملیاتی تأییدشده‌ی ۱۲ ماه اخیر است و در ردیف F نوشته می‌شود.
        </p>
      ) : (
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
          <div className="flex gap-1.5">
            <dt className="text-muted">RTO</dt>
            <dd className="text-fg tabular">{minutes(facts.rto)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted">MTPD</dt>
            <dd className="text-fg tabular">{minutes(facts.mtpd)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted">مبنای مالی</dt>
            <dd className="text-fg tabular">
              {facts.basis === null ? "ثبت‌نشده" : `${formatNumber(facts.basis)} ریال`}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}

function Row({ row, groupName, field }: { row: ImpactRow; groupName: string; field: FieldSlot }) {
  const part = (name: string) => field(`${row.prefix}-${name}`);
  const suggestion = row.suggestion;
  return (
    // نام گروه ذی‌نفع را هم دارد تا «سطح» و «دلیل» هر ردیف با ردیف همان بُعد در گروه دیگر یکی شنیده نشود.
    <div
      role="group"
      aria-label={`${row.scale.code} ${row.scale.name}، ${groupName}`}
      className="flex flex-col gap-4 px-5 py-5"
    >
      <div className="flex flex-col gap-1.5">
        <h3 className="flex items-center gap-2 font-semibold text-fg">
          <bdi className="code grid h-7 min-w-7 place-items-center rounded-lg bg-accent-soft px-1.5 text-sm text-accent-text">
            {row.scale.code}
          </bdi>{" "}
          {row.scale.name}
        </h3>
        {suggestion && (
          <p
            className={cn(
              "flex items-start gap-1.5 text-xs",
              suggestion.level === null ? "text-warning" : "text-success",
            )}
          >
            <Lightbulb aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {suggestion.level !== null && `پیشنهاد سامانه: سطح ${fa(suggestion.level)}. `}
              {faText(suggestion.note)}
            </span>
          </p>
        )}
        {row.provisional_note && (
          <p className="flex items-start gap-1.5 text-xs text-muted">
            <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span>{faText(row.provisional_note)}</span>
          </p>
        )}
        {row.errors.map((error) => (
          <p key={error} role="alert" className="text-xs font-medium text-danger">
            {faText(error)}
          </p>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* متن سطح‌ها بلند است؛ سطح دو ستون می‌گیرد تا گزینه‌ی انتخاب‌شده خوانا بماند. */}
        <div className="sm:col-span-2">{part("level")}</div>
        {part("level_high")}
        {part("confidence")}
        {part("actual_value")}
        {part("unit")}
        {part("basis")}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {part("rationale")}
        {part("evidence")}
      </div>
    </div>
  );
}

function Group({ group, index, field }: { group: ImpactGroup; index: number; field: FieldSlot }) {
  const titleId = `stakeholder-${index}-title`;
  return (
    <section id={`stakeholder-${index}`} aria-labelledby={titleId} className="scroll-mt-24">
      <Card className="overflow-clip">
        <CardHeader
          icon={<Building2 />}
          titleId={titleId}
          title={group.name}
          description={`${fa(group.rows.length)} بُعد پیامد`}
        />
        <GroupFacts group={group} />
        <div className="divide-y divide-line border-t border-line">
          {group.rows.map((row) => (
            <Row key={row.prefix} row={row} groupName={group.name} field={field} />
          ))}
        </div>
      </Card>
    </section>
  );
}

function ImpactProfileForm({ data, path, today }: { data: FormPageData; path: string; today?: JalaliDate }) {
  const groups = data.groups ?? [];
  const rows = groups.flatMap((group) => group.rows.map((row) => ({ group, row })));
  // همه‌ی ردیف‌ها یک فرم رابط‌اند؛ نام هر فیلد پیشوند فرم جنگوی خودش را دارد.
  const schema: FormSchema = {
    fields: rows.flatMap(({ row }) => row.fields),
    errors: [],
    multipart: false,
  };
  const owner = new Map(
    rows.flatMap(({ group, row }) =>
      row.fields.map((field) => [field.name, `${group.name}، ${row.scale.code} ${row.scale.name}`] as const),
    ),
  );
  return (
    <div className="flex flex-col gap-5">
      {groups.length > 1 && (
        <nav aria-label="ذی‌نفعان" className="flex flex-wrap gap-2">
          {groups.map((group, index) => (
            <a
              key={group.name}
              href={`#stakeholder-${index}`}
              className="inline-flex h-8 items-center rounded-full border border-line bg-surface px-3.5 text-sm text-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              {group.name}
            </a>
          ))}
        </nav>
      )}
      <SchemaForm
        schema={schema}
        path={path}
        cancel={data.cancel}
        today={today}
        stickyActions
        summaryLabel={(field) => `${owner.get(field.name) ?? ""}، ${field.label}`}
        layout={(field) => (
          <div className="flex flex-col gap-6">
            {groups.map((group, index) => (
              <Group key={group.name} group={group} index={index} field={field} />
            ))}
          </div>
        )}
      />
    </div>
  );
}

export function ImpactProfilePage() {
  return (
    <FormPage
      body={(data, { path, today }) => <ImpactProfileForm key={path} data={data} path={path} today={today} />}
    />
  );
}
