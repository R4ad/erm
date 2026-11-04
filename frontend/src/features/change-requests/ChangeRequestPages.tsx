import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, GitMerge, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { DetailState, FilterBar, ListBody } from "@/features/pages/listing";
import { activeFilters, usePageData } from "@/features/pages/page-data";
import { useGoTo } from "@/features/session/links";
import { ApiError, bridge, errorMessage, post } from "@/lib/api";
import { count, faText, longDate, shortDate } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { ChangeDetail, ChangeList, ChangeRow, FormResult } from "@/lib/types";

const TONES: Record<string, Tone> = { pending: "warning", approved: "success" };

function Status({ change }: { change: ChangeRow }) {
  return (
    <Badge tone={TONES[change.status.value] ?? "neutral"} dot>
      {change.status.label}
    </Badge>
  );
}

function kindText(change: ChangeRow) {
  return change.merge_into ? `${change.kind.label} در ${change.merge_into.code}` : change.kind.label;
}

export function ChangeRequestListPage() {
  useTitle("ادغام و تفکیک");
  const [params] = useSearchParams();
  const page = usePageData<ChangeList>();
  const filtered = activeFilters(page.data?.filters, params).length > 0;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="درخواست‌های ادغام و تفکیک"
        description={
          page.data
            ? `${count(page.data.count, "درخواست")}. هر پیشنهاد با تأیید مالک ریسک انجام می‌شود.`
            : "هر پیشنهاد ادغام یا تفکیک با تأیید مالک ریسک انجام می‌شود."
        }
      />
      <FilterBar schema={page.data?.filters} label="فیلتر درخواست‌ها" />
      <ListBody
        query={page}
        label="درخواست‌ها"
        filtered={filtered}
        empty={{ icon: <GitMerge />, title: "درخواستی ثبت نشده", filteredTitle: "درخواستی با این مشخصات پیدا نشد" }}
      >
        {(data) => (
          <table className="data-table">
            <caption className="sr-only">درخواست‌های ادغام و تفکیک</caption>
            <thead>
              <tr>
                <th scope="col">ریسک</th>
                <th scope="col">نوع</th>
                <th scope="col">مالک ریسک</th>
                <th scope="col">پیشنهاددهنده</th>
                <th scope="col">تاریخ</th>
                <th scope="col">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((change) => (
                <tr key={change.id}>
                  <td data-primary className="min-w-56">
                    <AppLink
                      href={change.href}
                      className="font-medium text-fg hover:text-accent-text hover:no-underline"
                    >
                      <bdi className="code text-accent-text">{change.risk.code}</bdi> {change.risk.title}
                    </AppLink>
                  </td>
                  <td data-label="نوع" className="whitespace-nowrap">
                    {kindText(change)}
                  </td>
                  <td data-label="مالک ریسک" data-empty={change.owner ? undefined : ""} className="whitespace-nowrap">
                    {change.owner?.name}
                  </td>
                  <td data-label="پیشنهاددهنده" className="whitespace-nowrap">
                    {change.proposed_by?.name}
                  </td>
                  <td data-label="تاریخ" className="whitespace-nowrap text-muted">
                    <time dateTime={change.created_at.iso}>{shortDate(change.created_at)}</time>
                  </td>
                  <td data-label="وضعیت">
                    <Status change={change} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ListBody>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-xs text-muted sm:text-sm">{label}</dt>
      <dd className="text-sm text-fg">{children}</dd>
    </div>
  );
}

/** تصمیم مالک ریسک: تأیید همان لحظه ادغام یا تفکیک را انجام می‌دهد و برگشت ندارد، پس یک بار دیگر پرسیده می‌شود. */
function Decision({ data }: { data: ChangeDetail }) {
  const decision = data.decision;
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<{ note?: string; form?: string }>({});
  const [confirming, setConfirming] = useState(false);
  const toast = useToast();
  const goTo = useGoTo();
  const queryClient = useQueryClient();
  const decide = useMutation({
    mutationFn: (value: "approve" | "reject") =>
      post<FormResult>(bridge("forms", decision?.url ?? ""), { values: { decision: value, note } }),
    onSuccess: (result) => {
      setConfirming(false);
      toast({ title: faText(result.message) });
      void queryClient.invalidateQueries();
      goTo(result.redirect);
    },
    onError: (error) => {
      setConfirming(false);
      if (error instanceof ApiError && error.status === 400 && Object.keys(error.errors).length) {
        setErrors({ note: error.errors.note?.join(" "), form: error.errors.__all__?.join(" ") });
      } else {
        setErrors({ form: errorMessage(error) });
      }
    },
  });
  if (!decision) return null;

  function reject() {
    if (!note.trim()) {
      setErrors({ note: "دلیل رد را بنویسید." });
      document.getElementById("decision-note")?.focus();
      return;
    }
    setErrors({});
    decide.mutate("reject");
  }

  return (
    <Card>
      <CardHeader title="تصمیم شما به‌عنوان مالک ریسک" description={decision.effect} />
      <CardContent className="flex flex-col gap-4">
        {errors.form && (
          <Alert tone="danger" role="alert">
            {faText(errors.form)}
          </Alert>
        )}
        <Field id="decision-note" label={decision.note.label} hint={decision.note.help} error={errors.note}>
          <Textarea
            rows={decision.note.rows ?? 3}
            value={note}
            disabled={decide.isPending}
            onChange={(event) => {
              setNote(event.target.value);
              if (errors.note) setErrors({ ...errors, note: undefined });
            }}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={decide.isPending} onClick={() => setConfirming(true)}>
            <Check aria-hidden />
            تأیید
          </Button>
          <Button
            variant="danger"
            loading={decide.isPending && decide.variables === "reject"}
            disabled={decide.isPending}
            onClick={reject}
          >
            {!(decide.isPending && decide.variables === "reject") && <X aria-hidden />}
            رد
          </Button>
        </div>
      </CardContent>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`${data.change.kind.label} ریسک ${data.change.risk.code} تأیید شود؟`}
        description={decision.effect}
        confirmLabel="تأیید"
        loading={decide.isPending}
        onConfirm={() => decide.mutate("approve")}
      />
    </Card>
  );
}

export function ChangeRequestDetailPage() {
  const page = usePageData<ChangeDetail>();
  useTitle(page.data?.title ?? "درخواست ادغام یا تفکیک");
  const crumbs = [{ label: "ادغام و تفکیک", to: "/workflow/requests" }];
  if (!page.data) {
    return (
      <DetailState
        query={page}
        header={<PageHeader title="درخواست ادغام یا تفکیک" breadcrumb={[...crumbs, { label: "پرونده" }]} />}
      />
    );
  }
  const { change } = page.data;
  return (
    <article className="flex max-w-4xl flex-col gap-6">
      <PageHeader
        breadcrumb={[...crumbs, { label: change.risk.code, code: true }]}
        title={faText(page.data.title)}
        meta={<Status change={change} />}
      />
      <Card>
        <CardContent className="pt-5">
          <dl className="flex flex-col divide-y divide-line">
            <Fact label="ریسک">
              <AppLink href={change.risk.href}>
                <bdi className="code">{change.risk.code}</bdi> {change.risk.title}
              </AppLink>{" "}
              <span className="text-xs text-muted">· {change.risk.status.label}</span>
            </Fact>
            {change.merge_into && (
              <Fact label="ادغام در">
                <AppLink href={change.merge_into.href}>
                  <bdi className="code">{change.merge_into.code}</bdi> {change.merge_into.title}
                </AppLink>{" "}
                <span className="text-xs text-muted">· {change.merge_into.status.label}</span>
              </Fact>
            )}
            {change.part_titles.length > 0 && (
              <Fact label="بخش‌های تازه">
                <ul className="flex list-disc flex-col gap-1 ps-5">
                  {change.part_titles.map((title) => (
                    <li key={title}>{title}</li>
                  ))}
                </ul>
                {change.parts.length > 0 && (
                  <p className="mt-2 text-xs text-muted">
                    ساخته شد:{" "}
                    {change.parts.map((part, index) => (
                      <span key={part.code}>
                        {index > 0 && "، "}
                        <AppLink href={part.href}>
                          <bdi className="code">{part.code}</bdi>
                        </AppLink>
                      </span>
                    ))}
                  </p>
                )}
              </Fact>
            )}
            <Fact label="دلیل">
              <span className="whitespace-pre-line">{change.reason}</span>
            </Fact>
            <Fact label="پیشنهاددهنده">
              {change.proposed_by?.name}، {longDate(change.created_at)}
            </Fact>
            <Fact label="مالک ریسک">{change.owner?.name ?? "—"}</Fact>
            {change.decided_by && (
              <Fact label="تصمیم">
                {change.status.label} با {change.decided_by.name}
                {change.decided_at && `، ${longDate(change.decided_at)}`}
                {change.decision_note && <p className="mt-1 whitespace-pre-line text-fg/90">{change.decision_note}</p>}
              </Fact>
            )}
          </dl>
        </CardContent>
      </Card>
      <Decision data={page.data} />
    </article>
  );
}
