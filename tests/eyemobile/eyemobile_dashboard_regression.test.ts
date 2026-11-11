import { describe, expect, it } from "vitest";
import {
  isCancelledOrIncompleteSale,
  isCancelledTailPage,
} from "../../supabase/functions/_shared/eyemobile-sequence-guard";

describe("Eyemobile cancelled tail & incomplete sale guard", () => {
  it("identifies cancelled and incomplete sales accurately", () => {
    expect(isCancelledOrIncompleteSale({ cancelled: true, completed: true })).toBe(true);
    expect(isCancelledOrIncompleteSale({ cancelled: false, completed: false })).toBe(true);
    expect(isCancelledOrIncompleteSale({ cancelled: 1, completed: 1 })).toBe(true);
    expect(isCancelledOrIncompleteSale({ cancelled: false, completed: true })).toBe(false);
    expect(isCancelledOrIncompleteSale({ cancelled: 0, completed: 1 })).toBe(false);
  });

  it("treats a page with only cancelled or incomplete transactions as a cancelled tail page", () => {
    expect(
      isCancelledTailPage([
        { cancelled: true, completed: true },
        { cancelled: false, completed: false },
      ]),
    ).toBe(true);
  });

  it("does not treat a page containing valid completed sales as a cancelled tail page", () => {
    expect(
      isCancelledTailPage([
        { cancelled: true, completed: true },
        { cancelled: false, completed: true },
        { cancelled: false, completed: false },
      ]),
    ).toBe(false);
    expect(isCancelledTailPage([])).toBe(false);
  });
});
