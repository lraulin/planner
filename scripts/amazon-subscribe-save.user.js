// ==UserScript==
// @name         Planner: Amazon order snapshot
// @namespace    planner
// @version      2.0
// @description  Copy Amazon order history, order totals, subscriptions and per-order charges as a Planner snapshot. Never sends cookies off Amazon.
// @match        https://www.amazon.com/*
// @match        https://www.amazon.com/auto-deliveries*
// @match        https://smile.amazon.com/*
// @grant        GM.setClipboard
// @grant        GM_setClipboard
// ==/UserScript==

/**
 * Thin extractor. Planner's parser in src/lib/amazon/snapshot.ts is the source of truth
 * for cents, calendar days, identifiers and completeness. This file only GETs Amazon pages
 * in the already-authenticated browser tab, caches completed history locally, and copies
 * `# planner-amazon v2` JSON. It never POSTs to Planner and never copies addresses,
 * customer details, cookies or full card numbers.
 *
 * v2 changes three things:
 *
 *  - **Orders are enumerated from order history**, not from whatever the payments page
 *    happened to mention. Each card yields the order id, the placed date and the TOTAL in
 *    one fetch, so the ledger's totals are right before any order-detail request.
 *  - **The order summary block is copied verbatim.** v1 hardcoded `itemTax: ""` and
 *    `discounts: ""` and took the item price from the first `$X.XX` in the row's text, so
 *    order-level tax and the Subscribe & Save saving were never captured at all.
 *  - **Charges are fetched per order** from the transactions page filtered by order id, and
 *    carry `sourceOrderId` so Planner can tell one charge seen from two orders from two
 *    charges seen from one.
 *
 * See agent-os/specs/2026-08-27-1521-amazon-order-totals-register-link/.
 */

