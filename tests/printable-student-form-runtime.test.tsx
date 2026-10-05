import React from "react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({ location: vi.fn() }));

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return { ...actual, useLocation: () => ["/students/registration-form", mocks.location] };
});
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ school: { id: "school-1", name: "مدرسة النور" } }) }));
vi.mock("@/contexts/LocaleContext", () => ({ useLocale: () => ({ locale: "ar", direction: "rtl" }) }));

import PrintableStudentRegistrationForm from "@/pages/PrintableStudentRegistrationForm";

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "print", { configurable: true, value: vi.fn() });
});

describe("printable student registration form", () => {
  test("shows blank student and guardian sections and opens the browser print dialog", async () => {
    const user = userEvent.setup();
    render(<PrintableStudentRegistrationForm />);

    expect(screen.getByRole("heading", { name: "استمارة تسجيل طالب جديد" })).toBeInTheDocument();
    expect(screen.getByText("القسم الأول — بيانات الطالب")).toBeInTheDocument();
    expect(screen.getAllByText("القسم الثاني — بيانات ولي الأمر").length).toBeGreaterThan(0);
    expect(screen.getByText("اسم ولي الأمر الإضافي")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getAllByText((_content, element) => element?.textContent?.includes("مدرسة النور") ?? false).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "طباعة الاستمارة" }));
    expect(window.print).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "العودة إلى تسجيل الطالب" }));
    expect(mocks.location).toHaveBeenCalledWith("/students/new");
  });
});
