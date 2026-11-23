import { describe, expect, it } from "vitest";

import { response } from "@/test/fixtures";

import { fieldErrors, isAnswered, payloadFrom, submitSchema, valuesFrom } from "./response-form";

describe("response form values", () => {
  it("round-trips saved answers into the API payload", () => {
    const saved = response();
    saved.questions[0]!.value = "متن";
    saved.questions[1]!.value = 12;
    saved.questions[2]!.value = [21, 22];
    const values = valuesFrom(saved);
    expect(values.answers).toEqual({ q1: "متن", q2: "12", q3: ["21", "22"] });
    expect(payloadFrom(values, saved.questions, true)).toEqual({
      fixed: { functions: "", disruptive_event: "", dependencies: "پایگاه داده‌ی مرکزی" },
      new_item: "",
      answers: { "1": "متن", "2": 12, "3": [21, 22] },
      submit: true,
    });
  });

  it("sends an unanswered choice as null, not 0", () => {
    const saved = response();
    expect(payloadFrom(valuesFrom(saved), saved.questions, false).answers["2"]).toBeNull();
  });

  it("treats whitespace as unanswered", () => {
    expect(isAnswered("  ")).toBe(false);
    expect(isAnswered([])).toBe(false);
    expect(isAnswered(["1"])).toBe(true);
  });

  it("requires only required questions before submit", () => {
    const saved = response();
    const result = submitSchema(saved.questions).safeParse(valuesFrom(saved));
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toEqual(["answers.q1", "answers.q2"]);
  });

  it("maps server field names to form fields and ignores unknown ones", () => {
    const errors = fieldErrors(
      { question_2: ["a", "b"], new_item: ["c"], functions: ["d"], __all__: ["e"], other: ["f"] },
      response(),
    );
    expect(errors).toEqual([
      ["answers.q2", "a b"],
      ["new_item", "c"],
      ["fixed.functions", "d"],
    ]);
  });
});
