import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";

import { AppLink } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { IconChip } from "@/components/ui/icon-chip";
import { RISK_CLASSES, riskKey } from "@/components/ui/level-badge";
import { PageHeader } from "@/components/ui/page-header";
import { Chip, SectionPanel } from "@/components/ui/section-panel";
import { PageSkeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { ErrorState } from "@/components/ui/states";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { sessionQuery } from "@/features/session/session";
import { get, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fa } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { InboxNotice, MonitoringInbox, NoticeChannels } from "@/lib/types";

// «اعلان‌های پایش» به چیدمان فیگما ۲۰: کاشی‌های خلاصه، صندوق اعلان‌ها با زبانه‌ی نوع و گروه روز، و ستون کناری تقویم
// بازبینی دوره‌ای، محرک‌های بازسنجی بخش ۲۱ و کانال دریافت. باز کردن کار هر اعلان آن را خوانده می‌کند.

const QUERY_KEY = ["monitoring-inbox"];
const ICONS = new Set<string>([
  "lightning",
  "x-circle",
  "calendar",
  "signature",
  "paperclip",
  "layers",
  "link",
  "users",
  "file-text",
  "check-square",
  "warning",
  "bell",
  "flow",
  "arrow-left",
]);

function icon(name: string, fallback: IconName = "bell"): IconName {
  return (ICONS.has(name) ? name : fallback) as IconName;
}

const TONE_CHIP = { danger: "danger", warning: "warning", info: "info", neutral: "neutral" } as const;

function NoticeRow({ notice, onOpen }: { notice: InboxNotice; onOpen: (notice: InboxNotice) => void }) {
  return (
    <li
      className={cn(
        "flex flex-col gap-3 border-b border-line px-5 py-4 last:border-0 sm:flex-row sm:items-start",
        notice.unread && "bg-brand-subtle/30",
      )}
    >
      <span className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-3 w-2 shrink-0" aria-hidden>
          {notice.unread && <span className="block size-2 rounded-full bg-brand" />}
        </span>
        <IconChip icon={icon(notice.icon)} tone={TONE_CHIP[notice.tone]} />
        <span className="flex min-w-0 flex-col gap-1.5">
          <h3 className="text-sm font-semibold text-ink">
            {notice.unread && <span className="sr-only">خوانده‌نشده: </span>}
            <bdi>{notice.title}</bdi>
          </h3>
          {notice.body && <p className="text-xs leading-5 text-ink-2">{notice.body}</p>}
          {notice.chips.length > 0 && (
            <span className="flex flex-wrap gap-1.5">
              {notice.chips.map((chip) => (
                <Chip key={chip}>
                  <bdi>{chip}</bdi>
                </Chip>
              ))}
            </span>
          )}
        </span>
      </span>
      <Button
        asChild
        variant={notice.cta.primary ? "primary" : "outline"}
        size="sm"
        className="shrink-0 self-start ps-3 sm:ms-0"
      >
        <AppLink href={notice.cta.href} onClick={() => onOpen(notice)}>
          <Icon name={icon(notice.cta.icon, "arrow-left")} />
          {notice.cta.label}
        </AppLink>
      </Button>
    </li>
  );
}

function Inbox({ data, onOpen }: { data: MonitoringInbox; onOpen: (notice: InboxNotice) => void }) {
  const [tab, setTab] = useState("all");
  const [mine, setMine] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const notices = data.notices.filter(
    (notice) => (tab === "all" || notice.tab === tab) && (!mine || notice.mine) && (!unreadOnly || notice.unread),
  );
  const groups: { key: string; label: string; items: InboxNotice[] }[] = [];
  for (const notice of notices) {
    const last = groups.at(-1);
    if (last?.key === notice.group.key) last.items.push(notice);
    else groups.push({ ...notice.group, items: [notice] });
  }
  return (
    <section aria-label="اعلان‌ها" className="overflow-hidden rounded-lg border border-line bg-panel">
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4">
          <div className="min-w-0 overflow-x-auto">
            <TabsList className="border-0">
              {data.tabs.map((item) => (
                <TabsTrigger key={item.key} value={item.key} count={fa(item.count)}>
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <span className="flex items-center gap-2 py-2.5">
            <Button
              variant={mine ? "secondary" : "outline"}
              size="sm"
              aria-pressed={mine}
              onClick={() => setMine(!mine)}
            >
              <Icon name="user" />
              فقط من
            </Button>
            <Button
              variant="link"
              size="sm"
              aria-pressed={unreadOnly}
              onClick={() => setUnreadOnly(!unreadOnly)}
              className={cn(unreadOnly && "font-semibold")}
            >
              <Icon name="funnel" />
              فقط نخوانده
            </Button>
          </span>
        </div>
        <TabsContent value={tab} className="mt-0">
          {groups.length ? (
            groups.map((group) => (
              <Fragment key={group.key}>
                <h2 className="border-b border-line bg-subtle px-5 py-1.5 text-xs font-medium text-ink-3">
                  {group.label}
                </h2>
                <ul aria-label={`اعلان‌های ${group.label}`}>
                  {group.items.map((notice) => (
                    <NoticeRow key={notice.id} notice={notice} onOpen={onOpen} />
                  ))}
                </ul>
              </Fragment>
            ))
          ) : (
            <p className="px-5 py-10 text-center text-sm text-ink-3">اعلانی در این دسته نیست.</p>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}

function Calendar({ data }: { data: MonitoringInbox }) {
  return (
    <SectionPanel title="تقویم بازبینی دوره‌ای" description="تا رفع یا پذیرش معتبر · ارزیابی کامل دست‌کم سالانه">
      <ul className="flex flex-col divide-y divide-line">
        {data.calendar.map((row) => {
          const tone = RISK_CLASSES[riskKey(row)];
          return (
            <li key={row.rank} className="flex items-center justify-between gap-3 py-2.5">
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-ink">{row.cycle}</span>
                <span className={cn("text-xs", row.overdue ? "text-danger" : "text-ink-3")}>
                  {fa(row.count)} ریسک
                  {row.next && (row.overdue ? ` · معوق از ${row.next}` : ` · بعدی ${row.next}`)}
                </span>
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold",
                  tone.bg,
                  tone.fg,
                )}
              >
                <span aria-hidden className={cn("size-1.5 rounded-full", tone.dot)} />
                {row.name}
              </span>
            </li>
          );
        })}
      </ul>
    </SectionPanel>
  );
}

function Triggers({ data }: { data: MonitoringInbox }) {
  return (
    <SectionPanel title="محرک‌های بازسنجی" description="بخش ۲۱ روش">
      <ul className="flex flex-col divide-y divide-line">
        {data.triggers.map((trigger) => (
          <li key={trigger.key} className="flex flex-col gap-0.5 py-2.5">
            <span className="text-sm font-semibold text-ink">{trigger.label}</span>
            <span className="text-xs text-ink-3">{trigger.rule}</span>
          </li>
        ))}
      </ul>
    </SectionPanel>
  );
}

function Channels({ channels }: { channels: NoticeChannels }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const save = useMutation({
    mutationFn: (values: Partial<NoticeChannels>) => post<{ channels: NoticeChannels }>("monitoring/channels/", values),
    onSuccess: (result) => {
      queryClient.setQueryData<MonitoringInbox>(QUERY_KEY, (old) => old && { ...old, channels: result.channels });
      toast({ title: "کانال دریافت ذخیره شد" });
    },
  });
  const rows: { key: keyof NoticeChannels; label: string; description: string }[] = [
    { key: "in_app", label: "درون سامانه", description: "همه‌ی اعلان‌ها" },
    { key: "email", label: "ایمیل سازمانی", description: "خلاصه‌ی روزانه ساعت ۸" },
    { key: "sms", label: "پیامک", description: "فقط محرک فوری و بحرانی" },
    { key: "delegate", label: "یادآوری به جانشین", description: "هنگام تفویض فعال" },
  ];
  return (
    <SectionPanel id="notice-channels" title="کانال دریافت">
      <div className="flex flex-col gap-4">
        {rows.map((row) => (
          <Switch
            key={row.key}
            label={row.label}
            description={row.description}
            checked={channels[row.key]}
            disabled={row.key === "in_app" || save.isPending}
            onCheckedChange={(checked) => save.mutate({ [row.key]: checked })}
          />
        ))}
      </div>
    </SectionPanel>
  );
}

export function MonitoringInboxPage() {
  useTitle("اعلان‌های پایش");
  const queryClient = useQueryClient();
  const toast = useToast();
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: ({ signal }) => get<MonitoringInbox>("monitoring/inbox/", signal),
  });
  const data = query.data;
  const refresh = (page: MonitoringInbox) => {
    queryClient.setQueryData(QUERY_KEY, page);
    void queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey });
  };
  const readAll = useMutation({
    mutationFn: () => post<{ read: number; page: MonitoringInbox }>("monitoring/inbox/read/", {}),
    onSuccess: (result) => {
      refresh(result.page);
      toast({ title: result.read ? `${fa(result.read)} اعلان خوانده شد` : "اعلان نخوانده‌ای نبود" });
    },
  });
  const open = (notice: InboxNotice) => {
    if (!notice.unread) return;
    void post<{ page: MonitoringInbox }>(`monitoring/inbox/${notice.id}/read/`, {}).then((result) =>
      refresh(result.page),
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="اعلان‌های پایش"
        breadcrumb={[{ label: "میز کار" }, { label: "اعلان‌های پایش" }]}
        meta={
          data && data.unread > 0 ? (
            <Chip tone="danger">
              <Icon name="bell" size={12} />
              {fa(data.unread)} خوانده‌نشده
            </Chip>
          ) : undefined
        }
        description="محرک‌های بازسنجی، بازبینی دوره‌ای، انقضای پذیرش و قدمت شاهد · تمدید خودکار ممنوع است؛ هر اعلان به یک مالک و یک مهلت مشخص می‌رسد"
        actions={
          data && (
            <>
              <Button
                variant="link"
                onClick={() => readAll.mutate()}
                loading={readAll.isPending}
                disabled={!data.unread}
              >
                <Icon name="check" />
                همه خوانده شد
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  document.getElementById("notice-channels")?.scrollIntoView?.({ behavior: "smooth", block: "start" })
                }
              >
                <Icon name="gear" />
                تنظیمات اعلان
              </Button>
            </>
          )
        }
      />
      {query.isError ? (
        <ErrorState error={query.error} retry={() => query.refetch()} />
      ) : !data ? (
        <PageSkeleton rows={8} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatTile
              label="محرک فوری"
              value={fa(data.summary.urgent)}
              note={`رخداد مهم یا شکست کنترل · حداکثر ${fa(data.summary.urgent_days)} روز کاری`}
              icon="lightning"
              tone="danger"
              valueTone={data.summary.urgent ? "danger" : "ink"}
            />
            <StatTile
              label={`بازبینی تا ${fa(data.summary.review_days)} روز`}
              value={fa(data.summary.reviews)}
              note={`اعلان ${fa(data.summary.review_days)} روز پیش از سررسید`}
              icon="calendar"
              tone="warning"
              valueTone={data.summary.reviews ? "warning" : "ink"}
            />
            <StatTile
              label="پذیرش رو به انقضا"
              value={fa(data.summary.acceptances)}
              note={`یادآوری ${data.summary.reminders.map((day) => fa(day)).join(" و ")} روزه`}
              icon="signature"
              tone="info"
            />
            <StatTile
              label="شاهد منقضی‌شونده"
              value={fa(data.summary.evidence)}
              note="قدمت شاهد، بازبینی زودتر را الزام می‌کند"
              icon="paperclip"
              tone="neutral"
            />
          </div>
          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
            <Inbox data={data} onOpen={open} />
            <div className="flex flex-col gap-4">
              <Calendar data={data} />
              <Triggers data={data} />
              <Channels channels={data.channels} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
