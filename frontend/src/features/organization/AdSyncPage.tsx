import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Select } from "@/components/ui/field";
import { Icon, type IconName } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { Chip, SectionPanel } from "@/components/ui/section-panel";
import { PageSkeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { ErrorState } from "@/components/ui/states";
import { Toggle } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { get, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fa, faText } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { AdSync } from "@/lib/types";

// «همگام‌سازی با Active Directory» به چیدمان فیگما ۲۸: نوار اتصال، چهار کاشی تغییر، نگاشت شاخه‌ها و پیش‌نمایش
// تغییر کاربران در ستون اصلی؛ قواعد همگام‌سازی و تاریخچه‌ی اجراها در ستون کناری.

const QUERY_KEY = ["ad-sync"];
const ENDPOINT = "org/ad-sync/";
const NEW_ROWS = 2;

const TILE: Record<
  string,
  { icon: IconName; tone: "info" | "warning" | "danger" | "neutral"; value: "ink" | "warning" | "danger" }
> = {
  new: { icon: "user", tone: "info", value: "ink" },
  moved: { icon: "buildings", tone: "warning", value: "warning" },
  disabled: { icon: "x-circle", tone: "danger", value: "danger" },
  unmapped: { icon: "layers", tone: "neutral", value: "ink" },
};

const RUN_ICON: Record<string, IconName> = { preview: "clock", applied: "check-circle", failed: "x-circle" };

type Change = AdSync["changes"][number];

function useAction() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => post<AdSync & { message: string | null }>(ENDPOINT, body),
    onSuccess: (page) => {
      queryClient.setQueryData(QUERY_KEY, page);
      if (page.message) toast({ title: page.message });
    },
    onError: (failure: Error) => toast({ title: faText(failure.message), tone: "danger" }),
  });
}

