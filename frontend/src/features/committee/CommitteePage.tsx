import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { RISK_CLASSES, riskKey } from "@/components/ui/level-badge";
import { PageHeader } from "@/components/ui/page-header";
import { Chip, SectionPanel } from "@/components/ui/section-panel";
import { PageSkeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { get, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fa, faText } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { AgendaStatus, CommitteeCase, CommitteeMeeting, Level } from "@/lib/types";

// «جلسه‌ی کمیته‌ی امنیت» به چیدمان فیگما ۲۳: کاشی‌های دستور جلسه، حد نصاب، مصوبات باز و زمان؛ دستور جلسه و پرونده‌ی
// تصمیم مورد انتخاب‌شده با گزینه‌ها و رأی؛ و در ستون کناری حاضران، امضای مصوبات و اختیار تصمیم هر سطح.

const STATUS_TONE: Record<AgendaStatus, "info" | "success" | "neutral" | "warning"> = {
  review: "info",
  approved: "success",
  pending: "neutral",
  deferred: "warning",
};

function LevelChip({ level, label }: { level: Level | null; label?: string }) {
  if (!level) return <Chip tone="warning">{label ?? "روش"}</Chip>;
  const tone = RISK_CLASSES[riskKey(level)];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold",
        tone.bg,
        tone.fg,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", tone.dot)} />
      {level.name}
    </span>
  );
}

