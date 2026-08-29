// ==UserScript==
// @name         Planner: copy Chase bank snapshot
// @namespace    planner
// @version      2.2
// @description  Copy Chase current-cycle posted and pending activity for Planner.
// @match        https://secure.chase.com/*
// @match        https://*.chase.com/*
// @grant        GM.setClipboard
// @grant        GM_setClipboard
// ==/UserScript==

/**
 * DOM-only extractor. Planner validates the fail-closed JSON, parses money/dates, resolves
 * the existing card, reconciles rows, and stores the exact clipboard as audit evidence.
 * Nothing is sent from Chase to Planner or anywhere else.
 */
(function plannerChaseBankSnapshot() {
  const BUTTON_ID = "planner-copy-chase-bank-snapshot";
  const LAST4_KEY = "planner-chase-last4";
  const KNOWN_LAST4 = "9910";
  const AMOUNT = /(?:-?\$[\d,]+(?:\.\d{2})?|\(\$[\d,]+(?:\.\d{2})?\))/;
  const DATE = /(?:[A-Za-z]{3} \d{1,2}, \d{4}|\d{1,2}\/\d{1,2}\/\d{4})/;
  /**
   * The one period selection that makes the captured set complete for the current cycle.
   *
   * Capital One asserts completeness through its "Posted Transactions Since Your Last
   * Statement" table heading; Chase asserts it here, in the dropdown above the activity
   * table. A capture taken under "Last 30 days" or a statement period is incomplete data,
   * not slightly-stale data, so the script refuses rather than letting Planner apply it.
   */
  const REQUIRED_PERIOD = /activity since last statement/i;
  /** Anything the period dropdown is known to offer — how its control is recognised. */
  const PERIOD_OPTION =
    /since last statement|statement period|last \d+\s*(?:days|months)|year to date|all transactions/i;

  function pageText() {
    return document.body ? document.body.innerText : "";
  }

  function clean(value) {
    return (value ?? "").replace(/\s+/g, " ").trim();
  }

  function isCardActivityPage() {
    return Boolean(
      document.querySelector("[data-testid='activity-container']") ||
      document.querySelector("[data-testid='pending-container']") ||
      /current balance[\s\S]{0,500}(?:activity|pending charges)/i.test(pageText()),
    );
  }

  function rememberLast4(value) {
    if (!/^\d{4}$/.test(value)) return;
    try {
      localStorage.setItem(LAST4_KEY, value);
    } catch {
      // Private browsing can reject storage; the visible heading still wins next time.
    }
  }

  function last4FromPage() {
    const match = /(?:ending in|••••|•••|\.\.\.|XXXX)\s*(\d{4})/i.exec(pageText());
    if (match) {
      rememberLast4(match[1]);
      return match[1];
    }
    try {
      return localStorage.getItem(LAST4_KEY) || KNOWN_LAST4;
    } catch {
      return KNOWN_LAST4;
    }
  }

  /**
   * What the activity period dropdown currently says, or null when no such control was
   * found. Null fails closed: an assertion nobody made is not an assertion.
   */
  function periodSelection() {
    for (const select of document.querySelectorAll("select")) {
      const options = [...select.options].map((option) => clean(option.textContent));
      if (!options.some((text) => PERIOD_OPTION.test(text))) continue;
      return clean(select.selectedOptions[0]?.textContent ?? "");
    }
    for (const node of document.querySelectorAll(
      "[role='combobox'], button[aria-haspopup='listbox'], button[aria-haspopup='menu']",
    )) {
      const text = clean(node.textContent);
      if (PERIOD_OPTION.test(text)) return text;
    }
    return null;
  }

  function currentBalance() {
    const labeled = document.querySelector(".activity-tile__recon-bar-balance");
    const direct = AMOUNT.exec(labeled?.textContent ?? "");
    if (direct) return direct[0];
    const nearby =
      /Current balance[^$\n(\-]{0,60}((?:-?\$[\d,]+(?:\.\d{2})?|\(\$[\d,]+(?:\.\d{2})?\)))/i.exec(
        pageText(),
      );
    return nearby?.[1] ?? "";
  }

  function postedTable() {
    return (
      document.querySelector('[id^="ACTIVITY-dataTableId"][id$="data-table"]') ||
      document.querySelector(
        "[data-testid='ACTIVITY-dataTableId-mds-diy-data-table']",
      ) ||
      document.querySelector("[data-testid='activity-container'] table")
    );
  }

  function pendingTable() {
    return (
      document.querySelector('[id^="PENDING-dataTableId"][id$="data-table"]') ||
      document.querySelector(
        "[data-testid='PENDING-dataTableId-mds-diy-data-table']",
      ) ||
      document.querySelector("[data-testid='pending-container'] table")
    );
  }

  function rowFromCells(row, pending) {
    const cells = [...row.querySelectorAll("th, td")];
    if (cells.length === 0) return null;
    const texts = cells.map((cell) => clean(cell.textContent));
    const date = texts.map((text) => DATE.exec(text)?.[0] ?? "").find(Boolean) ?? "";
    const amountIndex = texts.findLastIndex((text) => AMOUNT.test(text));
    const amount = amountIndex >= 0 ? (AMOUNT.exec(texts[amountIndex])?.[0] ?? "") : "";
    const accessible = row.querySelector("[data-testid='rich-text-accessible-text']");
    const description = clean(
      accessible?.textContent ??
        texts.find(
          (text, index) => index > 0 && index !== amountIndex && !DATE.test(text),
        ),
    );
    if (!date || !description || !amount) return null;
    return {
      transactionDate: date,
      postedDate: pending ? null : date,
      description,
      // Chase's activity table has no category column. Reading the description cell a
      // second time produced "CVSCVS" and "Amazon.comAmazon.com" as the bank's category.
      category: "",
      amount,
    };
  }

  function rowFromValues(row, pending) {
    const raw = row.getAttribute("data-values") ?? "";
    const date = DATE.exec(raw)?.[0] ?? "";
    const amountMatches = [...raw.matchAll(/-?\$[\d,]+(?:\.\d{2})?/g)];
    const amount = amountMatches.at(-1)?.[0] ?? "";
    if (!date || !amount) return null;
    const between = raw
      .slice(raw.indexOf(date) + date.length, raw.lastIndexOf(amount))
      .replace(/^\s*,|,\s*$/g, "")
      .split(",")
      .map(clean)
      .filter(Boolean);
    const description = between[0] ?? "";
    if (!description) return null;
    return {
      transactionDate: date,
      postedDate: pending ? null : date,
      description,
      category: "",
      amount,
    };
  }

  function rowsOf(table, pending) {
    if (!table) return { rows: [], failed: 0 };
    const candidates = [...table.querySelectorAll("tbody tr")].filter(
      (row) =>
        clean(row.textContent) !== "" || clean(row.getAttribute("data-values")) !== "",
    );
    const parsed = candidates.map(
      (row) => rowFromCells(row, pending) ?? rowFromValues(row, pending),
    );
    return {
      rows: parsed.filter(Boolean),
      failed: parsed.filter((row) => row === null).length,
    };
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

  function completeness(postedTable, pendingTable, postedRows, pendingRows, period) {
    const text = pageText();
    const wholeCycle = REQUIRED_PERIOD.test(period ?? "");
    const postedKnown =
      Boolean(postedTable) ||
      /no (?:recent |current )?(?:activity|transactions)/i.test(text);
    const pendingKnown =
      Boolean(pendingTable) || /no pending (?:charges|transactions)/i.test(text);
    const more = [...document.querySelectorAll("button, a")].some(
      (node) =>
        /(?:load|show) more/i.test(clean(node.textContent)) &&
        !node.hasAttribute("disabled"),
    );
    return {
      currentCycle:
        wholeCycle &&
        postedKnown &&
        pendingKnown &&
        postedRows.failed === 0 &&
        pendingRows.failed === 0 &&
        !more,
      posted: wholeCycle && postedKnown && postedRows.failed === 0 && !more,
      pending: pendingKnown && pendingRows.failed === 0,
      filtered: filtered(),
      searched: searched(),
    };
  }

  async function copySnapshot() {
    const accountLast4 = last4FromPage();
    const balance = currentBalance();
    const posted = postedTable();
    const pending = pendingTable();
    const postedRows = rowsOf(posted, false);
    const pendingRows = rowsOf(pending, true);
    const period = periodSelection();
    const body = {
      version: 1,
      source: "chase",
      capturedAt: new Date().toISOString(),
      accountLast4,
      balanceKind: "posted_only",
      currentBalance: balance,
      completeness: completeness(posted, pending, postedRows, pendingRows, period),
      posted: postedRows.rows,
      pending: pendingRows.rows,
    };
    const text = `# planner-bank-snapshot v1\n${JSON.stringify(body, null, 2)}\n`;
    await writeClipboard(text);
    const complete =
      body.completeness.currentCycle &&
      body.completeness.posted &&
      body.completeness.pending &&
      !body.completeness.filtered &&
      !body.completeness.searched;
    setStatus(
      complete && accountLast4 && balance
        ? `Copied ${body.posted.length} posted + ${body.pending.length} pending. Paste in Planner → Finances → Dashboard.`
        : REQUIRED_PERIOD.test(period ?? "")
          ? "Copied an incomplete snapshot. Clear search/filters and load the full current cycle before applying it."
          : 'Copied an incomplete snapshot: set the activity dropdown to "Activity since last statement" first.',
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

  function hostForButton() {
    const activity = document.querySelector("[data-testid='activity-container']");
    if (activity?.parentElement)
      return { parent: activity.parentElement, before: activity };
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
