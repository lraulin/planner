// ==UserScript==
// @name         Planner: copy Capital One bank snapshot
// @namespace    planner
// @version      2.2
// @description  Copy Capital One current-cycle posted and pending activity for Planner.
// @match        https://myaccounts.capitalone.com/*
// @match        https://*.capitalone.com/*
// @grant        GM.setClipboard
// @grant        GM_setClipboard
// ==/UserScript==

/** DOM-only extractor; Planner performs all validation, reconciliation, and storage. */
(function plannerCapitalOneBankSnapshot() {
  const BUTTON_ID = "planner-copy-capitalone-bank-snapshot";
  const LAST4_KEY = "planner-capone-last4";
  const KNOWN_LAST4 = "3448";
  const AMOUNT = /(?:-?\$[\d,]+(?:\.\d{2})?|\(\$[\d,]+(?:\.\d{2})?\))/;
  const BANK_DATE = "[A-Za-z]{3}, [A-Za-z]{3} \\d{1,2}, \\d{4}";

  function clean(value) {
    return (value ?? "").replace(/\s+/g, " ").trim();
  }

  function pageText() {
    return document.body ? document.body.innerText : "";
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function rowById(id) {
    return [...document.querySelectorAll("c1-ease-row[id]")].find(
      (row) => row.id === id,
    );
  }

  function hasExpandedDates(row) {
    return row.id.startsWith("Pending-")
      ? /Purchased:/.test(row.innerText)
      : /Posted:/.test(row.innerText);
  }

  async function expand(id) {
    let row = rowById(id);
    if (!row) return null;
    if (hasExpandedDates(row)) return row;
    const toggle =
      row.querySelector(".c1-ease-txns-description__details") ||
      row.querySelector("[aria-expanded]");
    if (!(toggle instanceof HTMLElement)) return row;
    toggle.click();
    for (let index = 0; index < 30; index += 1) {
      await sleep(50);
      // Expanding one transaction rerenders its whole table. Reacquire the row instead of
      // continuing to read the detached custom element captured before the click.
      row = rowById(id);
      if (row && hasExpandedDates(row)) return row;
    }
    return rowById(id);
  }

  function textOf(row, selector) {
    return clean(row.querySelector(selector)?.textContent);
  }

  function last4Of(row) {
    return /(\d{4})\s*$/.exec(textOf(row, ".c1-ease-column-card"))?.[1] ?? "";
  }

  function rememberLast4(value) {
    if (!/^\d{4}$/.test(value)) return;
    try {
      localStorage.setItem(LAST4_KEY, value);
    } catch {
      // Private browsing can reject storage.
    }
  }

  function last4FromPage(rows) {
    const fromRow = rows.map(last4Of).find(Boolean);
    if (fromRow) {
      rememberLast4(fromRow);
      return fromRow;
    }
    const heading = /(?:ending in|•••|\.\.\.)\s*(\d{4})/i.exec(pageText())?.[1];
    if (heading) {
      rememberLast4(heading);
      return heading;
    }
    try {
      return localStorage.getItem(LAST4_KEY) || KNOWN_LAST4;
    } catch {
      return KNOWN_LAST4;
    }
  }

  function amountOf(row) {
    return (
      AMOUNT.exec(
        row.querySelector(".c1-ease-column-amount")?.textContent ?? "",
      )?.[0] ?? ""
    );
  }

  function currentBalance() {
    const label = [...document.querySelectorAll("p")].find((node) =>
      /Current balance/i.test(node.textContent ?? ""),
    );
    const accessible = label?.parentElement?.parentElement?.querySelector(
      "c1-ease-currency .cdk-visually-hidden",
    );
    const direct = AMOUNT.exec(accessible?.textContent ?? "");
    if (direct) return direct[0];
    const match =
      /(?:Current Balance|Card Balance|Total Balance)[^$\n(\-]{0,80}((?:-?\$[\d,]+(?:\.\d{2})?|\(\$[\d,]+(?:\.\d{2})?\)))/i.exec(
        pageText(),
      );
    return match?.[1] ?? "";
  }

  function allRows() {
    return [...document.querySelectorAll("c1-ease-row[id]")];
  }

  function isCurrentCycleRow(row) {
    const table = row.closest("c1-ease-table");
    const heading = clean(table?.parentElement?.previousElementSibling?.textContent);
    return /Pending Transactions|Posted Transactions Since Your Last Statement/i.test(
      heading,
    );
  }

  async function readRows(rows) {
    const posted = [];
    const pending = [];
    let failed = 0;
    for (const original of rows) {
      if (!isCurrentCycleRow(original)) continue;
      const row = await expand(original.id);
      if (!row) {
        failed += 1;
        continue;
      }
      const text = row.innerText;
      const purchased =
        new RegExp(`Purchased:\\s*(${BANK_DATE})`).exec(text)?.[1] ?? "";
      const postedDate = new RegExp(`Posted:\\s*(${BANK_DATE})`).exec(text)?.[1] ?? "";
      // Payments expose only Posted; their table date and posted date are the same bank
      // event date. Purchases expose both and keep the richer Purchased date.
      const transactionDate = purchased || postedDate;
      const description = textOf(row, ".c1-ease-txns-description__description");
      const category = textOf(
        row,
        ".c1-ease-column-category .c1-ease-card-transactions-view-table__rewards-category",
      );
      const amount = amountOf(row);
      if (!transactionDate || !description || !amount) {
        failed += 1;
        continue;
      }
      const value = {
        transactionDate,
        postedDate: postedDate || null,
        description,
        category,
        amount,
      };
      if (row.id.startsWith("Pending-") || !postedDate) pending.push(value);
      else posted.push(value);
    }
    return { posted, pending, failed };
  }

  function searched() {
    return [
      ...document.querySelectorAll(
        "input[type='search'], input[placeholder*='search' i], input[aria-label*='search' i]",
      ),
    ].some((input) => clean(input.value) !== "");
  }

  function filtered() {
    const query = new URLSearchParams(location.search);
    if ([...query.keys()].some((key) => /filter/i.test(key))) return true;
    return [
      ...document.querySelectorAll(
        "button[aria-pressed='true'], [role='button'][aria-pressed='true']",
      ),
    ].some((button) => /filter/i.test(clean(button.textContent)));
  }

  function incompletePagination() {
    return [...document.querySelectorAll("button, a")].some(
      (node) =>
        /(?:load|show) more|next/i.test(clean(node.textContent)) &&
        !node.hasAttribute("disabled") &&
        node.getAttribute("aria-disabled") !== "true",
    );
  }

  function isCardActivityPage() {
    return (
      /\/Card\//i.test(location.pathname) ||
      allRows().length > 0 ||
      /no pending transactions/i.test(pageText())
    );
  }

  async function copySnapshot() {
    const rows = allRows();
    const accountLast4 = last4FromPage(rows);
    const balance = currentBalance();
    const captured = await readRows(rows);
    const text = pageText();
    const postedKnown =
      captured.posted.length > 0 || /no (?:posted |recent )?transactions/i.test(text);
    const pendingKnown =
      captured.pending.length > 0 || /no pending transactions/i.test(text);
    const completeCycle = !incompletePagination() && captured.failed === 0;
    const body = {
      version: 1,
      source: "capitalone",
      capturedAt: new Date().toISOString(),
      accountLast4,
      balanceKind: "posted_only",
      currentBalance: balance,
      completeness: {
        currentCycle: postedKnown && completeCycle,
        posted: postedKnown && completeCycle,
        pending: pendingKnown,
        filtered: filtered(),
        searched: searched(),
      },
      posted: captured.posted,
      pending: captured.pending.map((row) => ({ ...row, postedDate: null })),
    };
    const snapshot = `# planner-bank-snapshot v1\n${JSON.stringify(body, null, 2)}\n`;
    await writeClipboard(snapshot);
    const reasons = refusals(
      { postedKnown, pendingKnown, failed: captured.failed, ...body.completeness },
      accountLast4,
      balance,
    );
    setStatus(
      reasons.length === 0
        ? `Copied ${body.posted.length} posted + ${body.pending.length} pending. Paste in Planner → Finances → Dashboard.`
        : `Copied an incomplete snapshot — Planner will refuse it because ${reasons.join("; and ")}.`,
    );
  }

  /**
   * Why Planner would reject this capture, in the reader's terms. Empty means it will not.
   *
   * The old status named search and filters whatever the cause was, so a clean unfiltered
   * page that simply had not finished rendering reported the one thing the reader had
   * already done. The five-key `completeness` contract cannot carry this, so it is derived
   * from the same findings alongside it.
   */
  function refusals(found, accountLast4, balance) {
    const reasons = [];
    if (found.searched) reasons.push("a transaction search box still has text in it");
    if (found.filtered) reasons.push("an activity filter is switched on");
    if (incompletePagination()) reasons.push("the activity list has more rows to load");
    if (!found.postedKnown)
      reasons.push("the posted transactions table has not rendered");
    if (!found.pendingKnown) reasons.push("the pending section has not rendered");
    if (found.failed > 0) reasons.push(`${found.failed} row(s) could not be read`);
    if (!accountLast4) reasons.push("the card's last four digits are not on the page");
    if (!balance) reasons.push("the current balance could not be read");
    return reasons;
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
    const sample = allRows()[0];
    const table = sample?.closest("c1-ease-table");
    if (table?.parentElement) return { parent: table.parentElement, before: table };
    const main = document.querySelector("main") || document.body;
    return { parent: main, before: main.firstChild };
  }

  function mount() {
    if (document.getElementById(BUTTON_ID) || !isCardActivityPage()) return;
    const host = hostForButton();
    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.textContent = "Copy bank snapshot for Planner";
    button.style.cssText =
      "margin:8px 0;padding:6px 10px;font:14px/1.3 system-ui;cursor:pointer;";
    button.addEventListener("click", () => {
      void copySnapshot().catch((error) => {
        setStatus(error instanceof Error ? error.message : "Copy failed.");
      });
    });
    host.parent.insertBefore(button, host.before);
  }

  mount();
  setInterval(mount, 2000);
})();