function Agenda({
  data,
  selected,
  onSelect,
  onAdd,
}: {
  data: CommitteeMeeting;
  selected: number | undefined;
  onSelect: (id: number) => void;
  onAdd: () => void;
}) {
  return (
    <SectionPanel
      title="دستور جلسه"
      description="ترتیب بر اساس سطح، سپس شدت پیامد و گسترش بین مشتریان"
      aside={
        data.can_run && data.candidates.length > 0 ? (
          <Button variant="link" size="sm" onClick={onAdd}>
            <Icon name="plus" />
            افزودن مورد
          </Button>
        ) : undefined
      }
      bodyClassName="p-0"
    >
      <div className="table-shell">
        <table className="data-table">
          <caption className="sr-only">دستور جلسه؛ برای دیدن پرونده‌ی تصمیم، موضوع را بزنید</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">موضوع</th>
              <th scope="col">سطح</th>
              <th scope="col">نوع تصمیم</th>
              <th scope="col">مالک</th>
              <th scope="col">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {data.agenda.map((row) => (
              <tr key={row.id} className={cn(row.id === selected && "bg-brand-subtle/60")}>
                <td data-label="#" className="text-sm text-ink-3 tabular">
                  {fa(row.number)}
                </td>
                <td data-primary>
                  <button
                    type="button"
                    onClick={() => onSelect(row.id)}
                    aria-current={row.id === selected || undefined}
                    className={cn(
                      "rounded-sm text-start text-sm font-semibold hover:text-brand focus-visible:shadow-focus focus-visible:outline-none",
                      row.id === selected ? "text-brand" : "text-ink",
                    )}
                  >
                    {row.subject}
                  </button>
                  {row.reference && <bdi className="code block text-xs text-ink-3">{row.reference}</bdi>}
                </td>
                <td data-label="سطح">
                  <LevelChip level={row.level} />
                </td>
                <td data-label="نوع تصمیم" data-wide className="text-sm text-ink-2">
                  {row.kind}
                </td>
                <td data-label="مالک" className="text-sm text-ink-2">
                  {row.owner ?? "—"}
                </td>
                <td data-label="وضعیت">
                  <Chip tone={STATUS_TONE[row.status.value]}>{row.status.label}</Chip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionPanel>
  );
}

const VOTES = ["موافق", "مخالف", "ممتنع"] as const;

function CaseFile({
  data,
  item,
  onChanged,
}: {
  data: CommitteeMeeting;
  item: CommitteeCase;
  onChanged: (page: CommitteeMeeting) => void;
}) {
  const toast = useToast();
  const decided = item.decision;
  const [choice, setChoice] = useState<number | null>(
    decided?.chosen ?? item.options.find((option) => option.owner_proposal)?.id ?? null,
  );
  const [votes, setVotes] = useState<[number, number, number]>([item.voters, 0, 0]);
  const [text, setText] = useState("");
  const [confirm, setConfirm] = useState<"resolve" | "defer" | null>(null);
  const [reason, setReason] = useState("");
  const act = useMutation({
    mutationFn: (action: "resolve" | "defer" | "review") =>
      post<CommitteeMeeting>(
        `committee/items/${item.id}/${action}/`,
        action === "resolve" ? { option: choice, votes, text } : action === "defer" ? { reason } : {},
      ),
    onSuccess: (page, action) => {
      onChanged(page);
      setConfirm(null);
      if (action !== "review") toast({ title: action === "resolve" ? "مصوبه ثبت شد" : "به جلسه‌ی بعد ارجاع شد" });
    },
    onError: (failure: Error) => toast({ title: faText(failure.message), tone: "danger" }),
  });
  const open = data.can_run && !decided;
  const total = votes[0] + votes[1] + votes[2];
  const tone = item.level ? RISK_CLASSES[riskKey(item.level)] : null;
  return (
    <section
      aria-labelledby="case-title"
      className="flex flex-col overflow-hidden rounded-lg border border-line bg-panel"
    >
      <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <span className="flex min-w-0 flex-col gap-1">
          <h2 id="case-title" className="text-h3 font-semibold text-ink">
            پرونده‌ی تصمیم · {item.subject}
          </h2>
          <span className="text-xs text-ink-3">
            {item.assessment ? (
              <>
                ارزیابی{" "}
                <AppLink href={item.assessment.href} className="code text-ink-2 hover:text-brand">
                  {item.assessment.code}
                </AppLink>
                {item.scenario && <> · سناریوی مرجع {item.scenario}</>}
                {item.assessment.confidence && <> · اطمینان: {item.assessment.confidence}</>}
              </>
            ) : item.reference ? (
              <>
                مرجع <bdi className="code">{item.reference}</bdi> · ارائه‌دهنده: {item.owner?.name ?? "—"}
              </>
            ) : (
              item.kind.label
            )}
          </span>
        </span>
        {item.score && (
          <span className="flex shrink-0 items-center gap-2">
            <span
              className={cn(
                "grid h-8 min-w-10 place-items-center rounded-md border-2 px-2 text-sm font-semibold tabular",
                tone ? cn(tone.border, tone.bg, tone.fg) : "border-line",
              )}
            >
              {item.score}
            </span>
            <LevelChip level={item.level ?? null} />
          </span>
        )}
      </header>
      <div className="flex flex-col gap-4 px-5 py-4">
        {item.facts && item.facts.length > 0 && (
          // دو ستون پرشونده از بالا به پایین، مثل فیگما: ستون راست احتمال × پیامد، مالک و خدمت.
          <dl
            className="grid grid-cols-1 gap-x-6 sm:grid-flow-col sm:grid-cols-2 sm:grid-rows-[repeat(var(--rows),auto)]"
            style={{ "--rows": Math.ceil(item.facts.length / 2) } as CSSProperties}
          >
            {item.facts.map((fact) => (
              <div key={fact.label} className="flex items-center justify-between gap-3 border-b border-line py-2.5">
                <dt className="text-sm text-ink-3">{fact.label}</dt>
                <dd className="text-sm font-semibold text-ink">{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {item.policy && (
          <p className="flex items-start gap-2 rounded-lg bg-danger-subtle px-4 py-3 text-sm leading-6 text-ink">
            <Icon name="lightning" size={16} className="mt-1 shrink-0 text-danger" />
            {item.policy}
          </p>
        )}
        {item.options.length > 0 && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-semibold text-ink">گزینه‌های بررسی‌شده</legend>
            {item.options.map((option) => {
              const active = choice === option.id;
              return (
                <label
                  key={option.id}
                  className={cn(
                    "flex flex-col gap-2 rounded-lg border p-4 transition-colors",
                    active ? "border-2 border-brand bg-brand-subtle/40" : "border-line",
                    open && "cursor-pointer hover:border-brand",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`option-${item.id}`}
                        value={option.id}
                        checked={active}
                        disabled={!open}
                        onChange={() => setChoice(option.id)}
                        className="size-4 accent-[var(--color-brand)]"
                      />
                      <span className="text-sm font-semibold text-ink">{option.title}</span>
                    </span>
                    {option.owner_proposal && <span className="text-xs font-medium text-brand">پیشنهاد مالک</span>}
                    {decided?.chosen === option.id && <Chip tone="success">مصوب</Chip>}
                  </span>
                  <span className="text-sm leading-6 text-ink-2">{option.description}</span>
                  {option.chips.length > 0 && (
                    <span className="flex flex-wrap gap-1.5">
                      {option.chips.map((chip) =>
                        chip.level ? (
                          <span
                            key={chip.text}
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs font-semibold",
                              RISK_CLASSES[riskKey(chip.level)].bg,
                              RISK_CLASSES[riskKey(chip.level)].fg,
                            )}
                          >
                            {chip.text}
                          </span>
                        ) : (
                          <Chip key={chip.text} tone={chip.tone}>
                            {chip.text}
                          </Chip>
                        ),
                      )}
                    </span>
                  )}
                </label>
              );
            })}
          </fieldset>
        )}
        {decided ? (
          <div className="flex flex-col gap-2 rounded-lg bg-subtle px-4 py-3">
            <span className="flex flex-wrap items-center gap-2">
              <Chip tone={STATUS_TONE[item.status.value]}>{item.status.label}</Chip>
              {item.status.value === "approved" &&
                VOTES.map((label, index) => (
                  <Chip key={label} tone={index === 0 ? "success" : "neutral"}>
                    {label} {fa(decided.votes[index] ?? 0)}
                  </Chip>
                ))}
            </span>
            <p className="text-sm text-ink">{decided.text}</p>
            {decided.by && (
              <span className="text-xs text-ink-3">
                ثبت: {decided.by.name}
                {decided.at && <> · {fa(decided.at.jalali)}</>}
              </span>
            )}
          </div>
        ) : data.can_run && item.status.value === "pending" ? (
          <div className="flex justify-end">
            <Button variant="outline" loading={act.isPending} onClick={() => act.mutate("review")}>
              <Icon name="eye" />
              شروع بررسی در جلسه
            </Button>
          </div>
        ) : open ? (
          <div className="flex flex-col gap-3 rounded-lg bg-subtle px-4 py-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <fieldset className="flex flex-wrap items-end gap-2">
                <legend className="sr-only">رأی‌ها</legend>
                {VOTES.map((label, index) => (
                  <label key={label} className="flex items-center gap-1.5 text-sm text-ink-2">
                    {label}
                    <Input
                      type="number"
                      min={0}
                      max={item.voters}
                      value={votes[index]}
                      onChange={(event) => {
                        const next = [...votes] as [number, number, number];
                        next[index] = Math.max(0, Number(event.target.value) || 0);
                        setVotes(next);
                      }}
                      className="h-8 w-16 text-center"
                    />
                  </label>
                ))}
              </fieldset>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="link" onClick={() => setConfirm("defer")}>
                  ارجاع به جلسه‌ی بعد
                </Button>
                <Button
                  variant="primary"
                  disabled={(item.options.length > 0 && !choice) || total > item.voters || votes[0] <= votes[1]}
                  onClick={() => setConfirm("resolve")}
                >
                  <Icon name="check" />
                  ثبت مصوبه
                </Button>
              </div>
            </div>
            <p className="text-xs text-ink-3">
              {item.conflict ? "مالک ریسک در رأی‌گیری پرونده‌ی خود شرکت نمی‌کند" : "ناظر رأی ندارد"} · {fa(item.voters)}{" "}
              عضو رأی‌دهنده‌ی حاضر
            </p>
          </div>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirm === "resolve"}
        onOpenChange={(value) => !value && setConfirm(null)}
        title="ثبت مصوبه"
        description={`${item.options.find((option) => option.id === choice)?.title ?? item.kind.label} با ${fa(votes[0])} رأی موافق، ${fa(votes[1])} مخالف و ${fa(votes[2])} ممتنع. پس از ثبت، امضای رئیس، دبیر و مالک ریسک خواسته می‌شود.`}
        confirmLabel="ثبت مصوبه"
        loading={act.isPending}
        onConfirm={() => act.mutate("resolve")}
      >
        <Field label="متن مصوبه" hint="اختیاری؛ خالی بماند عنوان گزینه‌ی مصوب ثبت می‌شود.">
          <Textarea rows={3} value={text} onChange={(event) => setText(event.target.value)} />
        </Field>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === "defer"}
        onOpenChange={(value) => !value && setConfirm(null)}
        title="ارجاع به جلسه‌ی بعد"
        description="مورد بدون مصوبه می‌ماند و دلیل ارجاع در صورت‌جلسه می‌آید."
        confirmLabel="ارجاع"
        loading={act.isPending}
        confirmDisabled={!reason.trim()}
        onConfirm={() => act.mutate("defer")}
      >
        <Field label="دلیل ارجاع" required>
          <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </ConfirmDialog>
    </section>
  );
}

const ATTENDEE_TONE = { present: "success", conflict: "neutral", observer: "neutral", absent: "neutral" } as const;

function Attendees({ data }: { data: CommitteeMeeting }) {
  return (
    <SectionPanel
      title="حاضران و حد نصاب"
      description={data.quorum.text}
      aside={
        <Chip tone={data.quorum.met ? "success" : "danger"}>
          <Icon name={data.quorum.met ? "check" : "x"} size={12} />
          {data.quorum.met ? "برقرار" : "برقرار نیست"}
        </Chip>
      }
    >
      <ul className="flex flex-col divide-y divide-line">
        {data.attendees.map((person) => (
          <li
            key={person.id}
            className={cn("flex items-center gap-3 py-2.5", person.state === "absent" && "opacity-70")}
          >
            <Avatar name={person.name} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-semibold text-ink">{person.name}</span>
              <span className="text-xs text-ink-3">{person.line}</span>
            </span>
            <Chip tone={ATTENDEE_TONE[person.state]}>{person.state_label}</Chip>
          </li>
        ))}
      </ul>
    </SectionPanel>
  );
}

function Signatures({ data, onChanged }: { data: CommitteeMeeting; onChanged: (page: CommitteeMeeting) => void }) {
  const toast = useToast();
  const sign = useMutation({
    mutationFn: () => post<CommitteeMeeting>(`committee/items/${data.signatures?.item}/sign/`, {}),
    onSuccess: (page) => {
      onChanged(page);
      toast({ title: "مصوبه امضا شد" });
    },
    onError: (failure: Error) => toast({ title: faText(failure.message), tone: "danger" }),
  });
  if (!data.signatures) return null;
  return (
    <SectionPanel title="امضای مصوبات" description={data.signatures.title}>
      <ul className="flex flex-col divide-y divide-line">
        {data.signatures.rows.map((row) => (
          <li key={row.id} className="flex items-center gap-3 py-2.5">
            <Icon
              name={row.signed_at ? "check-circle" : "clock"}
              size={18}
              className={cn("shrink-0", row.signed_at ? "text-success" : "text-warning")}
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-semibold text-ink">{row.name}</span>
              <span className="text-xs text-ink-3">{row.role}</span>
            </span>
            {row.mine ? (
              <Button size="sm" variant="outline" loading={sign.isPending} onClick={() => sign.mutate()}>
                <Icon name="signature" />
                امضا
              </Button>
            ) : (
              <span className={cn("text-xs tabular", row.signed_at ? "text-ink-2" : "text-warning")}>
                {row.signed_at ?? "در انتظار"}
              </span>
            )}
          </li>
        ))}
      </ul>
      {data.signatures.owner_note && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-brand-subtle px-3 py-2.5 text-sm leading-6 text-ink">
          <Icon name="info" size={16} className="mt-1 shrink-0 text-brand" />
          تأیید مالک برای طرح و ریسک باقیمانده اخذ می‌شود؛ مجوز مقام بالاتر جای این پاسخ‌گویی را نمی‌گیرد.
        </p>
      )}
    </SectionPanel>
  );
}

function Authority({ data }: { data: CommitteeMeeting }) {
  return (
    <SectionPanel title="اختیار تصمیم" description="بخش ۱۹ روش · اشتهای ریسک">
      <ul className="flex flex-col divide-y divide-line">
        {data.authority.map((row) => (
          <li key={row.level.rank} className="flex flex-col gap-1 py-2.5">
            <span className="flex items-start justify-between gap-2">
              <span className="text-sm font-semibold text-ink">{row.rule}</span>
              <LevelChip level={row.level} />
            </span>
            <span className="text-xs text-ink-3">{row.deadline}</span>
          </li>
        ))}
      </ul>
      {data.restricted && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-warning-subtle px-3 py-2.5 text-sm leading-6 text-ink">
          <Icon name="warning" size={16} className="mt-1 shrink-0 text-warning" />
          {data.restricted}
        </p>
      )}
    </SectionPanel>
  );
}

function Minutes({
  data,
  open,
  onOpenChange,
}: {
  data: CommitteeMeeting;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`صورت‌جلسه · ${data.code}`}
        description={data.subtitle}
        className="w-[min(40rem,calc(100vw-2rem))]"
      >
        <ol className="flex flex-col divide-y divide-line">
          {data.minutes.map((row) => (
            <li key={row.number} className="flex flex-col gap-1 py-2.5">
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink">
                  {fa(row.number)}. {row.subject}
                </span>
                <span className="text-xs text-ink-3">{row.status}</span>
              </span>
              {row.text && <span className="text-sm text-ink-2">{row.text}</span>}
              {row.votes && (
                <span className="text-xs text-ink-3">
                  موافق {fa(row.votes[0])} · مخالف {fa(row.votes[1])} · ممتنع {fa(row.votes[2])}
                </span>
              )}
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}

function AddItem({
  data,
  open,
  onOpenChange,
  onDone,
}: {
  data: CommitteeMeeting;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (page: CommitteeMeeting) => void;
}) {
  const toast = useToast();
  const [risk, setRisk] = useState("");
  const [kind, setKind] = useState("exposure");
  const [detail, setDetail] = useState("");
  const add = useMutation({
    mutationFn: () =>
      post<CommitteeMeeting>(`committee/meetings/${data.id}/items/`, { risk: Number(risk), kind, detail }),
    onSuccess: (page) => {
      onDone(page);
      setRisk("");
      setDetail("");
    },
    onError: (failure: Error) => toast({ title: faText(failure.message), tone: "danger" }),
  });
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="افزودن مورد به دستور جلسه"
      description="ریسک‌های بالا و بحرانی که هنوز در دستور این جلسه نیستند."
      confirmLabel="افزودن"
      loading={add.isPending}
      confirmDisabled={!risk}
      onConfirm={() => add.mutate()}
    >
      <div className="flex flex-col gap-3">
        <Field label="ریسک" required>
          <Select value={risk} onChange={(event) => setRisk(event.target.value)}>
            <option value="">انتخاب ریسک…</option>
            {data.candidates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} · {item.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="نوع تصمیم" required>
          <Select value={kind} onChange={(event) => setKind(event.target.value)}>
            {data.kinds
              .filter((item) => item.value !== "method")
              .map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="جزئیات" hint="مثلاً «فوری» یا «۹۰ روزه».">
          <Input value={detail} onChange={(event) => setDetail(event.target.value)} />
        </Field>
      </div>
    </ConfirmDialog>
  );
}

export function CommitteePage() {
  const { pk } = useParams();
  const [params, setParams] = useSearchParams();
  const item = params.get("item");
  const base = pk ? `committee/meetings/${pk}/` : "committee/meetings/current/";
  const queryKey = ["committee", pk ?? "current", item ?? "default"];
  const queryClient = useQueryClient();
  const toast = useToast();
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => get<CommitteeMeeting>(`${base}${item ? `?item=${item}` : ""}`, signal),
  });
  const data = query.data;
  useTitle("جلسه‌ی کمیته‌ی امنیت");
  const [dialog, setDialog] = useState<"minutes" | "close" | "add" | null>(null);
  const select = (id: number, page?: CommitteeMeeting) => {
    if (page) queryClient.setQueryData(["committee", pk ?? "current", String(id)], page);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set("item", String(id));
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  };
  const changed = (page: CommitteeMeeting) => {
    queryClient.setQueryData(queryKey, page);
    void queryClient.invalidateQueries({ queryKey: ["committee"], refetchType: "none" });
    if (page.selected && String(page.selected.id) !== item) select(page.selected.id, page);
  };
  const close = useMutation({
    mutationFn: () => post<CommitteeMeeting>(`committee/meetings/${data?.id}/close/`, {}),
    onSuccess: (page) => {
      changed(page);
      setDialog(null);
      toast({ title: "جلسه بسته شد و مصوبات برای مالکان ریسک اعلان شد" });
    },
    onError: (failure: Error) => toast({ title: faText(failure.message), tone: "danger" }),
  });

  if (query.isError) return <ErrorState error={query.error} retry={() => query.refetch()} />;
  if (!data) return <PageSkeleton rows={8} />;

  const pending = data.agenda.filter((row) => row.status.value === "pending" || row.status.value === "review").length;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={data.title}
        breadcrumb={[{ label: "سنجش ریسک", to: "/evaluation" }, { label: "جلسه‌ی کمیته‌ی امنیت" }]}
        meta={<Chip tone={data.status.value === "open" ? "info" : "neutral"}>{data.status.label}</Chip>}
        description={data.subtitle}
        actions={
          <>
            <Button variant="link" onClick={() => setDialog("minutes")}>
              <Icon name="file-text" />
              صورت‌جلسه
            </Button>
            {data.can_run && (
              <Button variant="primary" onClick={() => setDialog("close")}>
                <Icon name="check-square" />
                بستن جلسه و انتشار مصوبات
              </Button>
            )}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label="دستور جلسه" value={data.stats.agenda.count} note={data.stats.agenda.note} icon="list" />
        <StatTile
          label="حد نصاب"
          value={`${data.stats.quorum.present} از ${data.stats.quorum.total}`}
          note={data.stats.quorum.note}
          icon="users"
          tone={data.stats.quorum.met ? "success" : "danger"}
          valueTone={data.stats.quorum.met ? "success" : "danger"}
        />
        <StatTile
          label="مصوبات باز جلسه‌ی قبل"
          value={data.stats.previous.count}
          note={data.stats.previous.note}
          icon="check-square"
          tone="warning"
          valueTone={data.stats.previous.count !== "۰" ? "warning" : "ink"}
        />
        <StatTile
          label="زمان باقی‌مانده"
          value={data.stats.remaining.value}
          note={data.stats.remaining.note}
          icon="clock"
          tone="neutral"
        />
      </div>
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Agenda
            data={data}
            selected={data.selected?.id}
            onSelect={(id) => select(id)}
            onAdd={() => setDialog("add")}
          />
          {data.selected && (
            <CaseFile
              key={`${data.selected.id}-${data.selected.status.value}`}
              data={data}
              item={data.selected}
              onChanged={changed}
            />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Attendees data={data} />
          <Signatures data={data} onChanged={changed} />
          <Authority data={data} />
        </div>
      </div>
      <Minutes data={data} open={dialog === "minutes"} onOpenChange={(open) => setDialog(open ? "minutes" : null)} />
      {data.can_run && (
        <>
          <ConfirmDialog
            open={dialog === "close"}
            onOpenChange={(open) => setDialog(open ? "close" : null)}
            title="بستن جلسه و انتشار مصوبات"
            description={
              pending
                ? `${fa(pending)} مورد هنوز تصمیم ندارد و به جلسه‌ی بعد ارجاع می‌شود. مصوبات برای مالک هر ریسک اعلان می‌شود و جلسه دیگر ویرایش نمی‌شود.`
                : "مصوبات برای مالک هر ریسک اعلان می‌شود و جلسه دیگر ویرایش نمی‌شود."
            }
            confirmLabel="بستن جلسه"
            loading={close.isPending}
            onConfirm={() => close.mutate()}
          />
          <AddItem
            data={data}
            open={dialog === "add"}
            onOpenChange={(open) => setDialog(open ? "add" : null)}
            onDone={(page) => {
              changed(page);
              setDialog(null);
              toast({ title: "مورد به دستور جلسه اضافه شد" });
            }}
          />
        </>
      )}
    </div>
  );
}
