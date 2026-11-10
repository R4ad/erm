import { Activity, History, ListChecks, MessageSquarePlus, PencilLine } from "lucide-react";
import { useState } from "react";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Deadline } from "@/components/ui/deadline";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/states";
import { useBridgeAction } from "@/features/forms/bridge-action";
import { FieldControl } from "@/features/forms/field-control";
import { DetailState } from "@/features/pages/listing";
import { usePageData } from "@/features/pages/page-data";
import { ActionError, CodeLinks, Fact, NotesField, Prose, Section } from "@/features/records/dossier";
import { Attachments, Comments } from "@/features/records/RecordSections";
import { dateTime, fa, faText, formatNumber, longDate } from "@/lib/format";
import { useSectionFromHash, useTitle } from "@/lib/hooks";
import type { ActionDetail, ActionMove, ActionProgress } from "@/lib/types";

import { ActionStatusBadge } from "./tables";

// پرونده‌ی اقدام (actions/action_detail.html): خروجی قابل آزمون، پیشرفت و سابقه‌ی آن. تغییر وضعیت‌ها همان‌هایی‌اند
// که جنگو به همین کاربر اجازه داده (مالک و مجری اجرا را ثبت می‌کنند و تأییدکننده نتیجه را) و با همان view فرستاده
// می‌شوند.

/** دکمه‌ی هر تغییر وضعیت با سبک همان دکمه در قالب جنگو. */
function moveVariant(move: ActionMove): ButtonVariant {
  if (move.style.includes("danger")) return "danger";
  if (move.style.startsWith("outline")) return "secondary";
  return "primary";
}

function Header({ data }: { data?: ActionDetail }) {
  const action = data?.action;
  return (
    <PageHeader
      breadcrumb={[
        { label: "اقدام‌ها", to: "/actions" },
        action ? { label: action.code, code: true } : { label: "اقدام" },
      ]}
      title={action ? action.title : "اقدام"}
      meta={
        action && (
          <>
            <Badge className="code">{action.code}</Badge>
            <ActionStatusBadge status={action.status} />
          </>
        )
      }
      actions={
        data && (
          <>
            {data.edit_url && (
              <AppLink href={data.edit_url} button={{ variant: "secondary" }}>
                <PencilLine aria-hidden />
                ویرایش
              </AppLink>
            )}
            {data.plan.href && (
              <AppLink href={data.plan.href} button={{ variant: "secondary" }}>
                طرح مواجهه
              </AppLink>
            )}
          </>
        )
      }
    />
  );
}

