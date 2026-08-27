// ==UserScript==
// @name         Planner: Amazon Subscribe & Save snapshot
// @namespace    planner
// @version      1.0
// @description  Copy current Amazon subscriptions, payments and linked orders as a Planner snapshot. Never sends cookies off Amazon.
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
 * `# planner-amazon v1` JSON. It never POSTs to Planner and never copies addresses,
 * customer details, cookies or full card numbers.
 */

(function plannerAmazonSnapshot() {
  const PANEL_ID = "planner-amazon-panel";
  const CACHE_KEY = "planner-amazon-cache-v1";
  const HEADER = "# planner-amazon v1";
  const SOURCE = "amazon-browser-capture";
  const VERSION = 1;

  const SUBSCRIPTION_URLS = [
    "https://www.amazon.com/auto-deliveries",
    "https://www.amazon.com/gp/subscribe-and-save/manager/homepage.html",
    "https://www.amazon.com/gp/subscribe-and-save/manager",
  ];
  const PAYMENT_URLS = [
    "https://www.amazon.com/cpe/yourpayments/transactions",
    "https://www.amazon.com/gp/css/your-account/transactions",
  ];

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

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return emptyCache();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return emptyCache();
      return {
        payments:
          parsed.payments && typeof parsed.payments === "object" ? parsed.payments : {},
        orders: parsed.orders && typeof parsed.orders === "object" ? parsed.orders : {},
        items: parsed.items && typeof parsed.items === "object" ? parsed.items : {},
      };
    } catch {
      return emptyCache();
    }
  }

  function emptyCache() {
    return { payments: {}, orders: {}, items: {} };
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
    const match = /(?:ending in|••••|•••|\*\*\*\*|xxxx)\s*(\d{4})/i.exec(text ?? "");
    return match ? match[1] : null;
  }

  function amountFrom(text) {
    const match = /-\$?[\d,]+\.\d{2}|\$[\d,]+\.\d{2}/.exec(text ?? "");
    return match ? match[0] : "";
  }

  function cadenceLabelFrom(text) {
    const match =
      /deliver every\s+\d+\s+(?:month|week|day)s?|every\s+\d+\s+(?:month|week|day)s?|every month|monthly/i.exec(
        text ?? "",
      );
    return match ? match[0] : "";
  }

  function nextDeliveryFrom(text) {
    const labeled =
      /next delivery[:\s]+([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/i.exec(
        text ?? "",
      );
    return labeled ? labeled[1] : "";
  }

  function paymentStatusFrom(text) {
    const value = (text ?? "").toLowerCase();
    if (/refund/.test(value)) return "refunded";
    if (/pending|in progress|processing/.test(value)) return "pending";
    if (/complete|posted|paid|settled|closed/.test(value)) return "completed";
    return "unknown";
  }

  function instrumentFrom(text) {
    const value = (text ?? "").toLowerCase();
    if (/reward|promotion|amazon credit/.test(value)) return "rewards";
    if (/gift/.test(value)) return "gift";
    if (/visa|mastercard|amex|discover|card|ending in/.test(value)) return "card";
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
        nextDeliveryDate: nextDeliveryFrom(text),
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

  function parsePaymentPage(html) {
    const doc = parseDocument(html);
    const blobs = jsonBlobs(doc);
    const fromJson = collectFromJson(blobs, (record) => {
      const paymentId = String(
        record.transactionId ??
          record.paymentId ??
          record.id ??
          record.paymentTransactionId ??
          "",
      );
      if (
        !paymentId ||
        paymentId.length < 6 ||
        /\s/.test(paymentId) ||
        paymentId.includes("@")
      ) {
        return null;
      }
      const amount = record.amount ?? record.paymentAmount ?? record.total ?? "";
      const amountText =
        typeof amount === "object" && amount
          ? String(amount.amount ?? amount.value ?? "")
          : String(amount);
      const orderIds = unique([
        ...(Array.isArray(record.orderIds) ? record.orderIds.map(String) : []),
        ...(Array.isArray(record.orders)
          ? record.orders.map((order) =>
              String(order.orderId ?? order.amazonOrderId ?? ""),
            )
          : []),
        ...orderIdsFrom(JSON.stringify(record)),
      ]);
      if (!amountText && orderIds.length === 0) return null;
      const date = String(
        record.date ??
          record.paymentDate ??
          record.transactionDate ??
          record.postedDate ??
          "",
      );
      const text = `${amountText} ${date} ${String(record.instrument ?? record.paymentMethod ?? "")} ${String(record.status ?? "")}`;
      return {
        paymentId,
        date,
        amount: amountFrom(amountText) || amountText,
        status: paymentStatusFrom(text),
        cardLast4:
          last4From(text) ?? last4From(String(record.last4 ?? record.cardLast4 ?? "")),
        instrumentKind: instrumentFrom(text),
        amazonOrderIds: orderIds,
      };
    });

    const fromDom = [];
    for (const node of doc.querySelectorAll("tr, li, article, section, div")) {
      const text = textOf(node);
      if (text.length < 24 || text.length > 2500) continue;
      const orderIds = orderIdsFrom(text);
      const amount = amountFrom(text);
      if (!amount && orderIds.length === 0) continue;
      if (!/\$[\d,]+\.\d{2}/.test(text) && orderIds.length === 0) continue;
      const paymentId =
        node.getAttribute("data-transaction-id") ||
        node.getAttribute("id") ||
        `pay-${orderIds.join("-") || amount}-${text.slice(0, 24)}`;
      fromDom.push({
        paymentId: String(paymentId).replace(/\s+/g, "").slice(0, 80),
        date: nextDeliveryFrom(`next delivery ${text}`) || "",
        amount,
        status: paymentStatusFrom(text),
        cardLast4: last4From(text),
        instrumentKind: instrumentFrom(text),
        amazonOrderIds: orderIds,
      });
    }

    const byId = new Map();
    for (const row of [...fromJson, ...fromDom]) {
      if (!byId.has(row.paymentId)) byId.set(row.paymentId, row);
    }
    const nextHrefs = [...doc.querySelectorAll("a[href]")]
      .map((a) => a.getAttribute("href") ?? "")
      .filter((href) => /startIndex=|pageNumber=|pagination|next/i.test(href));
    return { payments: [...byId.values()], nextHrefs: unique(nextHrefs) };
  }

  function parseOrderPage(html, amazonOrderId) {
    const doc = parseDocument(html);
    const pageText = textOf(doc.body);
    const subscribeAndSave = /subscribe\s*&\s*save|std-sns-us/i.test(pageText);
    const orderDateMatch =
      /order placed[:\s]+([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}|\d{4}-\d{2}-\d{2})/i.exec(
        pageText,
      );
    const order = {
      amazonOrderId,
      orderDate: orderDateMatch ? orderDateMatch[1] : "",
      orderStatus: /cancelled/i.test(pageText)
        ? "Cancelled"
        : /delivered|shipped/i.test(pageText)
          ? "Shipped"
          : "",
      subscribeAndSave,
    };

    const items = [];
    const blobs = jsonBlobs(doc);
    const fromJson = collectFromJson(blobs, (record) => {
      const asin = String(record.asin ?? record.ASIN ?? "").toUpperCase();
      if (!/^[A-Z0-9]{10}$/.test(asin)) return null;
      const quantity = Number(record.quantity ?? record.qty ?? 1);
      return {
        amazonOrderId,
        asin,
        productName: String(record.title ?? record.productName ?? record.name ?? ""),
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        itemPaid: String(record.itemTotal ?? record.price ?? record.unitPrice ?? ""),
        itemTax: String(record.tax ?? ""),
        discounts: String(record.discount ?? record.promotion ?? ""),
        shippingCharge: String(record.shipping ?? ""),
        subscribeAndSave:
          record.subscribeAndSave === true ||
          /sns|subscribe/i.test(String(record.shippingOption ?? "")),
        subscriptionId: String(record.subscriptionId ?? "") || null,
      };
    });
    items.push(...fromJson);

    for (const row of doc.querySelectorAll(
      "[data-asin], .a-fixed-left-grid, .yo-item, tr",
    )) {
      const text = textOf(row);
      const asin =
        (row.getAttribute("data-asin") ?? "").toUpperCase() ||
        asinFrom(row.querySelector("a[href]")?.getAttribute("href") ?? "", text);
      if (!/^[A-Z0-9]{10}$/.test(asin)) continue;
      items.push({
        amazonOrderId,
        asin,
        productName: text.slice(0, 160),
        quantity: 1,
        itemPaid: amountFrom(text),
        itemTax: "",
        discounts: "",
        shippingCharge: "",
        subscribeAndSave: subscribeAndSave || /subscribe\s*&\s*save/i.test(text),
        subscriptionId: subscriptionIdFrom("", text) || null,
      });
    }

    const byAsin = new Map();
    for (const item of items) {
      const key = `${item.asin}:${item.productName}`;
      if (!byAsin.has(key)) byAsin.set(key, item);
    }
    return { order, items: [...byAsin.values()] };
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

  async function capture({ fullRescan }) {
    setBusy(true);
    try {
      const cache = fullRescan ? emptyCache() : loadCache();
      if (fullRescan) saveCache(cache);

      const subscriptionsResult = await fetchPaged(
        SUBSCRIPTION_URLS,
        (html) => {
          const parsed = parseSubscriptionPage(html);
          return { rows: parsed.subscriptions, nextHrefs: parsed.nextHrefs };
        },
        setStatus,
        20,
      );

      const paymentsResult = await fetchPaged(
        PAYMENT_URLS,
        (html) => {
          const parsed = parsePaymentPage(html);
          return { rows: parsed.payments, nextHrefs: parsed.nextHrefs };
        },
        setStatus,
        fullRescan ? 80 : 8,
      );

      const paymentsById = { ...cache.payments };
      for (const payment of paymentsResult.rows) {
        const cached = paymentsById[payment.paymentId];
        const completed =
          payment.status === "completed" || payment.status === "refunded";
        if (!fullRescan && cached && completed) continue;
        paymentsById[payment.paymentId] = payment;
      }

      const ordersById = { ...cache.orders };
      const itemsByOrder = { ...cache.items };
      const neededOrderIds = unique(
        Object.values(paymentsById).flatMap((payment) => payment.amazonOrderIds ?? []),
      );
      let ordersComplete = true;
      let fetched = 0;
      for (const amazonOrderId of neededOrderIds) {
        if (!fullRescan && ordersById[amazonOrderId]) continue;
        setStatus(`Order ${amazonOrderId} (${fetched + 1}/${neededOrderIds.length})…`);
        let parsed = null;
        for (const template of [
          `https://www.amazon.com/gp/your-account/order-details?orderID=${amazonOrderId}`,
          `https://www.amazon.com/gp/css/order-details?orderID=${amazonOrderId}`,
        ]) {
          try {
            const html = await getHtml(template);
            parsed = parseOrderPage(html, amazonOrderId);
            break;
          } catch {
            parsed = null;
          }
        }
        fetched += 1;
        if (!parsed) {
          ordersComplete = false;
          continue;
        }
        ordersById[amazonOrderId] = parsed.order;
        itemsByOrder[amazonOrderId] = parsed.items;
        await sleep(200);
      }

      const nextCache = {
        payments: paymentsById,
        orders: ordersById,
        items: itemsByOrder,
      };
      saveCache(nextCache);

      const snapshot = {
        version: VERSION,
        source: SOURCE,
        generatedAt: new Date().toISOString(),
        capturedOn: localDateKey(),
        completeness: {
          subscriptions: subscriptionsResult.complete,
          payments: paymentsResult.complete,
          orders:
            ordersComplete && neededOrderIds.every((id) => Boolean(ordersById[id])),
        },
        subscriptions: subscriptionsResult.rows,
        payments: Object.values(paymentsById),
        orders: Object.values(ordersById),
        items: Object.values(itemsByOrder).flat(),
      };

      const text = `${HEADER}\n${JSON.stringify(snapshot)}\n`;
      await writeClipboard(text);
      setStatus(
        `Copied ${snapshot.subscriptions.length} subscriptions, ${snapshot.payments.length} payments, ${snapshot.orders.length} orders. Paste on Planner → Finances → Orders.`,
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
      <div id="planner-amazon-status" style="margin-bottom:8px;opacity:.85;">Copies subscriptions, payments and linked orders. Incremental runs reuse completed history.</div>
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
