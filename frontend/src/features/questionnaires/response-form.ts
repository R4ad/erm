import { z } from "@/lib/zod";

import type { AnswerValue, Errors, QuestionItem, ResponseDetail } from "@/lib/types";

// فرم پاسخ: جواب هر سؤال در answers.q<id> است (نه answers.<id>، چون react-hook-form نام عددی را اندیس آرایه
// می‌فهمد). سؤال متنی رشته، تک‌گزینه‌ای شناسه‌ی گزینه به شکل رشته یا ""، و چندگزینه‌ای آرایه‌ی شناسه‌ها.

export interface ResponseValues {
  fixed: Record<string, string>;
  new_item: string;
  answers: Record<string, string | string[]>;
}

export const answerKey = (question: Pick<QuestionItem, "id">) => `q${question.id}`;
export const answerField = (question: Pick<QuestionItem, "id">) => `answers.${answerKey(question)}` as const;

export function valuesFrom(response: ResponseDetail): ResponseValues {
  return {
    fixed: Object.fromEntries(response.fixed.map((item) => [item.name, item.value ?? ""])),
    new_item: response.new_item.value ?? "",
    answers: Object.fromEntries(
      response.questions.map((question) => {
        const value = question.value;
        if (question.kind === "multiple") return [answerKey(question), Array.isArray(value) ? value.map(String) : []];
        if (question.kind === "text") return [answerKey(question), typeof value === "string" ? value : ""];
        return [
          answerKey(question),
          value === null || value === undefined || Array.isArray(value) ? "" : String(value),
        ];
      }),
    ),
  };
}

/** همان شکلی که PUT /api/responses/<id>/ می‌خواهد. */
export function payloadFrom(values: ResponseValues, questions: QuestionItem[], submit: boolean) {
  const answers: Record<string, AnswerValue> = {};
  for (const question of questions) {
    const value = values.answers[answerKey(question)];
    if (question.kind === "multiple") answers[String(question.id)] = (Array.isArray(value) ? value : []).map(Number);
    else if (question.kind === "text") answers[String(question.id)] = typeof value === "string" ? value : "";
    else answers[String(question.id)] = typeof value === "string" && value ? Number(value) : null;
  }
  return { fixed: values.fixed, new_item: values.new_item, answers, submit };
}

export function isAnswered(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "string" && value.trim().length > 0;
}

/** پیش از ارسال: سؤال‌های اجباری جواب دارند؟ پیش‌نویس بدون این شرط ذخیره می‌شود. سرور هم دوباره چک می‌کند. */
export function submitSchema(questions: QuestionItem[]) {
  const required = questions.filter((question) => question.required);
  return z.object({
    answers: z.object(
      Object.fromEntries(
        required.map((question) => [
          answerKey(question),
          z
            .union([z.string(), z.array(z.string())])
            .refine((value) => isAnswered(value), { message: "این سؤال اجباری است و جواب لازم دارد." }),
        ]),
      ),
    ),
  });
}

/** خطاهای سرور (question_12، new_item، نام پرسش‌های ثابت) به نام فیلدهای همین فرم. */
export function fieldErrors(errors: Errors, response: ResponseDetail): [string, string][] {
  const fixed = new Set(response.fixed.map((item) => item.name));
  const result: [string, string][] = [];
  for (const [name, messages] of Object.entries(errors)) {
    const message = messages.join(" ");
    const question = /^question_(\d+)$/.exec(name);
    if (question) result.push([`answers.q${question[1]}`, message]);
    else if (name === "new_item") result.push(["new_item", message]);
    else if (fixed.has(name)) result.push([`fixed.${name}`, message]);
  }
  return result;
}
