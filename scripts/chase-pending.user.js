// ==UserScript==
// @name         Planner: copy Chase pending
// @namespace    planner
// @version      1.0
// @description  Copy Chase's pending table as a Planner TSV. Paste it on /finances/dashboard. Includes Current balance.
// @match        https://secure.chase.com/*
// @match        https://*.chase.com/*
// @grant        GM.setClipboard
// @grant        GM_setClipboard
// ==/UserScript==

/**
 * Thin extractor. Planner's parser in src/lib/finances/capitalOnePending.ts is the
 * source of truth for cents, last-4, and dates. This file only reads the DOM.
 *
 * Chase dates live on the row: visible `Aug 18, 2026` and `data-values="08/18/2026,CVS,$22.84,"`.
 * Current balance is posted-only and sits in the recon bar next to the activity table.
 *
 * An empty pending accordion is a real snapshot. The Amazon charges that just posted
 * will not be in this table; that is the point of pasting it.
 */

(function plannerChasePending() {
  const BUTTON_ID = "planner-copy-chase-pending";
  const LAST4_KEY = "planner-chase-last4";
  // Personal tool: the Prime Visa last four, used only when the header is off-screen.
  const KNOWN_LAST4 = "9910";
  const MONTHS = {
    Jan: "01",
    Feb: "02",
    Mar: "03",
    Apr: "04",
    May: "05",
    Jun: "06",
    Jul: "07",
    Aug: "08",
    Sep: "09",
    Oct: "10",
    Nov: "11",
    Dec: "12",
  };

  function localDateKey() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
  }

  function parseVisibleDate(raw) {
    const match = /^([A-Za-z]{3}) (\d{1,2}), (\d{4})$/.exec(raw.trim());
    if (!match) return "";
    const month = MONTHS[match[1]];
    if (!month) return "";
    return `${match[3]}-${month}-${String(match[2]).padStart(2, "0")}`;
  }

  function parseSlashDate(raw) {
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw.trim());
    if (!match) return "";
    return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  }

  function pageText() {
    return document.body ? document.body.innerText : "";
  }

  function isCardActivityPage() {
    if (document.querySelector("[data-testid='activity-container']")) return true;
    if (document.querySelector("[data-testid='pending-container']")) return true;
    return /pending charges/i.test(pageText());
  }

  function rememberLast4(value) {
    if (!/^\d{4}$/.test(value)) return;
    try {
      localStorage.setItem(LAST4_KEY, value);
    } catch {
      // Private mode can refuse storage.
    }
  }

  function last4FromPage() {
    const text = pageText();
    const match = /(?:ending in|••••|•••|\.\.\.|XXXX)\s*(\d{4})/i.exec(text);
    if (match) {
      rememberLast4(match[1]);
      return match[1];
    }
    try {
      const stored = localStorage.getItem(LAST4_KEY);
      if (stored) return stored;
    } catch {
      // ignore
    }
    return KNOWN_LAST4;
  }

  function currentBalance() {
    const labeled = document.querySelector(".activity-tile__recon-bar-balance");
    if (labeled) {
      const match = /\$[\d,]+(?:\.\d{2})?/.exec(labeled.textContent ?? "");
      if (match) return match[0];
    }
    const text = pageText();
    const fromText = /Current balance[^$\n]{0,40}(\$[\d,]+\.\d{2})/i.exec(text);
    return fromText ? fromText[1] : "";
  }

  function pendingTable() {
    return (
      document.querySelector('[id^="PENDING-dataTableId"][id$="data-table"]') ||
      document.querySelector("[data-testid='PENDING-dataTableId-mds-diy-data-table']")
    );
  }

  function pendingRows() {
    const table = pendingTable();
    if (!table) return [];
    return [...table.querySelectorAll("tbody tr")];
  }

  function rowFromValues(row) {
    const raw = row.getAttribute("data-values") ?? "";
    const parts = raw.split(",");
    if (parts.length < 3) return null;
    const date = parseSlashDate(parts[0] ?? "");
    const description = (parts[1] ?? "").trim();
    const amountPart = parts.find((part) => /\$[\d,]+(?:\.\d{2})?/.test(part));
    const amount = amountPart
      ? (/(-?\$[\d,]+(?:\.\d{2})?)/.exec(amountPart)?.[1] ?? "")
      : "";
    if (description === "" || amount === "") return null;
    return { date, description, amount };
  }

  function rowFromCells(row) {
    const cells = [...row.querySelectorAll("th, td")];
    const dateCell = cells[0]?.textContent ?? "";
    const date = parseVisibleDate(dateCell.replace(/\s+/g, " ").trim());
    const accessible = row.querySelector("[data-testid='rich-text-accessible-text']");
    const description = (accessible?.textContent ?? cells[1]?.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const amountMatch = /(-?\$[\d,]+(?:\.\d{2})?)/.exec(cells[2]?.textContent ?? "");
    const amount = amountMatch ? amountMatch[1] : "";
    if (description === "" || amount === "") return null;
    return { date, description, amount };
  }

  async function copyPending() {
    const last4 = last4FromPage();
    if (!last4) {
      setStatus("Could not find the card last four.");
      return;
    }

    const scraped = localDateKey();
    const current = currentBalance();
    const lines = [
      "# planner-pending v1",
      `# account=${last4}`,
      "# source=chase",
      `# scraped=${scraped}`,
    ];
    if (current) lines.push(`# current=${current}`);
    lines.push("date\tdescription\tcategory\tamount");

    for (const row of pendingRows()) {
      const parsed = rowFromValues(row) ?? rowFromCells(row);
      if (!parsed) continue;
      lines.push([parsed.date, parsed.description, "", parsed.amount].join("\t"));
    }

    const tsv = `${lines.join("\n")}\n`;
    await writeClipboard(tsv);
    const count = lines.length - (current ? 6 : 5);
    if (count === 0) {
      setStatus(
        current
          ? `Copied 0 pending, current ${current}. Paste on Planner → Finances → Dashboard.`
          : "Copied 0 pending. Paste on Planner → Finances → Dashboard.",
      );
      return;
    }
    setStatus(`Copied ${count} pending rows. Paste on Planner → Finances → Dashboard.`);
  }

  async function writeClipboard(text) {
    if (typeof GM !== "undefined" && typeof GM.setClipboard === "function") {
      await GM.setClipboard(text);
      return;
    }
    if (typeof GM_setClipboard === "function") {
      GM_setClipboard(text);
      return;
    }
    await navigator.clipboard.writeText(text);
  }

  function setStatus(message) {
    const button = document.getElementById(BUTTON_ID);
    if (button) button.textContent = message;
  }

  function hostForButton() {
    const pending = document.querySelector("[data-testid='pending-container']");
    if (pending && pending.parentElement) {
      return { parent: pending.parentElement, before: pending };
    }
    const heading = document.querySelector(".activity-layout__heading");
    if (heading && heading.parentElement) {
      return { parent: heading.parentElement, before: heading.nextSibling };
    }
    const main = document.querySelector("main") || document.body;
    return { parent: main, before: main.firstChild };
  }

  function mount() {
    if (document.getElementById(BUTTON_ID)) return;
    if (!isCardActivityPage()) return;

    const host = hostForButton();
    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.textContent = "Copy pending for Planner";
    button.style.cssText =
      "margin:8px 0;padding:6px 10px;font:14px/1.3 system-ui;cursor:pointer;";
    button.addEventListener("click", () => {
      void copyPending().catch((error) => {
        setStatus(error instanceof Error ? error.message : "Copy failed.");
      });
    });
    host.parent.insertBefore(button, host.before);
  }

  mount();
  setInterval(mount, 2000);
})();
