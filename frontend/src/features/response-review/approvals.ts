import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { useToast } from "@/components/ui/toast";
import { request } from "@/lib/api";

// تأیید با بازگردانی (تصمیم ۳ برنامه): رابط تأیید را همان لحظه نشان می‌دهد و درخواست ثبت وقتی فرستاده می‌شود که پیام
// ۱۰ ثانیه‌ای «بازگردانی» بی‌آن‌که زده شود بسته شود. پس ریسکی که بازگردانده شده هیچ‌وقت ساخته نمی‌شود و کد RK هدر
// نمی‌رود. پیام با نگه‌داشتن نشانگر یا فوکوس مکث می‌کند و ثبت هم با آن صبر می‌کند. پیش از «تحلیل دوباره» و با ترک
// صفحه یا بستن برگه، تأییدهای منتظر همان لحظه فرستاده می‌شوند (fetch keepalive).

export const UNDO_MS = 10_000;

interface Waiting {
  at: string;
  close: () => void;
  sent: boolean;
}

export function useDeferredApprovals(responseId: string | undefined) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const waiting = useRef(new Map<number, Waiting>());
  // نسخه‌ی نمایشی همان فهرست: شناسه‌ی ریسک ← زمان تأیید، برای کارت فشرده‌ی «تأیید شد» پیش از ساخته شدن ریسک.
  const [approving, setApproving] = useState<ReadonlyMap<number, string>>(new Map());

  function changed() {
    setApproving(new Map([...waiting.current].map(([id, item]) => [id, item.at])));
  }

  async function post(id: number, keepalive: boolean) {
    try {
      await request(`pending-risks/${id}/approve/`, { method: "POST", body: {}, keepalive });
    } catch {
      toast({ title: "ثبت ریسک انجام نشد؛ ریسک دوباره منتظر تصمیم شماست.", tone: "danger" });
    }
  }

  async function send(ids: number[], keepalive: boolean) {
    const due = ids.filter((id) => {
      const item = waiting.current.get(id);
      if (!item || item.sent) return false;
      item.sent = true;
      return true;
    });
    if (!due.length) return;
    await Promise.all(due.map((id) => post(id, keepalive)));
    // کارت تا خواندن دوباره‌ی ریسک‌ها «تأیید شد» می‌ماند تا بین دو حالت چشمک نزند؛ یک بار برای همه‌ی تأییدها.
    await queryClient.invalidateQueries({ queryKey: ["response-review", responseId] });
    due.forEach((id) => waiting.current.delete(id));
    changed();
  }

  function undo(id: number) {
    const item = waiting.current.get(id);
    if (!item || item.sent) return;
    waiting.current.delete(id);
    changed();
    toast({ title: "تأیید ریسک بازگردانده شد.", tone: "info" });
  }

  function approve(id: number) {
    if (waiting.current.has(id)) return;
    const close = toast({
      title: "ریسک تأیید شد و به آنالیز ریسک رفت",
      tone: "success",
      duration: UNDO_MS,
      action: { label: "بازگردانی", onClick: () => undo(id) },
      onDismiss: () => void send([id], false),
    });
    waiting.current.set(id, { at: new Date().toISOString(), close, sent: false });
    changed();
  }

  /** تأییدهای منتظر را همین حالا می‌فرستد و پیامشان را می‌بندد. */
  function flush(keepalive = false) {
    const due = [...waiting.current].filter(([, item]) => !item.sent);
    due.forEach(([, item]) => item.close());
    return send(
      due.map(([id]) => id),
      keepalive,
    );
  }

  const leave = useEffectEvent(() => void flush(true));
  useEffect(() => {
    const onPageHide = () => leave();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      leave();
    };
  }, []);

  return { approving, approve, flush };
}
