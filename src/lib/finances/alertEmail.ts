/**
 * Parse a bank's per-purchase alert email into a hold.
 *
 * Pure: the Apps Script that forwards mail (`scripts/gmail-alert-push.gs`) sends the plain
 * text untouched, so a wording change at the bank is a deploy here, not an edit to a script
 * running in Lee's Gmail (`agent-os/specs/2026-10-03-1500-card-holds-from-alert-emails/` D5).
 *
 * An alert is a **hold, never posted history**: it carries a day (no time), a display name,
 * an amount and the card's last four, and no transaction id. Identity is the Gmail message id.
 */

import { dateKeyFromParts } from "@/lib/schedule/geometry";
import { parseAmountCents } from "./money";

export const CAPITAL_ONE_ALERT_FEED = "alert:capitalone";
export const CHASE_ALERT_FEED = "alert:chase";
/** Every alert source — what `isAlertFeed` accepts, as a list SQL can use. */
export const ALERT_FEEDS = [CAPITAL_ONE_ALERT_FEED, CHASE_ALERT_FEED] as const;

export function isAlertFeed(source: string): boolean {
  return (ALERT_FEEDS as readonly string[]).includes(source);
}

export type AlertFeed = (typeof ALERT_FEEDS)[number];

export type ParsedAlert = {
  feed: AlertFeed;
  accountLast4: string;
  /** Calendar day the bank names in the alert. */
  transactionDate: string;
  /** The merchant as the alert names it. */
  description: string;
  /** Register convention: a charge is negative. */
  amountCents: number;
};

export type ParseAlertResult =
  { ok: true; alert: ParsedAlert } | { ok: false; error: string };

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const CAPITAL_ONE_SENDER = "capitalone@notification.capitalone.com";
const CAPITAL_ONE_CHARGE_SUBJECT = /\bnew transaction was charged\b/i;

/** "on Oct. 2, 2026, at Pizza Hut, a pending authorization or purchase in the amount of $12.71" */
const CAPITAL_ONE_CHARGE =
  /\bon\s+([A-Za-z]{3,9})\.?\s+(\d{1,2}),\s*(\d{4}),\s+at\s+(.+?),\s+a\s+(?:pending authorization or purchase|purchase|pending authorization)\s+in the amount of\s+(\$[\d,]+\.\d{2})/i;
const CAPITAL_ONE_LAST4 = /\bending in\s+(\d{4})\b/i;

const CHASE_SENDER = "no.reply.alerts@chase.com";
/** "You made a $49.55 transaction with Amazon.com" */
const CHASE_SUBJECT =
  /^\s*You made a\s+(\$[\d,]+\.\d{2})\s+transaction with\s+(.+?)\s*$/i;
const CHASE_LAST4 = /\(\.\.\.(\d{4})\)/;
/** "Date Oct 3, 2026 at 11:02 AM ET" */
const CHASE_DATE = /\bDate\b[\s|]*([A-Za-z]{3,9})\.?\s+(\d{1,2}),\s*(\d{4})/;

/** The calendar day in New York, where Chase stamps its alerts. */
function easternDateKey(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(
    instant,
  );
}

/**
 * Chase's per-purchase alert. The subject is the dependable part: it carries the amount and
 * merchant even when the plain-text body is a stub. The card comes from "(...9910)" and the
 * day from the "Date" row, falling back to the day the mail arrived (New York time).
 */
function parseChaseAlert(input: AlertEmailInput): ParseAlertResult {
  const subject = CHASE_SUBJECT.exec(input.subject);
  if (!subject) {
    return {
      ok: false,
      error: `Chase alert "${input.subject}" is not a purchase alert.`,
    };
  }
  const text =
    `${input.plainText} ${input.htmlBody ? stripTags(input.htmlBody) : ""}`.replace(
      /\s+/g,
      " ",
    );
  const last4 = CHASE_LAST4.exec(text);
  if (!last4) return { ok: false, error: "Could not find the card's last four." };

  let transactionDate: string | null = null;
  const named = CHASE_DATE.exec(text);
  if (named) {
    const month = MONTHS[named[1].slice(0, 3).toLowerCase()];
    transactionDate = month
      ? dateKeyFromParts(Number(named[3]), month, Number(named[2]))
      : null;
    if (transactionDate === null) {
      return {
        ok: false,
        error: `Unreadable date "${named[1]} ${named[2]}, ${named[3]}".`,
      };
    }
  } else if (input.receivedAt) {
    transactionDate = easternDateKey(input.receivedAt);
  } else {
    return { ok: false, error: "The alert names no date and none was supplied." };
  }

  const cents = parseAmountCents(subject[1]);
  if (cents === null || cents <= 0) {
    return { ok: false, error: `Unreadable amount "${subject[1]}".` };
  }
  return {
    ok: true,
    alert: {
      feed: CHASE_ALERT_FEED,
      accountLast4: last4[1],
      transactionDate,
      description: subject[2],
      amountCents: -cents,
    },
  };
}

/** The sender's bare address, whether given as `Name <addr>` or `addr`. */
function senderAddress(from: string): string {
  const bracketed = /<([^>]+)>/.exec(from);
  return (bracketed ? bracketed[1] : from).trim().toLowerCase();
}

export type AlertEmailInput = {
  from: string;
  subject: string;
  plainText: string;
  /**
   * The HTML part, when the sender's plain text is cut short (Chase's is a stub of table
   * borders). Its tags are stripped and the text appended before matching.
   */
  htmlBody?: string;
  /** When the mail arrived; the day of an alert that names none. */
  receivedAt?: Date;
};

function stripTags(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&");
}

export function parseAlertEmail(input: AlertEmailInput): ParseAlertResult {
  const sender = senderAddress(input.from);
  if (sender === CHASE_SENDER) return parseChaseAlert(input);
  if (sender !== CAPITAL_ONE_SENDER) {
    return { ok: false, error: `No alert parser for sender ${sender || "(none)"}.` };
  }
  if (!CAPITAL_ONE_CHARGE_SUBJECT.test(input.subject)) {
    return {
      ok: false,
      error: `Capital One alert "${input.subject}" is not a charge alert.`,
    };
  }

  const text = input.plainText.replace(/\s+/g, " ");
  const charge = CAPITAL_ONE_CHARGE.exec(text);
  if (!charge) return { ok: false, error: "Could not find the charge sentence." };
  const last4 = CAPITAL_ONE_LAST4.exec(text);
  if (!last4) return { ok: false, error: "Could not find the card's last four." };

  const month = MONTHS[charge[1].slice(0, 3).toLowerCase()];
  const day = Number(charge[2]);
  const year = Number(charge[3]);
  const transactionDate = month ? dateKeyFromParts(year, month, day) : null;
  if (transactionDate === null) {
    return {
      ok: false,
      error: `Unreadable date "${charge[1]} ${charge[2]}, ${charge[3]}".`,
    };
  }
  const cents = parseAmountCents(charge[5]);
  if (cents === null || cents <= 0) {
    return { ok: false, error: `Unreadable amount "${charge[5]}".` };
  }
  const description = charge[4].trim();
  if (description === "") return { ok: false, error: "The alert names no merchant." };

  return {
    ok: true,
    alert: {
      feed: CAPITAL_ONE_ALERT_FEED,
      accountLast4: last4[1],
      transactionDate,
      description,
      amountCents: -cents,
    },
  };
}
