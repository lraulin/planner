// ==UserScript==
// @name         Planner: copy Capital One pending
// @namespace    planner
// @version      1.0
// @description  Copy Capital One's pending table as a Planner TSV. Paste it on /finances/dashboard.
// @match        https://myaccounts.capitalone.com/*
// @match        https://*.capitalone.com/*
// @grant        GM.setClipboard
// @grant        GM_setClipboard
// ==/UserScript==

/**
 * Thin extractor. Planner's parser in src/lib/finances/capitalOnePending.ts is the
 * source of truth for cents, last-4, and dates. This file only reads the DOM.
 *
 * Collapsed rows show no date. Expanding reveals `Purchased: Sun, Aug 16, 2026`.
 */

(function plannerCapOnePending() {
  const BUTTON_ID = "planner-copy-pending";
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

  function parsePurchased(raw) {
    const match = /^([A-Za-z]{3}), ([A-Za-z]{3}) (\d{1,2}), (\d{4})$/.exec(raw.trim());
    if (!match) return "";
    const month = MONTHS[match[2]];
    if (!month) return "";
    return `${match[4]}-${month}-${String(match[3]).padStart(2, "0")}`;
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  async function expand(row) {
    if (row.classList.contains("c1-ease-row--expanded")) return;
    const toggle =
      row.querySelector(".c1-ease-txns-description__details") ||
      row.querySelector("[aria-expanded]");
    if (!(toggle instanceof HTMLElement)) return;
    toggle.click();
    for (let i = 0; i < 20; i += 1) {
      await sleep(50);
      if (/Purchased:/.test(row.innerText)) return;
    }
  }

  function textOf(row, selector) {
    const node = row.querySelector(selector);
    return node ? node.textContent.replace(/\s+/g, " ").trim() : "";
  }

  function last4Of(row) {
    const card = textOf(row, ".c1-ease-column-card");
    const match = /(\d{4})\s*$/.exec(card);
    return match ? match[1] : "";
  }

  function amountOf(row) {
    const cell = row.querySelector(".c1-ease-column-amount");
    if (!cell) return "";
    const match = /\$[\d,]+(?:\.\d{2})?/.exec(cell.textContent ?? "");
    return match ? match[0] : "";
  }

  async function copyPending() {
    const rows = [...document.querySelectorAll("c1-ease-row[id^='Pending-']")];
    if (rows.length === 0) {
      setStatus("No pending rows on this page.");
      return;
    }

    const last4 = last4Of(rows[0]);
    const scraped = localDateKey();
    const lines = [
      "# planner-pending v1",
      `# account=${last4}`,
      `# scraped=${scraped}`,
      "date\tdescription\tcategory\tamount",
    ];

    for (const row of rows) {
      await expand(row);
      const purchased = /Purchased:\s*([A-Za-z]{3}, [A-Za-z]{3} \d{1,2}, \d{4})/.exec(
        row.innerText,
      );
      const date = purchased ? parsePurchased(purchased[1]) : "";
      const description = textOf(row, ".c1-ease-txns-description__description");
      const category = textOf(
        row,
        ".c1-ease-column-category .c1-ease-card-transactions-view-table__rewards-category",
      );
      const amount = amountOf(row);
      if (description === "" || amount === "") continue;
      lines.push([date, description, category, amount].join("\t"));
    }

    const tsv = `${lines.join("\n")}\n`;
    await writeClipboard(tsv);
    setStatus(
      `Copied ${lines.length - 4} pending rows. Paste on Planner → Finances → Dashboard.`,
    );
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

  function mount() {
    if (document.getElementById(BUTTON_ID)) return;
    const sample = document.querySelector("c1-ease-row[id^='Pending-']");
    if (!sample) return;
    const table = sample.closest("c1-ease-table") || sample.parentElement;
    if (!table || !table.parentElement) return;

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
    table.parentElement.insertBefore(button, table);
  }

  mount();
  setInterval(mount, 2000);
})();
