import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { ConfirmDialog } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Icon, type IconName } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { Chip, SectionPanel } from "@/components/ui/section-panel";
import { PageSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { get, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fa, faText } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { UserProfile } from "@/lib/types";

// «پروفایل کاربر» به چیدمان فیگما ۲۹: هویت سازمانی، نقش‌ها و تفکیک وظایف و تفویض اختیار در ستون اصلی؛ مسئولیت‌های
// فعال و فعالیت اخیر در ستون کناری. تغییر نقش‌ها و تفویض تا «ذخیره‌ی تغییرات» فقط روی صفحه می‌ماند.

type DelegationDraft = {
  successor: string;
  starts_on: string;
  ends_on: string;
  max_rank: number | null;
  notify_successor: boolean;
  copy_owner: boolean;
};

const SOD_ICON: Record<string, { icon: IconName; className: string }> = {
  success: { icon: "check-circle", className: "text-success" },
  warning: { icon: "warning", className: "text-warning" },
  danger: { icon: "x-circle", className: "text-danger" },
};

const ACTIVITY_TONE: Record<string, string> = {
  info: "bg-info-subtle text-info",
  success: "bg-success-subtle text-success",
  warning: "bg-warning-subtle text-warning",
  danger: "bg-danger-subtle text-danger",
  neutral: "bg-subtle text-ink-2",
};

function draftOf(data: UserProfile): DelegationDraft | null {
  const found = data.delegation;
  if (!found) return null;
  return {
    successor: String(found.successor.id),
    starts_on: found.starts_on,
    ends_on: found.ends_on,
    max_rank: found.max_rank,
    notify_successor: found.notify_successor,
    copy_owner: found.copy_owner,
  };
}

function assignedRoles(data: UserProfile) {
  return data.roles.filter((role) => role.origin === "تخصیص در ERM").map((role) => role.key);
}

function Identity({ data }: { data: UserProfile }) {
  return (
    <SectionPanel
      title="هویت سازمانی"
      description={data.identity.locked ? "این فیلدها فقط از AD به‌روزرسانی می‌شوند" : "حساب محلی؛ ویرایش در فرم کاربر"}
      aside={
        data.identity.locked ? (
          <Chip>
            <Icon name="lock" size={12} />
            فقط خواندنی
          </Chip>
        ) : (
          <Button asChild variant="link" size="sm">
            <a href={data.identity.edit_url}>ویرایش در فرم کاربر</a>
          </Button>
        )
      }
    >
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        {data.identity.fields.map((field) => (
          <Field key={field.key} label={field.label}>
            <Input
              readOnly
              value={field.value}
              dir={field.code ? "ltr" : undefined}
              className={cn("bg-subtle text-ink", field.code && "code text-end")}
            />
          </Field>
        ))}
      </div>
    </SectionPanel>
  );
}

function Roles({ data, roles, onChange }: { data: UserProfile; roles: string[]; onChange: (roles: string[]) => void }) {
  const labels = new Map([
    ...data.roles.map((role) => [role.key, role.label] as const),
    ...data.available_roles.map((role) => [role.key, role.label] as const),
  ]);
  const derived = data.roles.filter((role) => role.origin !== "تخصیص در ERM");
  const assigned = roles.map(
    (key) =>
      data.roles.find((role) => role.key === key && role.origin === "تخصیص در ERM") ?? {
        key,
        label: labels.get(key) ?? key,
        tone: "info" as const,
        description: "پس از ذخیره افزوده می‌شود",
        scope: "—",
        origin: "تخصیص در ERM",
        since: null,
        removable: true,
      },
  );
  const rows = [...assigned, ...derived];
  const addable = [...data.available_roles, ...data.roles.filter((role) => role.removable)].filter(
    (role) => !roles.includes(role.key),
  );
  return (
    <SectionPanel
      title="نقش‌ها و دامنه"
      description="نقش‌ها فقط در ERM تخصیص داده می‌شوند، نه از گروه‌های AD"
      aside={
        addable.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Icon name="plus" />
                افزودن نقش
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {addable.map((role) => (
                <DropdownMenuItem key={role.key} onSelect={() => onChange([...roles, role.key])}>
                  {role.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      }
      bodyClassName="p-0"
    >
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-ink-3">نقشی ندارد.</p>
      ) : (
        <div className="table-shell">
          <table className="data-table">
            <caption className="sr-only">نقش‌ها و دامنه‌ی {data.name}</caption>
            <thead>
              <tr>
                <th scope="col">نقش</th>
                <th scope="col">دامنه</th>
                <th scope="col">منشأ</th>
                <th scope="col">از تاریخ</th>
                <th scope="col">
                  <span className="sr-only">عمل</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((role) => (
                <tr key={`${role.key}-${role.origin}`}>
                  <td data-primary>
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold text-ink">{role.label}</span>
                      <span className="text-xs leading-5 text-ink-3">{role.description}</span>
                    </span>
                  </td>
                  <td data-label="دامنه" className="text-sm text-ink-2">
                    {role.scope}
                  </td>
                  <td data-label="منشأ" className="text-sm whitespace-nowrap text-ink-2">
                    {role.origin}
                  </td>
                  <td data-label="از تاریخ" className="text-sm whitespace-nowrap text-ink-3">
                    {role.since ?? "—"}
                  </td>
                  <td className="w-0">
                    {role.removable ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`عمل‌های نقش ${role.label}`}>
                            <Icon name="dots" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => onChange(roles.filter((key) => key !== role.key))}>
                            برداشتن نقش
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-col gap-3 border-t border-line px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">نتیجه‌ی تفکیک وظایف</h3>
          <Chip tone={data.sod.chip.tone}>
            <Icon name={data.sod.chip.tone === "success" ? "shield-check" : "warning"} size={12} />
            {data.sod.chip.label}
          </Chip>
        </div>
        <ul className="flex flex-col gap-2">
          {data.sod.checks.map((check) => (
            <li key={check.text} className="flex items-start gap-2 text-sm leading-6 text-ink">
              <Icon
                name={SOD_ICON[check.tone]?.icon ?? "info"}
                size={16}
                className={cn("mt-1 shrink-0", SOD_ICON[check.tone]?.className)}
              />
              {check.text}
            </li>
          ))}
        </ul>
      </div>
    </SectionPanel>
  );
}

function LevelChips({
  data,
  maxRank,
  onPick,
}: {
  data: UserProfile;
  maxRank: number | null;
  onPick?: (rank: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {data.levels.map((level) => {
        const covered = level.delegable && maxRank !== null && level.rank <= maxRank;
        const chip = (
          <>
            <span className="size-2 rounded-full" style={{ backgroundColor: level.color }} aria-hidden />
            {level.name}
            <Icon
              name={level.delegable ? (covered ? "check" : "x") : "lock"}
              size={12}
              className={level.delegable ? (covered ? "text-success" : "text-ink-3") : "text-ink-3"}
            />
          </>
        );
        const className = cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
          covered ? "border-line-strong bg-surface text-ink" : "border-line bg-subtle text-ink-3",
        );
        return onPick && level.delegable ? (
          <button
            key={level.rank}
            type="button"
            aria-pressed={maxRank === level.rank}
            aria-label={`تفویض تا سطح ${level.name}`}
            onClick={() => onPick(level.rank)}
            className={cn(className, "hover:border-brand")}
          >
            {chip}
          </button>
        ) : (
          <span
            key={level.rank}
            className={className}
            title={level.delegable ? undefined : "تصمیم این سطح تفویض نمی‌شود"}
          >
            {chip}
          </span>
        );
      })}
    </div>
  );
}

function Delegation({
  data,
  draft,
  editing,
  onDraft,
  onEdit,
  onCancel,
}: {
  data: UserProfile;
  draft: DelegationDraft | null;
  editing: boolean;
  onDraft: (draft: DelegationDraft | null) => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const found = data.delegation;
  const set = <K extends keyof DelegationDraft>(key: K, value: DelegationDraft[K]) =>
    draft && onDraft({ ...draft, [key]: value });
  const start = () =>
    onDraft({ successor: "", starts_on: "", ends_on: "", max_rank: null, notify_successor: true, copy_owner: true });
  return (
    <SectionPanel
      title="تفویض اختیار"
      description="جانشینی موقت در دوره‌ی مرخصی"
      aside={found && <Chip tone={found.chip.tone}>{found.chip.label}</Chip>}
    >
      {!draft ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-3">تفویضی برقرار یا زمان‌بندی‌شده نیست.</p>
          <Button variant="outline" size="sm" onClick={start}>
            <Icon name="plus" />
            ثبت تفویض
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {editing || !found ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="جانشین">
                <Select value={draft.successor} onChange={(event) => set("successor", event.target.value)}>
                  <option value="" disabled>
                    انتخاب کاربر…
                  </option>
                  {data.successors.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.unit ? `${user.name} · ${user.unit}` : user.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="از تاریخ">
                  <DatePicker value={draft.starts_on} onChange={(value) => set("starts_on", value)} />
                </Field>
                <Field label="تا تاریخ">
                  <DatePicker value={draft.ends_on} onChange={(value) => set("ends_on", value)} />
                </Field>
              </div>
            </div>
          ) : (
            <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              {[
                ["جانشین", found.successor.name],
                ["ثبت‌کننده", found.created],
                ["دوره", found.period],
                ["ارجاع سطوح بالاتر", found.escalation],
                ["دامنه‌ی تفویض", found.scope],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 border-b border-line py-2.5">
                  <dt className="text-sm text-ink-3">{label}</dt>
                  <dd className="text-sm font-semibold text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-ink-3">سطوح قابل تفویض</span>
            <LevelChips
              data={data}
              maxRank={draft.max_rank}
              onPick={editing || !found ? (rank) => set("max_rank", rank) : undefined}
            />
          </div>
          <p className="flex items-start gap-2 rounded-lg bg-warning-subtle px-3 py-2.5 text-sm leading-6 text-ink">
            <Icon name="lock" size={16} className="mt-1 shrink-0 text-warning" />
            تصمیم ریسک‌های بالا و بحرانی تفویض نمی‌شود؛ در غیاب مالک به {data.escalation} ارجاع می‌شود. تفویض، پاسخ‌گویی
            مالک را حذف نمی‌کند.
          </p>
          <div className="flex flex-col gap-2">
            <Checkbox
              label="دریافت اعلان‌های پایش توسط جانشین"
              checked={draft.notify_successor}
              onChange={(event) => set("notify_successor", event.target.checked)}
            />
            <Checkbox
              label="رونوشت تصمیم‌های جانشین برای مالک"
              checked={draft.copy_owner}
              onChange={(event) => set("copy_owner", event.target.checked)}
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {found && !editing && (
              <Button variant="link" size="sm" onClick={onEdit}>
                ویرایش تفویض
              </Button>
            )}
            {found ? (
              <Button variant="link" size="sm" className="text-danger" onClick={onCancel}>
                لغو تفویض
              </Button>
            ) : (
              <Button variant="link" size="sm" onClick={() => onDraft(null)}>
                انصراف
              </Button>
            )}
          </div>
        </div>
      )}
    </SectionPanel>
  );
}

function Duties({ data }: { data: UserProfile }) {
  return (
    <SectionPanel title="مسئولیت‌های فعال" description="از رکوردهای ERM">
      <dl className="grid grid-cols-4 gap-2">
        {data.duties.tiles.map((tile) => (
          <div
            key={tile.key}
            className="flex flex-col-reverse items-center gap-1 rounded-lg bg-subtle px-1 py-3 text-center"
          >
            <dt className="text-xs leading-5 text-ink-3">{tile.label}</dt>
            <dd
              className={cn(
                "text-lg font-semibold",
                tile.key === "approvals" && tile.value > 0 ? "text-warning" : "text-ink",
              )}
            >
              {fa(tile.value)}
            </dd>
          </div>
        ))}
      </dl>
      {data.duties.risks.length > 0 && (
        <ul className="mt-3 flex flex-col divide-y divide-line">
          {data.duties.risks.map((risk) => (
            <li key={risk.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="flex min-w-0 flex-col">
                <AppLink href={risk.href} className="truncate text-sm font-semibold text-ink hover:text-brand">
                  {risk.title}
                </AppLink>
                <bdi className="code text-xs text-ink-3">{risk.code}</bdi>
              </span>
              {risk.score !== null && (
                <span
                  className="grid h-7 min-w-9 shrink-0 place-items-center rounded-md border-2 px-1.5 text-sm font-semibold text-ink"
                  style={risk.level ? { borderColor: risk.level.color } : undefined}
                  title={risk.level ? `سطح ${risk.level.name}` : undefined}
                >
                  {fa(risk.score)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {data.duties.more > 0 && <p className="mt-2 text-xs text-ink-3">و {fa(data.duties.more)} ریسک دیگر</p>}
    </SectionPanel>
  );
}

function Activity({ data }: { data: UserProfile }) {
  const [all, setAll] = useState(false);
  const rows = all ? data.activity : data.activity.slice(0, 5);
  return (
    <SectionPanel
      title="فعالیت اخیر"
      description="لاگ ممیزی · غیرقابل ویرایش"
      aside={
        data.activity.length > 5 && (
          <Button variant="link" size="sm" aria-expanded={all} onClick={() => setAll((open) => !open)}>
            {all ? "کمتر" : "همه"}
          </Button>
        )
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-ink-3">فعالیتی ثبت نشده است.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {rows.map((row) => (
            <li key={row.key} className="flex items-start gap-3 py-2.5">
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full",
                  ACTIVITY_TONE[row.tone] ?? ACTIVITY_TONE.neutral,
                )}
              >
                <Icon name={row.icon as IconName} size={14} />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-semibold text-ink">{row.title}</span>
                <span className="text-xs text-ink-3">{row.note}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionPanel>
  );
}

function Profile({ data, queryKey }: { data: UserProfile; queryKey: unknown[] }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [roles, setRoles] = useState(() => assignedRoles(data));
  const [draft, setDraft] = useState<DelegationDraft | null>(() => draftOf(data));
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<"deactivate" | "cancel" | null>(null);
  const original = assignedRoles(data);
  const rolesDirty = [...roles].sort().join() !== [...original].sort().join();
  const delegationDirty = JSON.stringify(draft) !== JSON.stringify(draftOf(data));
  const dirty = rolesDirty || delegationDirty;

  const action = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      post<UserProfile & { message: string }>(`accounts/users/${data.id}/`, body),
    onSuccess: (page) => {
      queryClient.setQueryData(queryKey, page);
      setRoles(assignedRoles(page));
      setDraft(draftOf(page));
      setEditing(false);
      setConfirm(null);
      toast({ title: page.message });
    },
    onError: (failure: Error) => toast({ title: faText(failure.message), tone: "danger" }),
  });
  const save = () =>
    action.mutate({
      action: "save",
      ...(rolesDirty ? { roles } : {}),
      ...(delegationDirty && draft ? { delegation: { ...draft, successor: Number(draft.successor) } } : {}),
    });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar name={data.name} size={56} className="text-lg" />
            {data.name}
          </span>
        }
        breadcrumb={[{ label: "تعریف کاربر و نقش", to: data.users_page }, { label: data.name }]}
        meta={
          <>
            <Chip tone={data.status.tone}>{data.status.label}</Chip>
            <Chip>
              {data.source.value === "ad" && <Icon name="link" size={12} />}
              {data.source.label}
            </Chip>
          </>
        }
        description={data.subtitle}
        actions={
          <>
            {data.can_deactivate && (
              <Button variant="link" onClick={() => setConfirm("deactivate")}>
                غیرفعال‌سازی
              </Button>
            )}
            <Button variant="primary" disabled={!dirty} loading={action.isPending} onClick={save}>
              <Icon name="check" />
              ذخیره‌ی تغییرات
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Identity data={data} />
          <Roles data={data} roles={roles} onChange={setRoles} />
          <Delegation
            data={data}
            draft={draft}
            editing={editing}
            onDraft={setDraft}
            onEdit={() => setEditing(true)}
            onCancel={() => setConfirm("cancel")}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Duties data={data} />
          <Activity data={data} />
        </div>
      </div>
      <ConfirmDialog
        open={confirm === "deactivate"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`غیرفعال‌سازی ${data.name}`}
        description={
          data.open_duties
            ? `${data.open_duties}. کاربر غیرفعال تا انتقال مسئولیت‌های باز در سوابق می‌ماند؛ جانشین را در همگام‌سازی AD تعیین کنید.`
            : "کاربر دیگر وارد نمی‌شود؛ سوابق و نقش‌ها حفظ می‌شوند."
        }
        confirmLabel="غیرفعال‌سازی"
        tone="danger"
        loading={action.isPending}
        onConfirm={() => action.mutate({ action: "deactivate" })}
      />
      <ConfirmDialog
        open={confirm === "cancel"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="لغو تفویض"
        description="جانشین از همین حالا به جای مالک تصمیم نمی‌گیرد و اعلان‌های او را نمی‌گیرد."
        confirmLabel="لغو تفویض"
        tone="danger"
        loading={action.isPending}
        onConfirm={() => action.mutate({ action: "cancel_delegation" })}
      />
    </div>
  );
}

export function UserProfilePage() {
  const { id } = useParams();
  const queryKey = ["user-profile", id];
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => get<UserProfile>(`accounts/users/${id}/`, signal),
  });
  useTitle(query.data ? query.data.name : "پروفایل کاربر");
  if (query.isError) return <ErrorState error={query.error} retry={() => query.refetch()} />;
  if (!query.data) return <PageSkeleton rows={8} />;
  return <Profile key={query.data.id} data={query.data} queryKey={queryKey} />;
}