function OpenProgress({ progress }: { progress: Extract<ActionProgress, { state: "open" }> }) {
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState<string[]>([]);
  const action = useBridgeAction();
  const busy = (name: string) => action.isPending && action.variables?.values.move === name;
  const send = (move: string) =>
    action.mutate(
      { url: progress.url, values: { move, note, ...(progress.evidence ? { evidence } : {}) } },
      {
        onSuccess: () => {
          setNote("");
          setEvidence([]);
        },
      },
    );
  const needNote = progress.moves.filter((move) => move.note_required).map((move) => `«${move.label}»`);
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-5">
        <ActionError error={action.error} />
        <NotesField
          field={progress.note}
          value={note}
          onChange={setNote}
          disabled={action.isPending}
          hint={
            [progress.note.help, needNote.length ? `برای ${needNote.join(" و ")} توضیح لازم است.` : ""]
              .filter(Boolean)
              .join(" ") || undefined
          }
        />
        {progress.evidence && (
          <FieldControl
            field={progress.evidence}
            id="move-evidence"
            value={evidence}
            onChange={(value) => setEvidence(Array.isArray(value) ? value : [])}
          />
        )}
        <div className="flex flex-wrap gap-2">
          {progress.moves.map((move) => (
            <Button
              key={move.name}
              variant={moveVariant(move)}
              loading={busy(move.name)}
              disabled={action.isPending}
              onClick={() => send(move.name)}
            >
              {move.label}
            </Button>
          ))}
          {progress.can_note && (
            <Button variant="ghost" loading={busy("note")} disabled={action.isPending} onClick={() => send("note")}>
              {!busy("note") && <MessageSquarePlus aria-hidden />}
              ثبت یادداشت پیشرفت
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Progress({ data }: { data: ActionDetail }) {
  const { progress, action } = data;
  return (
    <Section id="progress" title="پیشرفت" icon={<Activity />}>
      {progress.state === "planned" && (
        <p className="text-sm text-muted">اقدام هنوز مصوب نیست؛ با تأیید طرح به دست مالک ریسک مصوب می‌شود.</p>
      )}
      {progress.state === "verified" && (
        <Alert tone="success">
          خروجی تأیید شد و اقدام بسته است (بخش ۲۰). اثرش روی ریسک با بازسنجی طرح دیده می‌شود.
        </Alert>
      )}
      {progress.state === "waiting" && (
        <p className="text-sm text-muted">
          اجرا وقتی ثبت می‌شود که ریسک «در اجرای درمان» باشد. پیشرفت را مالک و مجری اقدام ثبت می‌کنند و نتیجه را
          تأییدکننده تأیید می‌کند.
        </p>
      )}
      {progress.state === "open" && <OpenProgress key={action.status.value} progress={progress} />}
      {data.updates.length > 0 && (
        <Card className="overflow-clip">
          <CardHeader as="h3" icon={<History />} title="سابقه" />
          <ol aria-label="سابقه‌ی پیشرفت اقدام" className="divide-y divide-line border-t border-line">
            {data.updates.map((item) => (
              <li key={item.id} className="flex flex-col gap-1 px-5 py-3.5 text-sm">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium text-fg">{item.label}</span>
                  <span className="text-xs text-muted">
                    {item.by?.name}، {dateTime(item.at)}
                  </span>
                </p>
                {item.note && <p className="whitespace-pre-line text-fg/90">{item.note}</p>}
              </li>
            ))}
          </ol>
        </Card>
      )}
    </Section>
  );
}

function Details({ data }: { data: ActionDetail }) {
  const { action } = data;
  return (
    <Card>
      <CardHeader icon={<ListChecks />} title="خروجی و معیار قبولی" />
      <CardContent>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[9rem_1fr]">
          <Fact label="خروجی قابل آزمون">
            <Prose text={action.deliverable} />
          </Fact>
          <Fact label="معیار قبولی">
            <Prose text={action.acceptance_criteria} />
          </Fact>
          {action.description && (
            <Fact label="شرح">
              <Prose text={action.description} />
            </Fact>
          )}
          <Fact label="شاهد اجرا">
            <CodeLinks items={data.evidence} />
          </Fact>
        </dl>
      </CardContent>
    </Card>
  );
}

function Resources({ data }: { data: ActionDetail }) {
  const { cost, person_hours: hours } = data.action;
  const parts = [cost !== null ? `${formatNumber(cost)} ریال` : "", hours ? `${fa(hours)} نفرساعت` : ""].filter(
    Boolean,
  );
  return <>{parts.length ? parts.join("، ") : "-"}</>;
}

function Facts({ data }: { data: ActionDetail }) {
  const { action, risk, plan } = data;
  return (
    <Card className="lg:sticky lg:top-[calc(var(--topbar-h)+1.5rem)]">
      <CardHeader title="مشخصات" />
      <CardContent>
        <dl className="grid grid-cols-[7.5rem_1fr] gap-x-4 gap-y-3 text-sm">
          <Fact label="ریسک">
            {risk.href ? (
              <AppLink href={risk.href}>
                <bdi className="code">{risk.code}</bdi> {risk.title}
              </AppLink>
            ) : (
              <>
                <bdi className="code">{risk.code}</bdi> {risk.title}
              </>
            )}
            <span className="block text-xs text-muted">گزینه‌ی {plan.option}</span>
          </Fact>
          <Fact label="سازوکار اثر">
            {action.mechanism}
            {action.dimension && `: ${action.dimension}`}
          </Fact>
          <Fact label="مالک">{action.owner?.name ?? "-"}</Fact>
          <Fact label="مجری">{action.assignee?.name ?? "-"}</Fact>
          <Fact label="تأییدکننده‌ی نتیجه">{action.verifier?.name ?? "-"}</Fact>
          <Fact label="شروع">{action.start ? longDate(action.start) : "-"}</Fact>
          <Fact label="سررسید">
            <Deadline value={action.due} label="سررسید" />
          </Fact>
          <Fact label="منابع">
            <Resources data={data} />
          </Fact>
          <Fact label="وابسته به">
            {data.depends_on.length ? (
              <ul className="flex flex-col gap-1.5">
                {data.depends_on.map((item) => (
                  <li key={item.code} className="flex flex-wrap items-center gap-2">
                    <AppLink href={item.href} className="code text-xs">
                      {item.code}
                    </AppLink>
                    <ActionStatusBadge status={item.status} />
                  </li>
                ))}
              </ul>
            ) : (
              "-"
            )}
            {data.waiting_for_dependencies && (
              <span className="mt-1 block text-xs text-warning">هنوز همه‌ی وابستگی‌ها تأیید نشده‌اند.</span>
            )}
          </Fact>
          <Fact label="کنترل‌های مرتبط">
            {data.controls.length ? (
              <ul className="flex flex-col gap-1">
                {data.controls.map((control) => (
                  <li key={control.code}>
                    <bdi className="code text-xs text-muted">{control.code}</bdi> {control.title}
                  </li>
                ))}
              </ul>
            ) : (
              "-"
            )}
          </Fact>
        </dl>
      </CardContent>
    </Card>
  );
}

export function ActionDetailPage() {
  const page = usePageData<ActionDetail>();
  useTitle(page.data ? faText(page.data.title) : "اقدام");
  useSectionFromHash(Boolean(page.data));
  if (!page.data) return <DetailState query={page} header={<Header />} />;
  const data = page.data;
  return (
    <article className="flex flex-col gap-6">
      <Header data={data} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <Progress data={data} />
          <Details data={data} />
          <Attachments record={data} />
          <Comments record={data} />
        </div>
        <aside aria-label="مشخصات اقدام">
          <Facts data={data} />
        </aside>
      </div>
    </article>
  );
}
