import { describe, expect, it } from "vitest";
import { normalizeMerchant } from "./merchant";

/**
 * Every string below is a real description from the imported history, not an invented one.
 * That matters: the failure this module exists to prevent is a merchant silently splitting
 * into two rows in a report, and only the feed's actual spellings can catch it.
 */

describe("normalizeMerchant", () => {
  it("strips the feed's own movement wrapper", () => {
    expect(normalizeMerchant("Withdrawal from CAPITAL ONE MOBILE PMT")).toBe(
      "CAPITAL ONE MOBILE PMT",
    );
    expect(normalizeMerchant("Deposit from VACP TREAS XXVA BENEF")).toBe(
      "VACP TREAS XXVA BENEF",
    );
    expect(
      normalizeMerchant("Debit Card Purchase - KIMS NAILS III CALIFORNIA MD"),
    ).toBe("KIMS NAILS III CALIFORNIA MD");
    expect(normalizeMerchant("Overdraft Transfer to 360 Checking XXXXXXX")).toBe(
      "360 CHECKING XXXXXXX",
    );
  });

  it("strips payment-processor stamps", () => {
    expect(normalizeMerchant("PP*GOOGLE YOUTUBE SUBSCRI")).toBe(
      "GOOGLE YOUTUBE SUBSCRI",
    );
    expect(normalizeMerchant("PAYPAL *GITHUB INC")).toBe("GITHUB INC");
    expect(normalizeMerchant("ANC*ANCESTRY.COM")).toBe("ANCESTRY");
  });

  it("folds case, so the same merchant does not split on the feed's whim", () => {
    // Both spellings appear in the Chase export, 10 rows and 8 rows.
    expect(normalizeMerchant("WL *Steam Purchase")).toBe("STEAM PURCHASE");
    expect(normalizeMerchant("WL *STEAM PURCHASE")).toBe("STEAM PURCHASE");
  });

  it("drops trailing store, terminal and order numbers", () => {
    expect(normalizeMerchant("CVS/PHARMACY #01522")).toBe("CVS/PHARMACY");
    expect(normalizeMerchant("PIZZA HUT 036874")).toBe("PIZZA HUT");
    expect(normalizeMerchant("SHEETZ 0292")).toBe("SHEETZ");
    expect(normalizeMerchant("WAWA 592")).toBe("WAWA");
    expect(normalizeMerchant("GIANT 0359")).toBe("GIANT");
    expect(normalizeMerchant("LITTLE CAESAR 3021-0001")).toBe("LITTLE CAESAR");
    expect(normalizeMerchant("WEIS MARKETS INC 28")).toBe("WEIS MARKETS INC");
    expect(normalizeMerchant("CVSExtraCare 8007467287RI")).toBe("CVSEXTRACARE");
  });

  it("drops a lone letter left behind by a store number", () => {
    expect(normalizeMerchant("PANDA EXPRESS # 3006 P")).toBe("PANDA EXPRESS");
  });

  it("keeps a trailing letter that is part of the name", () => {
    // The letter is only noise when a number put it there.
    expect(normalizeMerchant("VITAMIN C")).toBe("VITAMIN C");
  });

  it("drops the per-order reference that would fragment a retailer", () => {
    // Every Amazon order carries a different reference; keeping them splits one merchant
    // into dozens and none of them ever looks recurring.
    expect(normalizeMerchant("AMZN Mktp US*T04OM6PZ3")).toBe("AMZN MKTP US");
    expect(normalizeMerchant("Amazon.com*ZC6UI2FR1")).toBe("AMAZON");
    expect(normalizeMerchant("AMAZON MKTPL*GC5PV4LN3")).toBe("AMAZON MKTPL");
    expect(normalizeMerchant("LOWES #00907*")).toBe("LOWES");
  });

  it("keeps an asterisk-separated word that is not an order reference", () => {
    // No digits, so it is part of the name rather than a reference.
    expect(normalizeMerchant("ANTHROPIC* CLAUDE SUB")).toBe("ANTHROPIC* CLAUDE SUB");
  });

  it("drops domain suffixes", () => {
    expect(normalizeMerchant("LOTUSEATERS.COM")).toBe("LOTUSEATERS");
    expect(normalizeMerchant("NETFLIX.COM")).toBe("NETFLIX");
    expect(normalizeMerchant("STEAMGAMES.COM 4259522985")).toBe("STEAMGAMES");
    expect(normalizeMerchant("PP*APPLE.COM/BILL")).toBe("APPLE/BILL");
  });

  it("collapses the employer's two payroll spellings into one", () => {
    // The bank changed its wording mid-2026 for the same job. Without this the income
    // history reads as one employer ending and another starting.
    expect(normalizeMerchant("Deposit from GA8248 TRUSTEDQA DIRDEP")).toBe(
      "GA8248 TRUSTEDQA",
    );
    expect(normalizeMerchant("Deposit from GA8248 TRUSTEDQA PAYROLL")).toBe(
      "GA8248 TRUSTEDQA",
    );
    expect(normalizeMerchant("Deposit from ENDAVA INC DIRECT DEP")).toBe("ENDAVA INC");
  });

  it("strips Chase's continuation ampersand", () => {
    expect(normalizeMerchant("& Prime Video Channels")).toBe("PRIME VIDEO CHANNELS");
    expect(normalizeMerchant("Prime Video Channels")).toBe("PRIME VIDEO CHANNELS");
  });

  it("normalizes the two rent payer strings that differ only in wrapping", () => {
    // TURBOTENANT.COM and TurboTenant are the same payer; the third spelling
    // (RENT:RAULIN) is left for a rule, since no string rule can equate it.
    expect(normalizeMerchant("Withdrawal from TURBOTENANT.COM RENT:RAULI")).toBe(
      "TURBOTENANT RENT:RAULI",
    );
    expect(normalizeMerchant("Withdrawal from TurboTenant RENT:RAULI")).toBe(
      "TURBOTENANT RENT:RAULI",
    );
  });

  it("returns empty for a description with nothing left after stripping", () => {
    expect(normalizeMerchant("")).toBe("");
    expect(normalizeMerchant("   ")).toBe("");
    expect(normalizeMerchant("Withdrawal from ")).toBe("");
  });
});

describe("processor residue", () => {
  // `PP*P36C17FF0B` used to strip down to the single letter `P`, which then became a payee
  // four unrelated PayPal charges shared. A processor stamp over an order reference names
  // no merchant at all, and saying so is what stops the residue becoming an alias.
  it("yields nothing for a PayPal stamp over an order reference", () => {
    for (const description of [
      "PP*P36C17FF0B",
      "PP*P35D2FE7E5",
      "PP*P34E4FB030",
      "PP*P3407FC0FA",
    ]) {
      expect(normalizeMerchant(description)).toBe("");
    }
  });

  it("keeps a merchant the processor stamp actually named", () => {
    expect(normalizeMerchant("PP*GOOGLE YOUTUBE SUBSCRI")).toBe(
      "GOOGLE YOUTUBE SUBSCRI",
    );
    expect(normalizeMerchant("PP*APPLE.COM/BILL")).toBe("APPLE/BILL");
  });

  it("leaves a short name the bank wrote itself alone", () => {
    // No processor stamp, so this is a badly written petrol station, not a reference.
    expect(normalizeMerchant("BP#9310152EP 5 290598250")).toBe("BP");
  });
});