(function plannerAmazonSnapshot() {
  const PANEL_ID = "planner-amazon-panel";
  const CACHE_KEY = "planner-amazon-cache-v2";
  const HEADER = "# planner-amazon v2";
  const SOURCE = "amazon-browser-capture";
  const VERSION = 2;

  /** How many years of order history an incremental run walks back. */
  const INCREMENTAL_YEARS = 2;
  const FULL_YEARS = 12;
  const ORDERS_PER_PAGE = 10;
  const MAX_HISTORY_PAGES_PER_YEAR = 25;

  const SUBSCRIPTION_URLS = [
    "https://www.amazon.com/auto-deliveries",
    "https://www.amazon.com/gp/subscribe-and-save/manager/homepage.html",
    "https://www.amazon.com/gp/subscribe-and-save/manager",
  ];

  function orderHistoryUrl(year, startIndex) {
    return `https://www.amazon.com/your-orders/orders?timeFilter=year-${year}&startIndex=${startIndex}`;
  }

  /**
   * Order detail. The modern path carries `data-component` attributes and a labeled charge
   * summary; the two older paths are kept because Amazon still serves them for some orders.
   */
  function orderDetailUrls(orderId) {
    return [
      `https://www.amazon.com/your-orders/order-details?orderID=${orderId}`,
      `https://www.amazon.com/gp/your-account/order-details?orderID=${orderId}`,
      `https://www.amazon.com/gp/css/order-details?orderID=${orderId}`,
    ];
  }

  function orderTransactionsUrl(orderId) {
    return `https://www.amazon.com/cpe/yourpayments/transactions?transactionTag=${orderId}`;
  }

  function localDateKey() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  function emptyCache() {
    return { history: {}, orders: {}, items: {}, charges: {} };
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return emptyCache();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return emptyCache();
      const base = emptyCache();
      for (const key of Object.keys(base)) {
        if (parsed[key] && typeof parsed[key] === "object") base[key] = parsed[key];
      }
      return base;
    } catch {
      return emptyCache();
    }
  }

  function saveCache(cache) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
      // Private mode can refuse storage; a capture still copies what this run fetched.
    }
  }

  function setStatus(message) {
    const status = document.getElementById("planner-amazon-status");
    if (status) status.textContent = message;
  }

  function setBusy(busy) {
    const capture = document.getElementById("planner-amazon-capture");
    const rescan = document.getElementById("planner-amazon-rescan");
    if (capture) capture.disabled = busy;
    if (rescan) rescan.disabled = busy;
  }

  async function getHtml(url) {
    const response = await fetch(url, {
      credentials: "include",
      headers: { Accept: "text/html,application/json" },
    });
    if (!response.ok) {
      throw new Error(`Amazon returned ${response.status} for ${shortUrl(url)}.`);
    }
    return response.text();
  }

  function shortUrl(url) {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  }

  function parseDocument(html) {
    return new DOMParser().parseFromString(html, "text/html");
  }

  function textOf(node) {
    return (node?.textContent ?? "").replace(/\s+/g, " ").trim();
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function asinFrom(href, text) {
    const fromHref = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i.exec(href ?? "");
    if (fromHref) return fromHref[1].toUpperCase();
    const fromText = /\b([A-Z0-9]{10})\b/.exec(text ?? "");
    return fromText ? fromText[1].toUpperCase() : "";
  }

  function subscriptionIdFrom(href, text) {
    const fromHref =
      /subscriptionId=([A-Za-z0-9._-]+)/i.exec(href ?? "") ||
      /\/subscription\/([A-Za-z0-9._-]+)/i.exec(href ?? "");
    if (fromHref) return fromHref[1];
    const fromText = /subscription(?: id)?[:\s]+([A-Za-z0-9._-]{6,})/i.exec(text ?? "");
    return fromText ? fromText[1] : "";
  }

  function orderIdsFrom(text) {
    return unique((text ?? "").match(/\b\d{3}-\d{7}-\d{7}\b/g) ?? []);
  }

  function last4From(text) {
    const match = /(?:ending in|••••|•••|\*{3,}|x{4})\s*(\d{4})/i.exec(text ?? "");
    return match ? match[1] : null;
  }

  const MONEY = /-?\$\s?[\d,]+\.\d{2}|\$\s?-[\d,]+\.\d{2}/;

  function amountFrom(text) {
    const match = MONEY.exec(text ?? "");
    return match ? match[0].replace(/\s/g, "") : "";
  }

  /** `TOTAL $21.14` on an order card, `Grand Total: $23.66` in a summary block. */
  function labeledAmount(text, labelPattern) {
    const match = new RegExp(
      `${labelPattern}\\s*:?\\s*(-?\\$\\s?[\\d,]+\\.\\d{2})`,
      "i",
    ).exec(text ?? "");
    return match ? match[1].replace(/\s/g, "") : "";
  }

  const DATE_TOKEN =
    "[A-Za-z]{3,9}\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}/\\d{1,2}/\\d{4}|\\d{4}-\\d{2}-\\d{2}";

  function labeledDate(text, labelPattern) {
    const match = new RegExp(`${labelPattern}\\s*:?\\s*(${DATE_TOKEN})`, "i").exec(
      text ?? "",
    );
    return match ? match[1] : "";
  }

  function firstDate(text) {
    const match = new RegExp(DATE_TOKEN).exec(text ?? "");
    return match ? match[0] : "";
  }

  function cadenceLabelFrom(text) {
    const match =
      /deliver every\s+\d+\s+(?:month|week|day)s?|every\s+\d+\s+(?:month|week|day)s?|every month|monthly/i.exec(
        text ?? "",
      );
    return match ? match[0] : "";
  }

  function paymentStatusFrom(text) {
    const value = (text ?? "").toLowerCase();
    if (/refund/.test(value)) return "refunded";
    if (/pending|in progress|processing|authorized/.test(value)) return "pending";
    if (/complete|posted|paid|settled|closed|charged/.test(value)) return "completed";
    return "unknown";
  }

  function instrumentFrom(text) {
    const value = (text ?? "").toLowerCase();
    if (/reward|promotion|amazon credit|points/.test(value)) return "rewards";
    if (/gift/.test(value)) return "gift";
    if (/visa|mastercard|amex|american express|discover|card|ending in/.test(value)) {
      return "card";
    }
    return "other";
  }

  function subscriptionStatusFrom(text) {
    const value = (text ?? "").toLowerCase();
    if (/cancel/.test(value)) return "cancelled";
    if (/action required|attention|payment issue|update/.test(value))
      return "attention";
    return "active";
  }

  function jsonBlobs(doc) {
    const blobs = [];
    for (const script of doc.querySelectorAll("script")) {
      const type = (script.getAttribute("type") ?? "").toLowerCase();
      const text = script.textContent ?? "";
      if (type.includes("json") || type === "a-state" || text.trim().startsWith("{")) {
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start >= 0 && end > start) {
          try {
            blobs.push(JSON.parse(text.slice(start, end + 1)));
          } catch {
            // Amazon embeds a lot of non-JSON; ignore.
          }
        }
      }
    }
    return blobs;
  }

  function walk(value, visit) {
    if (Array.isArray(value)) {
      for (const entry of value) walk(entry, visit);
      return;
    }
    if (value && typeof value === "object") {
      visit(value);
      for (const entry of Object.values(value)) walk(entry, visit);
    }
  }

  function collectFromJson(blobs, pick) {
    const found = [];
    for (const blob of blobs) {
      walk(blob, (record) => {
        const row = pick(record);
        if (row) found.push(row);
      });
    }
    return found;
  }

  // ───────────────────────────── subscriptions ─────────────────────────────

  function parseSubscriptionPage(html) {
    const doc = parseDocument(html);
    const blobs = jsonBlobs(doc);
    const fromJson = collectFromJson(blobs, (record) => {
      const subscriptionId = String(
        record.subscriptionId ?? record.subscriptionID ?? record.id ?? "",
      );
      const asin = String(record.asin ?? record.ASIN ?? "").toUpperCase();
      if (!subscriptionId || subscriptionId.length < 6) return null;
      if (/\s/.test(subscriptionId) || subscriptionId.includes("@")) return null;
      const quantity = Number(record.quantity ?? record.qty ?? 1);
      return {
        subscriptionId,
        asin: /^[A-Z0-9]{10}$/.test(asin) ? asin : "",
        productName: String(record.title ?? record.productName ?? record.name ?? ""),
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        cadenceLabel: String(record.deliverySchedule ?? record.frequency ?? ""),
        nextDeliveryDate: String(
          record.nextDeliveryDate ?? record.nextDelivery ?? record.nextOrderDate ?? "",
        ),
        status: subscriptionStatusFrom(
          String(record.status ?? record.state ?? "active"),
        ),
      };
    });

    const fromDom = [];
    const cards = doc.querySelectorAll(
      "[data-subscription-id], [data-csa-c-content-id*='subscription'], .subscription-card, [id*='subscription']",
    );
    const cardList =
      cards.length > 0 ? cards : doc.querySelectorAll("div, li, article, section");
    for (const card of cardList) {
      const text = textOf(card);
      if (text.length < 20 || text.length > 4000) continue;
      const hrefs = [...card.querySelectorAll("a[href]")].map((a) =>
        a.getAttribute("href"),
      );
      const subscriptionId =
        card.getAttribute("data-subscription-id") ||
        hrefs.map((href) => subscriptionIdFrom(href, "")).find(Boolean) ||
        subscriptionIdFrom("", text);
      if (!subscriptionId) continue;
      const asin =
        hrefs.map((href) => asinFrom(href, "")).find(Boolean) || asinFrom("", text);
      fromDom.push({
        subscriptionId,
        asin,
        productName:
          textOf(card.querySelector("h1, h2, h3, .a-truncate, .product-title")) ||
          text.slice(0, 120),
        quantity: 1,
        cadenceLabel: cadenceLabelFrom(text),
        nextDeliveryDate: labeledDate(text, "next delivery"),
        status: subscriptionStatusFrom(text),
      });
    }

    const byId = new Map();
    for (const row of [...fromJson, ...fromDom]) {
      if (!byId.has(row.subscriptionId)) byId.set(row.subscriptionId, row);
    }

    const nextHrefs = [...doc.querySelectorAll("a[href]")]
      .map((a) => a.getAttribute("href") ?? "")
      .filter((href) => /startIndex=|page=|pagination/i.test(href));
    return { subscriptions: [...byId.values()], nextHrefs: unique(nextHrefs) };
  }

  // ───────────────────────────── order history ─────────────────────────────

  const ORDER_CARD_SELECTOR = [
    ".order-card",
    ".js-order-card",
    "[class*='order-card']",
    ".order",
    "[data-component='orderCard']",
  ].join(", ");

  /**
   * One page of order history. Each card prints the order id, the placed date and the
   * order's grand total, which is what makes the totals right before any detail fetch.
   */
  function parseOrderHistoryPage(html) {
    const doc = parseDocument(html);
    const byId = new Map();
    const cards = doc.querySelectorAll(ORDER_CARD_SELECTOR);
    const list =
      cards.length > 0 ? cards : doc.querySelectorAll("li, article, section");
    for (const card of list) {
      const text = textOf(card);
      if (text.length < 20 || text.length > 6000) continue;
      const ids = orderIdsFrom(
        `${text} ${[...card.querySelectorAll("a[href]")]
          .map((a) => a.getAttribute("href") ?? "")
          .join(" ")}`,
      );
      // A container holding several cards names several orders; take only single-order
      // cards so a card's TOTAL is never read onto the wrong order.
      if (ids.length !== 1) continue;
      const amazonOrderId = ids[0];
      const row = {
        amazonOrderId,
        orderDate: labeledDate(text, "order placed") || firstDate(text),
        total: labeledAmount(text, "total"),
      };
      const seen = byId.get(amazonOrderId);
      // Nested markup yields the same card more than once; keep the reading that has both
      // a date and a total.
      if (!seen || (!seen.total && row.total) || (!seen.orderDate && row.orderDate)) {
        byId.set(amazonOrderId, row);
      }
    }
    const noOrders = /no orders|you have not placed any orders/i.test(
      textOf(doc.body).slice(0, 4000),
    );
    return { orders: [...byId.values()], noOrders };
  }

  async function fetchOrderHistory(years, onProgress) {
    const byId = new Map();
    let complete = true;
    for (const year of years) {
      for (let page = 0; page < MAX_HISTORY_PAGES_PER_YEAR; page += 1) {
        const url = orderHistoryUrl(year, page * ORDERS_PER_PAGE);
        onProgress(`Order history ${year}, page ${page + 1}…`);
        let html;
        try {
          html = await getHtml(url);
        } catch {
          complete = false;
          break;
        }
        const parsed = parseOrderHistoryPage(html);
        let added = 0;
        for (const order of parsed.orders) {
          if (!byId.has(order.amazonOrderId)) added += 1;
          byId.set(order.amazonOrderId, order);
        }
        await sleep(250);
        if (parsed.noOrders || parsed.orders.length === 0) break;
        // A page that repeats what we already have is Amazon clamping startIndex.
        if (added === 0) break;
      }
    }
    return { orders: [...byId.values()], complete };
  }

  // ───────────────────────────── order detail ─────────────────────────────

  const SUMMARY_BLOCK_SELECTOR = [
    "#od-subtotals",
    ".od-subtotals",
    "[data-component='chargeSummary']",
    "#digitalOrderSummaryContainer",
  ].join(", ");

  const SUMMARY_ROW = new RegExp(
    `^([A-Za-z][^$]{0,59}?)\\s*:?\\s*(-?\\$\\s?[\\d,]+\\.\\d{2})$`,
  );

  /**
   * Amazon's printed order summary as label/amount pairs, verbatim.
   *
   * Every row is offered up; the parser classifies and de-duplicates. A container div's text
   * runs several labels together and fails the anchored match, so only real rows survive.
   */
  function parseSummaryLines(doc) {
    const blocks = doc.querySelectorAll(SUMMARY_BLOCK_SELECTOR);
    const scope = blocks.length > 0 ? [...blocks] : [];
    const lines = [];
    const seen = new Set();
    for (const block of scope) {
      for (const row of block.querySelectorAll("div, tr, li, p, span")) {
        const text = textOf(row);
        if (text.length < 4 || text.length > 80) continue;
        const match = SUMMARY_ROW.exec(text);
        if (!match) continue;
        const label = match[1].trim();
        const amount = match[2].replace(/\s/g, "");
        const key = `${label.toLowerCase()}|${amount}`;
        if (seen.has(key)) continue;
        seen.add(key);
        lines.push({ label, amount });
      }
    }
    return lines;
  }

  function componentText(scope, name) {
    return textOf(scope.querySelector(`[data-component="${name}"]`));
  }

  /** The smallest ancestor of an item title that also carries the item's other fields. */
  function itemScopeFor(titleEl) {
    let node = titleEl;
    for (let depth = 0; depth < 6 && node?.parentElement; depth += 1) {
      node = node.parentElement;
      if (
        node.querySelector('[data-component="unitPrice"]') ||
        node.querySelector('[data-component="orderedMerchant"]') ||
        node.hasAttribute("data-asin")
      ) {
        return node;
      }
    }
    return titleEl.parentElement ?? titleEl;
  }

  function parseOrderDetail(html, amazonOrderId) {
    const doc = parseDocument(html);
    const pageText = textOf(doc.body);
    const subscribeAndSave = /subscribe\s*&\s*save|std-sns-us/i.test(pageText);
    const order = {
      amazonOrderId,
      orderDate: labeledDate(pageText, "order placed"),
      orderStatus: /cancelled/i.test(pageText)
        ? "Cancelled"
        : /delivered|shipped/i.test(pageText)
          ? "Shipped"
          : "",
      subscribeAndSave,
      summaryLines: parseSummaryLines(doc),
    };

    const items = [];
    const seen = new Set();
    for (const titleEl of doc.querySelectorAll('[data-component="itemTitle"]')) {
      const scope = itemScopeFor(titleEl);
      const href =
        titleEl.querySelector("a[href]")?.getAttribute("href") ??
        scope.querySelector("a[href]")?.getAttribute("href") ??
        "";
      const asin =
        (scope.getAttribute("data-asin") ?? "").toUpperCase() || asinFrom(href, "");
      if (!/^[A-Z0-9]{10}$/.test(asin)) continue;
      const quantityText = componentText(scope, "quantity");
      const quantity = Number((/\d+/.exec(quantityText) ?? ["1"])[0]);
      const cadence = componentText(scope, "deliveryFrequency");
      const scopeText = textOf(scope);
      const row = {
        amazonOrderId,
        asin,
        // The title element only, never the whole card: v1 used `text.slice(0, 160)` of the
        // card, which swept the price, the merchant and the delivery date into the name.
        productName: textOf(titleEl),
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        itemPaid: componentText(scope, "unitPrice") || amountFrom(scopeText),
        // Amazon prints tax and the subscription saving at order level only. Leaving these
        // empty is the honest answer; Planner allocates them from the order summary.
        itemTax: "",
        discounts: "",
        shippingCharge: "",
        subscribeAndSave:
          Boolean(cadence) ||
          /subscribe\s*&\s*save/i.test(scopeText) ||
          subscribeAndSave,
        subscriptionId: subscriptionIdFrom(href, scopeText) || null,
      };
      const key = `${asin}|${row.productName}|${row.itemPaid}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(row);
    }

    if (items.length === 0) {
      // Older order-detail markup has no `data-component` attributes.
      for (const node of doc.querySelectorAll(
        "[data-asin], .a-fixed-left-grid, .yo-item",
      )) {
        const text = textOf(node);
        const asin =
          (node.getAttribute("data-asin") ?? "").toUpperCase() ||
          asinFrom(node.querySelector("a[href]")?.getAttribute("href") ?? "", text);
        if (!/^[A-Z0-9]{10}$/.test(asin)) continue;
        const key = `${asin}|${text.slice(0, 60)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({
          amazonOrderId,
          asin,
          productName:
            textOf(node.querySelector("a, h2, h3, .a-truncate")) || text.slice(0, 160),
          quantity: 1,
          itemPaid: amountFrom(text),
          itemTax: "",
          discounts: "",
          shippingCharge: "",
          subscribeAndSave: subscribeAndSave || /subscribe\s*&\s*save/i.test(text),
          subscriptionId: subscriptionIdFrom("", text) || null,
        });
      }
    }

    return { order, items };
  }

  // ───────────────────────────── per-order charges ─────────────────────────────

  const TXN_DATE_SELECTOR =
    ".apx-transaction-date-container, [class*='transaction-date']";
  const TXN_ROW_SELECTOR =
    ".apx-transactions-line-item-component-container, [class*='transactions-line-item']";

  /**
   * That order's charges, from the transactions page filtered by order id. Amazon's own page
   * warns "Orders may have multiple charges", so every row is emitted; Planner's parser mints
   * the identity and collapses a charge seen from two of the orders it covers.
   */
  function parseOrderTransactions(html, sourceOrderId) {
    const doc = parseDocument(html);
    const nodes = doc.querySelectorAll(`${TXN_DATE_SELECTOR}, ${TXN_ROW_SELECTOR}`);
    const rows = [];
    let currentDate = "";
    for (const node of nodes) {
      const text = textOf(node);
      if (node.matches(TXN_DATE_SELECTOR)) {
        currentDate = firstDate(text) || currentDate;
        continue;
      }
      const amount = amountFrom(text);
      if (!amount) continue;
      rows.push({
        sourceOrderId,
        date: firstDate(text) || currentDate,
        amount,
        status: paymentStatusFrom(text),
        cardLast4: last4From(text),
        instrumentKind: instrumentFrom(text),
        amazonOrderIds: orderIdsFrom(text),
      });
    }
    if (rows.length === 0) {
      // Fall back to a flat scan when the class names have moved again.
      for (const node of doc.querySelectorAll("li, tr, .a-row")) {
        const text = textOf(node);
        if (text.length < 12 || text.length > 400) continue;
        const amount = amountFrom(text);
        if (!amount) continue;
        if (!/\d{3}-\d{7}-\d{7}/.test(text) && !last4From(text)) continue;
        rows.push({
          sourceOrderId,
          date: firstDate(text),
          amount,
          status: paymentStatusFrom(text),
          cardLast4: last4From(text),
          instrumentKind: instrumentFrom(text),
          amazonOrderIds: orderIdsFrom(text),
        });
      }
    }
    // Every row on this page belongs to the order we filtered by, whether or not the row
    // repeated the id.
    for (const row of rows) {
      if (!row.amazonOrderIds.includes(sourceOrderId)) {
        row.amazonOrderIds = [sourceOrderId, ...row.amazonOrderIds];
      }
    }
    return rows;
  }

  function absoluteUrl(href, base) {
    try {
      return new URL(href, base).href;
    } catch {
      return "";
    }
  }

  async function fetchPaged(startUrls, parsePage, onProgress, maxPages) {
    const seenUrls = new Set();
    const rows = [];
    const queue = [...startUrls];
    let pages = 0;
    let complete = false;
    while (queue.length > 0 && pages < maxPages) {
      const url = queue.shift();
      if (!url || seenUrls.has(url)) continue;
      seenUrls.add(url);
      onProgress(`Fetching ${shortUrl(url)}…`);
      let html;
      try {
        html = await getHtml(url);
      } catch (error) {
        if (pages === 0) throw error;
        return { rows, complete: false };
      }
      pages += 1;
      const parsed = parsePage(html);
      rows.push(...parsed.rows);
      const nexts = (parsed.nextHrefs ?? [])
        .map((href) => absoluteUrl(href, url))
        .filter(
          (href) => href.startsWith("https://www.amazon.com") && !seenUrls.has(href),
        );
      if (nexts.length === 0) complete = true;
      else queue.push(...nexts);
      await sleep(250);
    }
    return { rows, complete: complete && pages > 0 };
  }

  /** An order's evidence is settled once it is delivered or cancelled and has a total. */
  function isSettled(historyRow, detail) {
    if (!historyRow?.total) return false;
    const status = detail?.order?.orderStatus ?? "";
    return status === "Shipped" || status === "Cancelled";
  }

  async function capture({ fullRescan }) {
    setBusy(true);
    try {
      const cache = fullRescan ? emptyCache() : loadCache();
      const thisYear = new Date().getFullYear();
      const span = fullRescan ? FULL_YEARS : INCREMENTAL_YEARS;
      const years = [];
      for (let back = 0; back < span; back += 1) years.push(thisYear - back);

      const subscriptionsResult = await fetchPaged(
        SUBSCRIPTION_URLS,
        (html) => {
          const parsed = parseSubscriptionPage(html);
          return { rows: parsed.subscriptions, nextHrefs: parsed.nextHrefs };
        },
        setStatus,
        20,
      );

      const history = await fetchOrderHistory(years, setStatus);
      const historyById = { ...cache.history };
      for (const row of history.orders) historyById[row.amazonOrderId] = row;

      const ordersById = { ...cache.orders };
      const itemsByOrder = { ...cache.items };
      const chargesByOrder = { ...cache.charges };
      const orderIds = Object.keys(historyById);
      let detailComplete = true;
      let done = 0;

      for (const amazonOrderId of orderIds) {
        done += 1;
        const cachedDetail = ordersById[amazonOrderId]
          ? { order: ordersById[amazonOrderId] }
          : null;
        if (
          !fullRescan &&
          cachedDetail &&
          chargesByOrder[amazonOrderId] &&
          isSettled(historyById[amazonOrderId], cachedDetail)
        ) {
          continue;
        }
        setStatus(`Order ${amazonOrderId} (${done}/${orderIds.length})…`);

        let detail = null;
        for (const url of orderDetailUrls(amazonOrderId)) {
          try {
            detail = parseOrderDetail(await getHtml(url), amazonOrderId);
            if (detail.order.summaryLines.length > 0 || detail.items.length > 0) break;
          } catch {
            detail = null;
          }
        }
        if (detail) {
          ordersById[amazonOrderId] = detail.order;
          itemsByOrder[amazonOrderId] = detail.items;
        } else {
          detailComplete = false;
        }
        await sleep(200);

        try {
          chargesByOrder[amazonOrderId] = parseOrderTransactions(
            await getHtml(orderTransactionsUrl(amazonOrderId)),
            amazonOrderId,
          );
        } catch {
          detailComplete = false;
        }
        await sleep(200);
      }

      saveCache({
        history: historyById,
        orders: ordersById,
        items: itemsByOrder,
        charges: chargesByOrder,
      });

      // The history card is authoritative on the order's grand total and placed date; the
      // detail page is authoritative on the breakdown and the items.
      const orders = orderIds.map((amazonOrderId) => {
        const historyRow = historyById[amazonOrderId] ?? {};
        const detailRow = ordersById[amazonOrderId] ?? {};
        return {
          amazonOrderId,
          orderDate: historyRow.orderDate || detailRow.orderDate || "",
          orderStatus: detailRow.orderStatus ?? "",
          subscribeAndSave: detailRow.subscribeAndSave === true,
          total: historyRow.total ?? "",
          summaryLines: detailRow.summaryLines ?? [],
        };
      });

      const snapshot = {
        version: VERSION,
        source: SOURCE,
        generatedAt: new Date().toISOString(),
        capturedOn: localDateKey(),
        completeness: {
          subscriptions: subscriptionsResult.complete,
          payments: detailComplete,
          orders: history.complete && detailComplete,
        },
        subscriptions: subscriptionsResult.rows,
        payments: Object.values(chargesByOrder).flat(),
        orders,
        items: Object.values(itemsByOrder).flat(),
      };

      await writeClipboard(`${HEADER}\n${JSON.stringify(snapshot)}\n`);
      setStatus(
        `Copied ${snapshot.orders.length} orders, ${snapshot.payments.length} charges, ${snapshot.subscriptions.length} subscriptions. Paste on Planner → Finances → Orders.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Capture failed.");
    } finally {
      setBusy(false);
    }
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

  function mount() {
    if (document.getElementById(PANEL_ID)) return;
    if (!document.body) return;
    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.style.cssText =
      "position:fixed;z-index:2147483646;right:12px;bottom:12px;max-width:22rem;padding:10px 12px;background:#111;color:#fff;font:13px/1.35 system-ui;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.35);";
    panel.innerHTML = `
      <div style="font-weight:600;margin-bottom:6px;">Planner Amazon capture</div>
      <div id="planner-amazon-status" style="margin-bottom:8px;opacity:.85;">Copies order history with totals, order summaries, subscriptions and per-order charges. Incremental runs reuse settled orders.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button id="planner-amazon-capture" type="button" style="padding:6px 10px;cursor:pointer;">Capture</button>
        <button id="planner-amazon-rescan" type="button" style="padding:6px 10px;cursor:pointer;">Full rescan</button>
      </div>
    `;
    document.body.appendChild(panel);
    document.getElementById("planner-amazon-capture")?.addEventListener("click", () => {
      void capture({ fullRescan: false });
    });
    document.getElementById("planner-amazon-rescan")?.addEventListener("click", () => {
      void capture({ fullRescan: true });
    });
  }

  mount();
  setInterval(mount, 2500);
})();