function Connection({ data }: { data: AdSync }) {
  const action = useAction();
  const conn = data.connection;
  const facts = [
    { label: "شاخه‌ی پایه", value: conn.base_dn, code: true },
    { label: "حساب سرویس", value: conn.service_account, code: false },
    { label: "زمان‌بندی", value: conn.schedule, code: false },
  ];
  return (
    <Card className="flex flex-wrap items-center gap-x-8 gap-y-4 px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-success-subtle text-success">
          <Icon name="link" size={18} />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-semibold text-ink">اتصال LDAPS</span>
          <bdi className="code truncate text-xs text-ink-2">{conn.server}</bdi>
        </span>
      </div>
      <dl className="flex flex-1 flex-wrap gap-x-8 gap-y-3 border-line lg:border-s lg:ps-8">
        {facts.map((fact) => (
          <div key={fact.label} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-xs text-ink-3">{fact.label}</dt>
            <dd className={cn("text-sm text-ink", fact.code && "code text-xs")}>
              {fact.code ? <bdi>{fact.value}</bdi> : fact.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex items-center gap-3">
        <Chip tone={conn.state.tone}>{conn.state.label}</Chip>
        <Button
          variant="link"
          loading={action.isPending}
          onClick={() => action.mutate({ action: "test" })}
          title={conn.tested ? `آخرین آزمون: ${conn.tested}` : undefined}
        >
          <Icon name="check" />
          آزمون اتصال
        </Button>
      </div>
    </Card>
  );
}

function Branches({ data }: { data: AdSync }) {
  const action = useAction();
  return (
    <SectionPanel
      title="نگاشت شاخه‌های AD به واحد سازمانی"
      description="شاخه‌ی نگاشت‌نشده تا تعیین واحد، کاربرانش را وارد نمی‌کند"
      bodyClassName="p-0"
    >
      <div className="table-shell">
        <table className="data-table">
          <caption className="sr-only">نگاشت شاخه‌های AD به واحد سازمانی</caption>
          <thead>
            <tr>
              <th scope="col">شاخه در AD</th>
              <th scope="col">واحد در چارت سازمانی</th>
              <th scope="col">کاربران</th>
              <th scope="col">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {data.branches.map((branch) => (
              <tr key={branch.key} className={cn(branch.state === "unmapped" && "bg-warning-subtle")}>
                <td data-primary>
                  <bdi className="code text-xs text-ink">{branch.ou}</bdi>
                </td>
                <td data-label="واحد" data-wide className="text-sm font-semibold text-ink">
                  {branch.state === "unmapped" ? (
                    <Select
                      aria-label={`واحد شاخه‌ی ${branch.ou}`}
                      value=""
                      disabled={action.isPending}
                      onChange={(event) => action.mutate({ action: "map", ou: branch.key, unit: event.target.value })}
                      className="max-w-sm bg-surface"
                    >
                      <option value="" disabled>
                        انتخاب واحد…
                      </option>
                      {data.unit_options.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.name}
                        </option>
                      ))}
                      <option value="exclude">مستثنا از همگام‌سازی</option>
                    </Select>
                  ) : branch.state === "excluded" ? (
                    "مستثنا از همگام‌سازی"
                  ) : (
                    branch.unit
                  )}
                </td>
                <td data-label="کاربران" className="text-sm text-ink-2 tabular-nums">
                  {fa(branch.users)}
                </td>
                <td data-label="وضعیت">
                  {branch.state === "unmapped" ? (
                    <span className="text-sm font-semibold text-warning">{branch.status.label}</span>
                  ) : (
                    <Chip tone={branch.status.tone}>{branch.status.label}</Chip>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionPanel>
  );
}

function ChangeAction({ row, onSuccessor }: { row: Change; onSuccessor: (row: Change) => void }) {
  if (row.action.kind === "successor" || row.action.kind === "delegate")
    return (
      <Button variant="outline" size="sm" onClick={() => onSuccessor(row)}>
        {row.action.label}
      </Button>
    );
  if (row.action.kind === "review" && row.action.href)
    return (
      <Link to={row.action.href} className="text-sm font-semibold text-brand hover:underline">
        {row.action.label}
      </Link>
    );
  return <span className="text-xs text-ink-3">{row.action.label}</span>;
}

const IMPACT_TONE: Record<string, string> = {
  danger: "text-danger",
  warning: "text-warning",
  neutral: "text-ink-2",
};

function Changes({ data, onSuccessor }: { data: AdSync; onSuccessor: (row: Change) => void }) {
  const [onlyImpact, setOnlyImpact] = useState(false);
  const [allNew, setAllNew] = useState(false);
  const withImpact = data.changes.filter((row) => row.impact.tone !== "neutral");
  const base = onlyImpact ? withImpact : data.changes;
  const newRows = base.filter((row) => row.kind === "new");
  const hidden = allNew ? 0 : Math.max(0, newRows.length - NEW_ROWS);
  const shownNew = new Set(newRows.slice(0, allNew ? newRows.length : NEW_ROWS).map((row) => row.key));
  const rows = base.filter((row) => row.kind !== "new" || shownNew.has(row.key));
  return (
    <SectionPanel
      title="پیش‌نمایش تغییر کاربران"
      description="اثر هر تغییر بر نقش‌ها و مسئولیت‌های باز پیش از اعمال نشان داده می‌شود"
      aside={
        <Button variant="link" aria-pressed={onlyImpact} onClick={() => setOnlyImpact((on) => !on)}>
          <Icon name="funnel" />
          {onlyImpact ? "همه‌ی موارد" : "فقط موارد دارای اثر"}
        </Button>
      }
      bodyClassName="p-0"
    >
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-ink-3">تغییری در انتظار نیست.</p>
      ) : (
        <div className="table-shell">
          <table className="data-table">
            <caption className="sr-only">پیش‌نمایش تغییر کاربران</caption>
            <thead>
              <tr>
                <th scope="col">کاربر</th>
                <th scope="col">تغییر</th>
                <th scope="col">واحد</th>
                <th scope="col">اثر بر نقش و مسئولیت</th>
                <th scope="col">اقدام</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className={cn(row.attention && "bg-danger-subtle")}>
                  <td data-primary>
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold text-ink">{row.user.name}</span>
                      <bdi className="code text-xs text-ink-3">{row.user.username}</bdi>
                    </span>
                  </td>
                  <td data-label="تغییر">
                    <Chip tone={row.tone}>{row.label}</Chip>
                  </td>
                  <td data-label="واحد" className="text-sm text-ink-2">
                    {row.unit}
                  </td>
                  <td data-label="اثر" data-wide className={cn("text-sm leading-6", IMPACT_TONE[row.impact.tone])}>
                    {row.impact.text}
                  </td>
                  <td data-label="اقدام">
                    <ChangeAction row={row} onSuccessor={onSuccessor} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="flex flex-wrap items-center gap-1 border-t border-line px-5 py-3 text-xs text-ink-3">
        {hidden > 0 && (
          <>
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setAllNew(true)}>
              و {fa(hidden)} کاربر جدید دیگر
            </Button>
            <span aria-hidden>{" · "}</span>
          </>
        )}
        {fa(data.unchanged)} کاربر بدون تغییر
      </p>
    </SectionPanel>
  );
}

function Rules({ data }: { data: AdSync }) {
  const action = useAction();
  return (
    <SectionPanel title="قواعد همگام‌سازی">
      <ul className="flex flex-col divide-y divide-line">
        {data.rules.map((rule) => (
          <li key={rule.key} className="flex items-center justify-between gap-3 py-2.5">
            <span className="flex flex-col">
              <span id={`rule-${rule.key}`} className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                {rule.locked && <Icon name="lock" size={14} className="text-ink-3" />}
                {rule.label}
              </span>
              <span className="text-xs text-ink-3">{rule.note}</span>
            </span>
            <Toggle
              checked={rule.on}
              disabled={rule.locked || action.isPending}
              onCheckedChange={(on) => action.mutate({ action: "rules", key: rule.key, on })}
              aria-labelledby={`rule-${rule.key}`}
            />
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-start gap-2 rounded-lg bg-info-subtle px-3 py-2.5 text-sm leading-6 text-ink">
        <Icon name="shield-check" size={16} className="mt-1 shrink-0 text-info" />
        {data.rules_note}
      </p>
    </SectionPanel>
  );
}

function History({ data }: { data: AdSync }) {
  const [all, setAll] = useState(false);
  const runs = all ? data.history : data.history.slice(0, 4);
  return (
    <SectionPanel
      title="تاریخچه‌ی همگام‌سازی"
      aside={
        data.history.length > 4 && (
          <Button variant="link" size="sm" aria-expanded={all} onClick={() => setAll((open) => !open)}>
            {all ? "کمتر" : "همه"}
          </Button>
        )
      }
    >
      {runs.length === 0 ? (
        <p className="text-sm text-ink-3">هنوز اجرایی ثبت نشده است.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {runs.map((run) => (
            <li key={run.id} className="flex items-start gap-3 py-2.5">
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full",
                  run.tone === "success" && "bg-success-subtle text-success",
                  run.tone === "warning" && "bg-warning-subtle text-warning",
                  run.tone === "danger" && "bg-danger-subtle text-danger",
                )}
              >
                <Icon name={RUN_ICON[run.status] ?? "clock"} size={14} />
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-semibold text-ink">{run.title}</span>
                <span className="text-xs text-ink-3">{run.note}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionPanel>
  );
}

function SuccessorDialog({ row, data, onClose }: { row: Change | null; data: AdSync; onClose: () => void }) {
  const action = useAction();
  const [successor, setSuccessor] = useState("");
  const options = data.successors.filter((user) => user.id !== row?.user.id);
  return (
    <ConfirmDialog
      open={row !== null}
      onOpenChange={(open) => {
        if (!open) {
          setSuccessor("");
          onClose();
        }
      }}
      title={row ? `${row.action.label} برای ${row.user.name}` : ""}
      description={
        row
          ? `${row.impact.text}. ریسک‌های باز، نقش در اقدام‌های باز و مدیریت واحدها به جانشین منتقل می‌شود و سوابق بسته به نام همین کاربر می‌ماند.`
          : ""
      }
      confirmLabel="انتقال مسئولیت‌ها"
      confirmDisabled={!successor}
      loading={action.isPending}
      onConfirm={() =>
        row &&
        action.mutate(
          { action: "successor", user: row.user.id, successor: Number(successor) },
          {
            onSuccess: () => {
              setSuccessor("");
              onClose();
            },
          },
        )
      }
    >
      <Field label="جانشین">
        <Select value={successor} onChange={(event) => setSuccessor(event.target.value)}>
          <option value="" disabled>
            انتخاب کاربر…
          </option>
          {options.map((user) => (
            <option key={user.id} value={user.id}>
              {user.unit ? `${user.name} · ${user.unit}` : user.name}
            </option>
          ))}
        </Select>
      </Field>
    </ConfirmDialog>
  );
}

function Sync({ data }: { data: AdSync }) {
  const action = useAction();
  const [confirm, setConfirm] = useState(false);
  const [successorFor, setSuccessorFor] = useState<Change | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={data.title}
        breadcrumb={[{ label: "چارت سازمانی", to: data.org_chart }, { label: "همگام‌سازی با AD" }]}
        meta={data.pending > 0 && <Chip tone="warning">{fa(data.pending)} مورد در انتظار</Chip>}
        description={data.subtitle}
        actions={
          <>
            <Button
              variant="link"
              loading={action.isPending && action.variables?.action === "preview"}
              onClick={() => action.mutate({ action: "preview" })}
            >
              <Icon name="flow" />
              پیش‌نمایش دوباره
            </Button>
            <Button variant="primary" disabled={data.applicable === 0} onClick={() => setConfirm(true)}>
              <Icon name="check" />
              اعمال {fa(data.applicable)} تغییر
            </Button>
          </>
        }
      />
      <Connection data={data} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.tiles.map((tile) => (
          <StatTile
            key={tile.key}
            label={tile.label}
            value={fa(tile.value)}
            note={tile.note}
            icon={TILE[tile.key]?.icon}
            tone={TILE[tile.key]?.tone}
            valueTone={TILE[tile.key]?.value}
          />
        ))}
      </div>
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Branches data={data} />
          <Changes data={data} onSuccessor={setSuccessorFor} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Rules data={data} />
          <History data={data} />
        </div>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`اعمال ${fa(data.applicable)} تغییر AD`}
        description="کاربران جدید بدون نقش ساخته می‌شوند، واحد کاربران جابه‌جاشده عوض می‌شود و حساب‌های غیرفعال در AD غیرفعال می‌شوند. نقش‌ها و سوابق دست نمی‌خورند."
        confirmLabel={`اعمال ${fa(data.applicable)} تغییر`}
        loading={action.isPending}
        onConfirm={() => action.mutate({ action: "apply" }, { onSuccess: () => setConfirm(false) })}
      />
      <SuccessorDialog row={successorFor} data={data} onClose={() => setSuccessorFor(null)} />
    </div>
  );
}

export function AdSyncPage() {
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: ({ signal }) => get<AdSync>(ENDPOINT, signal) });
  useTitle("همگام‌سازی با AD");
  if (query.isError) return <ErrorState error={query.error} retry={() => query.refetch()} />;
  if (!query.data) return <PageSkeleton rows={8} />;
  return <Sync data={query.data} />;
}
