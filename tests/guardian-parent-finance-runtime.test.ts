import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, test, vi } from "vitest";
import { fetchParentStudentFinance } from "@/lib/parent-portal";

describe("guardian parent finance client", () => {
  test("maps summary, charges, and payments from dedicated RPCs only", async () => {
    const from = vi.fn(() => {
      throw new Error("direct finance table access is forbidden");
    });
    const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === "get_my_guardian_student_finance_summary") {
        return {
          data: [
            {
              total_charged: "2100.00",
              total_paid: "900.00",
              remaining_amount: "1200.00",
              overdue_amount: "600.00",
              open_charges_count: 2,
              last_payment_date: "2026-08-07",
            },
          ],
          error: null,
        };
      }

      if (name === "list_my_guardian_student_charges") {
        expect(args?.target_limit).toBe(30);
        return {
          data: [
            {
              charge_id: "charge-1",
              charge_type: "fee",
              description: "رسوم شهرية",
              original_amount: "1000.00",
              discount_amount: "0.00",
              net_amount: "1000.00",
              due_date: "2026-07-10",
              charge_status: "partially_paid",
              paid_amount: "400.00",
              remaining_amount: "600.00",
              is_overdue: true,
            },
          ],
          error: null,
        };
      }

      if (name === "list_my_guardian_student_payments") {
        expect(args?.target_limit).toBe(30);
        return {
          data: [
            {
              payment_id: "payment-1",
              charge_id: "charge-1",
              charge_description: "رسوم شهرية",
              amount: "400.00",
              payment_method: "cash",
              payment_date: "2026-08-01",
              payment_status: "completed",
            },
          ],
          error: null,
        };
      }

      throw new Error(`Unexpected RPC: ${name}`);
    });

    const client = { rpc, from } as unknown as SupabaseClient;
    const result = await fetchParentStudentFinance(
      "school-1",
      "student-1",
      client
    );

    expect(result.summary).toEqual({
      totalCharged: 2100,
      totalPaid: 900,
      remainingAmount: 1200,
      overdueAmount: 600,
      openChargesCount: 2,
      lastPaymentDate: "2026-08-07",
    });
    expect(result.charges).toEqual([
      {
        id: "charge-1",
        chargeType: "fee",
        description: "رسوم شهرية",
        originalAmount: 1000,
        discountAmount: 0,
        netAmount: 1000,
        dueDate: "2026-07-10",
        status: "partially_paid",
        paidAmount: 400,
        remainingAmount: 600,
        isOverdue: true,
      },
    ]);
    expect(result.payments).toEqual([
      {
        id: "payment-1",
        chargeId: "charge-1",
        chargeDescription: "رسوم شهرية",
        amount: 400,
        paymentMethod: "cash",
        paymentDate: "2026-08-01",
        status: "completed",
      },
    ]);

    expect(rpc).toHaveBeenCalledTimes(3);
    for (const [, args] of rpc.mock.calls) {
      expect(args).toMatchObject({
        target_school_id: "school-1",
        target_student_id: "student-1",
      });
    }
    expect(from).not.toHaveBeenCalled();
  });

  test("fails closed when any finance RPC returns an error", async () => {
    const rpc = vi.fn(async (name: string) => ({
      data: [],
      error:
        name === "get_my_guardian_student_finance_summary"
          ? new Error("student access denied")
          : null,
    }));
    const client = { rpc } as unknown as SupabaseClient;

    await expect(
      fetchParentStudentFinance("school-1", "student-1", client)
    ).rejects.toThrow("student access denied");
  });

  test("normalizes null and string numeric values safely", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "get_my_guardian_student_finance_summary") {
        return {
          data: [
            {
              total_charged: null,
              total_paid: "not-a-number",
              remaining_amount: "0.00",
              overdue_amount: null,
              open_charges_count: "0",
              last_payment_date: null,
            },
          ],
          error: null,
        };
      }

      return { data: [], error: null };
    });
    const client = { rpc } as unknown as SupabaseClient;

    const result = await fetchParentStudentFinance(
      "school-1",
      "student-1",
      client
    );

    expect(result.summary).toEqual({
      totalCharged: 0,
      totalPaid: 0,
      remainingAmount: 0,
      overdueAmount: 0,
      openChargesCount: 0,
      lastPaymentDate: null,
    });
    expect(result.charges).toEqual([]);
    expect(result.payments).toEqual([]);
  });
});
