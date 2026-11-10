import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "@/test/axe";

import { DatePicker } from "./date-picker";
import { Field, FieldSet } from "./field";
import { FileInput } from "./file-input";
import { MultiSelect } from "./multi-select";

const today = { year: 1405, month: 8, day: 13 };

function DateHarness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <Field label="تاریخ شناسایی" hint="به شمسی">
        <DatePicker value={value} onChange={setValue} today={today} />
      </Field>
      <output data-testid="value">{value}</output>
    </>
  );
}

describe("DatePicker", () => {
  it("accepts typed Persian digits and normalizes them to Django's format", async () => {
    const user = userEvent.setup();
    render(<DateHarness />);
    const input = screen.getByRole("textbox", { name: /تاریخ شناسایی/ });
    expect(input).toHaveAttribute("dir", "ltr");
    await user.type(input, "۱۴۰۵/۸/۹");
    await user.tab();
    expect(screen.getByTestId("value")).toHaveTextContent("1405/08/09");
    // متن خواندنی تاریخ به کادر وصل است تا صفحه‌خوان روز هفته و ماه را هم بخواند.
    expect(input).toHaveAccessibleDescription(/شنبه ۹ آبان ۱۴۰۵/);
  });

  it("opens a calendar on the chosen day and moves right-to-left with the arrow keys", async () => {
    const user = userEvent.setup();
    render(<DateHarness initial="1405/08/13" />);
    await user.click(screen.getByRole("button", { name: "انتخاب تاریخ از تقویم" }));
    const grid = await screen.findByRole("grid", { name: "آبان ۱۴۰۵" });
    const selected = within(grid).getByRole("button", { name: "چهارشنبه ۱۳ آبان ۱۴۰۵" });
    await waitFor(() => expect(selected).toHaveFocus());
    expect(selected.closest("td")).toHaveAttribute("aria-selected", "true");
    expect(selected).toHaveAttribute("aria-current", "date");

    // در راست‌به‌چپ، چپ روز بعد است و پایین هفته‌ی بعد.
    await user.keyboard("{ArrowLeft}");
    expect(within(grid).getByRole("button", { name: "پنجشنبه ۱۴ آبان ۱۴۰۵" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(within(grid).getByRole("button", { name: "پنجشنبه ۲۱ آبان ۱۴۰۵" })).toHaveFocus();
    await user.keyboard("{PageDown}");
    expect(screen.getByRole("grid", { name: "آذر ۱۴۰۵" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "شنبه ۲۱ آذر ۱۴۰۵" })).toHaveFocus();
    await expectNoAxeViolations();

    await user.keyboard("{Enter}");
    expect(screen.getByTestId("value")).toHaveTextContent("1405/09/21");
    await waitFor(() => expect(screen.queryByRole("grid")).not.toBeInTheDocument());
  });

  it("closes with Escape without changing the value, and picks today with one click", async () => {
    const user = userEvent.setup();
    render(<DateHarness initial="1405/01/01" />);
    const trigger = screen.getByRole("button", { name: "انتخاب تاریخ از تقویم" });
    await user.click(trigger);
    await screen.findByRole("grid", { name: "فروردین ۱۴۰۵" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("grid")).not.toBeInTheDocument());
    expect(screen.getByTestId("value")).toHaveTextContent("1405/01/01");

    await user.click(trigger);
    await user.click(await screen.findByRole("button", { name: /امروز، چهارشنبه ۱۳ آبان/ }));
    expect(screen.getByTestId("value")).toHaveTextContent("1405/08/13");
  });
});

const banks = [
  { value: "1", label: "بانک ملی" },
  { value: "2", label: "بانک صادرات" },
  { value: "3", label: "بانک ملت" },
  { value: "4", label: "بانک تجارت" },
  { value: "5", label: "بانک سپه" },
  { value: "6", label: "بانک کشاورزی" },
  { value: "7", label: "بانک مسکن" },
  { value: "8", label: "بانک رفاه" },
];

function MultiHarness({ onChange }: { onChange?: (value: string[]) => void }) {
  const [value, setValue] = useState<string[]>(["3"]);
  return (
    <FieldSet legend="بانک‌ها">
      <MultiSelect
        label="بانک‌ها"
        choices={banks}
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
    </FieldSet>
  );
}

describe("MultiSelect", () => {
  it("is a group of native checkboxes that keeps the server's order", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MultiHarness onChange={onChange} />);
    const group = screen.getByRole("group", { name: "بانک‌ها" });
    await user.click(within(group).getByRole("checkbox", { name: "بانک ملی" }));
    expect(onChange).toHaveBeenLastCalledWith(["1", "3"]);
    expect(screen.getByText("۲ انتخاب‌شده")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "برداشتن بانک ملت" }));
    expect(onChange).toHaveBeenLastCalledWith(["1"]);
    await expectNoAxeViolations();
  });

  it("searches long lists with Arabic ye and kaf treated as Persian", async () => {
    const user = userEvent.setup();
    render(<MultiHarness />);
    await user.type(screen.getByRole("searchbox", { name: "جست‌وجو در بانک‌ها" }), "ملي");
    const group = screen.getByRole("group", { name: "بانک‌ها" });
    expect(within(group).getByRole("checkbox", { name: "بانک ملی" })).toBeInTheDocument();
    expect(within(group).queryByRole("checkbox", { name: "بانک سپه" })).not.toBeInTheDocument();
    expect(screen.getByText(/۱ گزینه پیدا شد/)).toBeInTheDocument();
  });
});

function FileHarness() {
  const [file, setFile] = useState<File | null>(null);
  return (
    <Field label="فایل" hint="فقط pdf">
      <FileInput value={file} onChange={setFile} accept=".pdf,.docx" maxSize={1024 * 1024} />
    </Field>
  );
}

describe("FileInput", () => {
  it("uses the native file input, shows the chosen file and lets it be removed", async () => {
    const user = userEvent.setup();
    render(<FileHarness />);
    const input = screen.getByLabelText(/فایل/);
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute("accept", ".pdf,.docx");
    expect(screen.getByText("pdf، docx، حداکثر ۱ مگابایت")).toBeInTheDocument();

    await user.upload(input, new File(["%PDF"], "گزارش.pdf", { type: "application/pdf" }));
    expect(screen.getByText("گزارش.pdf")).toBeInTheDocument();
    await expectNoAxeViolations();

    await user.click(screen.getByRole("button", { name: "برداشتن گزارش.pdf" }));
    expect(screen.queryByText("گزارش.pdf")).not.toBeInTheDocument();
  });
});
