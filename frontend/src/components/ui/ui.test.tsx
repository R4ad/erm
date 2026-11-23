import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { levels } from "@/test/fixtures";
import { expectNoAxeViolations } from "@/test/axe";

import { Button } from "./button";
import { ConfirmDialog } from "./dialog";
import { Field, Input, Select, Textarea } from "./field";
import { LevelBadge } from "./level-badge";
import { Pagination, pageWindow } from "./pagination";

describe("Button", () => {
  it("is a plain button by default so it never submits a form by accident", () => {
    render(<Button>ذخیره</Button>);
    expect(screen.getByRole("button", { name: "ذخیره" })).toHaveAttribute("type", "button");
  });

  it("disables itself and reports busy while loading", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        در حال ذخیره
      </Button>,
    );
    const button = screen.getByRole("button", { name: "در حال ذخیره" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("can render a link with button styling", () => {
    render(
      <Button asChild variant="primary">
        <a href="/app/risks">رجیستر</a>
      </Button>,
    );
    expect(screen.getByRole("link", { name: "رجیستر" })).toHaveClass("bg-brand");
  });
});

describe("Field", () => {
  it("wires label, hint, error and required state to the control", async () => {
    render(
      <>
        <Field label="عنوان" hint="کوتاه بنویسید" error="عنوان لازم است." required>
          <Input />
        </Field>
        <Field label="شرح">
          <Textarea />
        </Field>
        <Field label="وضعیت">
          <Select>
            <option value="">همه</option>
          </Select>
        </Field>
      </>,
    );
    const input = screen.getByRole("textbox", { name: /عنوان/ });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-required", "true");
    expect(input).toHaveAccessibleDescription("کوتاه بنویسید عنوان لازم است.");
    expect(screen.getByRole("textbox", { name: "شرح" })).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("combobox", { name: "وضعیت" })).toBeInTheDocument();
    await expectNoAxeViolations();
  });
});

describe("LevelBadge", () => {
  it("always names the level so colour is never the only cue", () => {
    render(<LevelBadge level={levels.high} />);
    expect(screen.getByText("بالا").textContent).toBe("سطح ریسک: بالا");
  });

  it("says when a risk has not been assessed", () => {
    render(<LevelBadge level={null} />);
    expect(screen.getByText("ارزیابی‌نشده")).toBeInTheDocument();
  });
});

describe("Pagination", () => {
  it("shows the ends, the neighbours and gaps", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(1, 5)).toEqual([1, 2, "gap", 5]);
    expect(pageWindow(5, 10)).toEqual([1, "gap", 4, 5, 6, "gap", 10]);
    // یک صفحه‌ی جاافتاده خودش نشان داده می‌شود، نه «…».
    expect(pageWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("marks the current page and disables the edges", async () => {
    const onChange = vi.fn();
    render(<Pagination page={1} pages={3} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "صفحه‌ی ۱" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "صفحه‌ی قبل" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "صفحه‌ی بعد" }));
    expect(onChange).toHaveBeenCalledWith(2);
    await expectNoAxeViolations();
  });

  it("renders nothing for a single page", () => {
    const { container } = render(<Pagination page={1} pages={1} onChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ConfirmDialog", () => {
  function Harness({ onConfirm }: { onConfirm: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>حذف</Button>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="حذف شود؟"
          description="برگشت ندارد."
          confirmLabel="حذف کن"
          tone="danger"
          onConfirm={onConfirm}
        />
      </>
    );
  }

  it("focuses cancel first, closes with Escape and returns focus", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    const trigger = screen.getByRole("button", { name: "حذف" });
    await user.click(trigger);
    const dialog = screen.getByRole("alertdialog", { name: "حذف شود؟" });
    expect(dialog).toHaveAccessibleDescription("برگشت ندارد.");
    expect(screen.getByRole("button", { name: "انصراف" })).toHaveFocus();
    await expectNoAxeViolations(dialog);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onConfirm and leaves closing to the caller", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "حذف" }));
    await user.click(screen.getByRole("button", { name: "حذف کن" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});
