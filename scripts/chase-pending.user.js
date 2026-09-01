// ==UserScript==
// @name         Planner: copy Chase bank snapshot
// @namespace    planner
// @version      2.4
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
  /** Chase's own identifier for that selection — steadier than the string it displays. */
  const REQUIRED_PERIOD_VALUE = "SINCE_LAST_STATEMENT";
  /**
   * Chase's assertion that the activity list is whole.
   *
   * This is the counterpart to Capital One's "Posted Transactions Since Your Last
   * Statement" heading, and it is what makes an absent pending section readable. Chase
   * renders pending charges as a **separate tile** and renders nothing at all — no empty
   * state, no "no pending charges" text — when there are none, so absence is the only
   * signal there is. Absence alone would be indistinguishable from a tile that has not
   * loaded yet, and capturing zero pending while charges are held would delete real
   * pending money. Read together with a rendered activity table, this end-of-list sentinel
   * says the view has settled, and only then does "no pending tile" mean "no pending".
   *
   * Written without the apostrophe on purpose: the page may use either a straight or a
   * curly one.
   */
  const ACTIVITY_LIST_COMPLETE = /reached the end of your account activity/i;
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

  /** The label an option carries, whether as text or as the attribute a web component uses. */
  function optionLabel(option) {
    return clean(option.getAttribute?.("label") ?? option.textContent);
  }

  /** Does this control offer the activity periods — i.e. is it the one we are looking for? */
  function offersPeriods(node) {
    const options = [...(node.options ?? node.querySelectorAll("[label], option"))].map(
      optionLabel,
    );
    if (options.length === 0) return PERIOD_OPTION.test(clean(node.textContent));
    return options.some((text) => PERIOD_OPTION.test(text));
  }

  /**
   * The activity period control, or null when no such control was found.
   *
   * Chase renders this as `<mds-select>`, a custom element whose visible button lives in a
   * shadow root — so the document-level `[role='combobox']` / `button[aria-haspopup]`
   * queries this used to rely on can never see it. Its options are light-DOM children whose
   * labels are **attributes rather than text**, which is also why searching the page's text
   * for them finds nothing. The stable id is tried first and a generic scan backs it up, so
   * a renamed id degrades to the slower path instead of breaking the capture.
   */
  function periodControl() {
    const named = document.querySelector("#ACTIVITY-header-selector-label");
    // The id still has to earn it. A control that does not offer periods is not this one,
    // whatever it is called, and falling through beats reading the wrong selection.
    if (named && offersPeriods(named)) return named;
    for (const node of document.querySelectorAll(
      "select, mds-select, [role='combobox'], button[aria-haspopup='listbox'], button[aria-haspopup='menu']",
    )) {
      if (offersPeriods(node)) return node;
    }
    return null;
  }

  /**
   * What period the activity list is showing: the control's machine value where it has one,
   * and the label it displays. Null for both fails closed — an assertion nobody made is not
   * an assertion.
   *
   * The value is what the completeness check prefers. `SINCE_LAST_STATEMENT` is Chase's own
   * identifier for this selection and cannot drift with wording or locale, which a displayed
   * string can.
   */
  function periodSelection() {
    const control = periodControl();
    if (!control) return { value: null, label: null };

    if (control.options && control.selectedOptions) {
      return {
        value: clean(control.value),
        label: clean(control.selectedOptions[0]?.textContent ?? ""),
      };
    }

    const selected =
      control.querySelector?.("[selected='true']") ??
      control.querySelector?.("[selected]");
    const shadowButton = control.shadowRoot?.querySelector("button, [role='combobox']");
    return {
      value: typeof control.value === "string" ? clean(control.value) : null,
      label: selected
        ? optionLabel(selected)
        : clean(shadowButton?.textContent ?? control.textContent),
    };
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

  /**
   * Every assertion the capture depends on, evaluated once and kept separately.
   *
   * `completeness` below is the five-key contract Planner validates, and it cannot carry
   * anything else. Keeping the individual findings here is what lets the button say which
   * assertion failed: the old status named search and filters whatever the cause was, so a
   * page with no pending section and a clean unfiltered view reported the one thing the
   * reader had already done.
   */
  function assess(postedTable, pendingTable, postedRows, pendingRows, period) {
    const text = pageText();
    // Chase says the activity list is whole, and the table it is talking about is rendered.
    const activityListComplete =
      Boolean(postedTable) && ACTIVITY_LIST_COMPLETE.test(text);
    return {
      period: period.label,
      periodValue: period.value,
      activityListComplete,
      wholeCycle:
        period.value === REQUIRED_PERIOD_VALUE ||
        REQUIRED_PERIOD.test(period.label ?? ""),
      postedKnown:
        Boolean(postedTable) ||
        /no (?:recent |current )?(?:activity|transactions)/i.test(text),
      pendingKnown:
        Boolean(pendingTable) ||
        /no pending (?:charges|transactions)/i.test(text) ||
        activityListComplete,
      postedFailed: postedRows.failed,
      pendingFailed: pendingRows.failed,
      more: [...document.querySelectorAll("button, a")].some(
        (node) =>
          /(?:load|show) more/i.test(clean(node.textContent)) &&
          !node.hasAttribute("disabled"),
      ),
      filtered: filtered(),
      searched: searched(),
    };
  }

  function completeness(found) {
    return {
      currentCycle:
        found.wholeCycle &&
        found.postedKnown &&
        found.pendingKnown &&
        found.postedFailed === 0 &&
        found.pendingFailed === 0 &&
        !found.more,
      posted:
        found.wholeCycle &&
        found.postedKnown &&
        found.postedFailed === 0 &&
        !found.more,
      pending: found.pendingKnown && found.pendingFailed === 0,
      filtered: found.filtered,
      searched: found.searched,
    };
  }

  /** Why Planner would reject this capture, in the reader's terms. Empty means it will not. */
  function refusals(found, accountLast4, balance) {
    const reasons = [];
    if (!found.wholeCycle) {
      reasons.push(
        found.period === null
          ? "no activity-period dropdown was found on this page"
          : `the activity period reads "${found.period}" — choose "Activity since last statement"`,
      );
    }
    if (found.searched) reasons.push("a transaction search box still has text in it");
    if (found.filtered) reasons.push("an activity filter is switched on");
    if (found.more) reasons.push("the activity list has more rows to load");
    if (!found.postedKnown) reasons.push("the posted activity table has not rendered");
    if (!found.pendingKnown) {
      reasons.push(
        "there is no pending section and the activity list has not reported itself complete, so an empty pending set cannot be told apart from one still loading",
      );
    }
    if (found.postedFailed > 0) {
      reasons.push(`${found.postedFailed} posted row(s) could not be read`);
    }
    if (found.pendingFailed > 0) {
      reasons.push(`${found.pendingFailed} pending row(s) could not be read`);
    }
    if (!accountLast4) reasons.push("the card's last four digits are not on the page");
    if (!balance) reasons.push("the current balance could not be read");
    return reasons;
  }

  async function copySnapshot() {
    const accountLast4 = last4FromPage();
    const balance = currentBalance();
    const posted = postedTable();
    const pending = pendingTable();
    const postedRows = rowsOf(posted, false);
    const pendingRows = rowsOf(pending, true);
    const period = periodSelection();
    const found = assess(posted, pending, postedRows, pendingRows, period);
    const body = {
      version: 1,
      source: "chase",
      capturedAt: new Date().toISOString(),
      accountLast4,
      balanceKind: "posted_only",
      currentBalance: balance,
      completeness: completeness(found),
      posted: postedRows.rows,
      pending: pendingRows.rows,
    };
    const text = `# planner-bank-snapshot v1\n${JSON.stringify(body, null, 2)}\n`;
    await writeClipboard(text);
    const reasons = refusals(found, accountLast4, balance);
    setStatus(
      reasons.length === 0
        ? `Copied ${body.posted.length} posted + ${body.pending.length} pending. Paste in Planner → Finances → Dashboard.`
        : `Copied an incomplete snapshot — Planner will refuse it because ${reasons.join("; and ")}.`,
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
