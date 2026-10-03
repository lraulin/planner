import { describe, expect, it } from "vitest";
import { isAlertFeed, parseAlertEmail } from "./alertEmail";

const FROM = "capitalone@notification.capitalone.com";
const SUBJECT = "A new transaction was charged to your account";

/** Real alerts (Lee's Gmail, 2026-10-02 and 2026-09-27), footers and tracking links cut. */
function body(sentence: string): string {
  return `View posted transaction details.
--
Capital One | VentureOne
--

A purchase was charged to your account.

About your VentureOne Credit Card ending in 3448

As requested, we're notifying you that ${sentence}

Note: You'll receive this notification for both purchases and pending authorizations, such as car rentals, hotel reservations and gas purchases, even if an actual transaction hasn't taken place.
`;
}

const PIZZA = body(
  "on Oct. 2, 2026, at Pizza Hut, a pending authorization or purchase in the amount of $12.71 was placed or charged on your VentureOne Credit Card.",
);

describe("parseAlertEmail", () => {
  it("reads a Capital One charge as a negative hold on the card's last four", () => {
    expect(parseAlertEmail({ from: FROM, subject: SUBJECT, plainText: PIZZA })).toEqual(
      {
        ok: true,
        alert: {
          feed: "alert:capitalone",
          accountLast4: "3448",
          transactionDate: "2026-10-02",
          description: "Pizza Hut",
          amountCents: -1271,
        },
      },
    );
  });

  it("keeps a merchant name with capitals and a thousands separator amount", () => {
    const result = parseAlertEmail({
      from: `Capital One <${FROM}>`,
      subject: SUBJECT,
      plainText: body(
        "on Sep. 27, 2026, at GROK XAI, a pending authorization or purchase in the amount of $1,030.00 was placed or charged on your VentureOne Credit Card.",
      ),
    });
    expect(result).toMatchObject({
      ok: true,
      alert: {
        description: "GROK XAI",
        amountCents: -103000,
        transactionDate: "2026-09-27",
      },
    });
  });

  it("wraps across line breaks the way a mail client folds long text", () => {
    const folded = PIZZA.replace("at Pizza Hut, a pending", "at Pizza\nHut, a pending");
    expect(
      parseAlertEmail({ from: FROM, subject: SUBJECT, plainText: folded }),
    ).toMatchObject({
      ok: true,
      alert: { description: "Pizza Hut" },
    });
  });

  it("refuses a sender it has no parser for rather than guessing", () => {
    const result = parseAlertEmail({
      from: "no.reply.alerts@chase.com",
      subject: SUBJECT,
      plainText: PIZZA,
    });
    expect(result.ok).toBe(false);
  });

  it("refuses other Capital One mail, such as a deposit notice", () => {
    const result = parseAlertEmail({
      from: FROM,
      subject: "A deposit has been made to your account",
      plainText: PIZZA,
    });
    expect(result.ok).toBe(false);
  });

  it("refuses a body whose wording changed, and one with no card", () => {
    expect(
      parseAlertEmail({ from: FROM, subject: SUBJECT, plainText: "Something new." }).ok,
    ).toBe(false);
    expect(
      parseAlertEmail({
        from: FROM,
        subject: SUBJECT,
        plainText: PIZZA.replace("ending in 3448", ""),
      }).ok,
    ).toBe(false);
  });

  it("refuses an impossible date", () => {
    const bad = PIZZA.replace("Oct. 2, 2026", "Feb. 31, 2026");
    expect(parseAlertEmail({ from: FROM, subject: SUBJECT, plainText: bad }).ok).toBe(
      false,
    );
  });
});

describe("isAlertFeed", () => {
  it("accepts alert sources only", () => {
    expect(isAlertFeed("alert:capitalone")).toBe(true);
    expect(isAlertFeed("scrape:capitalone")).toBe(false);
  });
});
