import { fa } from "@/lib/format";

/** مدت به زبان فیگما: مضرب ساعت با «ساعت» و بقیه با «دقیقه». */
export function duration(minutes: number) {
  return minutes >= 60 && minutes % 60 === 0 ? `${fa(minutes / 60)} ساعت` : `${fa(minutes)} دقیقه`;
}

/** همان قاعده‌ی پیشنهاد سطح S ارزیابی (suggest_duration در سرور): مدت d در برابر کسر RTO، خود RTO و MTPD. */
export function durationLevel(minutes: number, rto: number, mtpd: number, critical: boolean, fraction: number) {
  if (minutes <= 0) return 0;
  const quarter = rto * fraction;
  if (critical) {
    if (minutes <= quarter) return 2;
    if (minutes <= rto) return 3;
    if (minutes < mtpd) return 4;
    return 5;
  }
  if (minutes <= quarter) return 1;
  if (minutes <= rto) return 2;
  return 3;
}
