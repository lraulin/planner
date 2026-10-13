#!/usr/bin/env node
/**
 * Click-to-paint timings for the shell's navigation, on a production build.
 *
 * This is the procedure `agent-os/specs/2026-10-13-1155-immediate-navigation-and-page-cache/`
 * measures against, so a number written there can be reproduced rather than remembered. It
 * drives a real headless Chrome through the DevTools protocol (no dependencies, the same
 * approach as `.agents/skills/run-planner/driver.mjs`) and reports, per destination:
 *
 * - **active**: click -> the clicked link carries `aria-current="page"` (the "active look")
 * - **done**:   click -> the last DOM mutation before 500 ms of quiet (the page has painted)
 * - **server**: the navigation's RSC request, start -> last byte (null when no request fired)
 * - **requests**: RSC page requests the click made, prefetches excluded
 *
 * "First visit" and "revisit" are one run apart: every run starts from a cold full page
 * load (so the client cache is empty), visits each tab once, then each cached-eligible tab a
 * second time within the same minute. Median of `--runs` (default 5).
 *
 * Run it against a **production** server for numbers worth writing down - `next start`
 * ignores the dev login bypass, so the script signs in through the login form with the
 * local test account (a dev server with `AUTH_DEV_BYPASS=true` needs no sign-in, and its
 * timings include compilation, so they are only good for comparing the same server before
 * and after a change):
 *
 *   DATABASE_URL=... BETTER_AUTH_SECRET=... BETTER_AUTH_URL=http://localhost:3077 \
 *     npx next start -p 3077
 *   PLANNER_URL=http://localhost:3077 node scripts/navigation-timing.mjs
 *
 * Flags: `--runs N`, `--group plan|finances|prefetch|all`, `--json`.
 * Credentials: `PLANNER_EMAIL` / `PLANNER_PASSWORD`, default the seeded test account from
 * `.env.example`. Never point this at production.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const BASE = process.env.PLANNER_URL ?? "http://localhost:3077";
const EMAIL = process.env.PLANNER_EMAIL ?? "test@example.com";
const PASSWORD = process.env.PLANNER_PASSWORD ?? "password12345678";
const CHROME =
  process.env.PLANNER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? (args[at + 1] ?? fallback) : fallback;
};
const RUNS = Number(flag("runs", "5"));
const GROUP = flag("group", "all");
const AS_JSON = args.includes("--json");
/** Quiet period that ends a click: no DOM mutation for this long. */
const QUIET_MS = 500;

// ---------------------------------------------------------------------------- CDP client

let ws;
let nextId = 1;
const pending = new Map();
let session;
const requests = new Map();

function send(method, params = {}, sessionId = session) {
  const id = nextId++;
  const message = { id, method, params };
  if (sessionId) message.sessionId = sessionId;
  ws.send(JSON.stringify(message));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, method });
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`CDP timeout: ${method}`));
    }, 60_000);
  });
}

function onMessage(raw) {
  const message = JSON.parse(raw);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject, method } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(`${method}: ${message.error.message}`));
    else resolve(message.result);
    return;
  }
  const params = message.params;
  if (message.method === "Network.requestWillBeSent") {
    const headers = Object.fromEntries(
      Object.entries(params.request.headers).map(([k, v]) => [k.toLowerCase(), v]),
    );
    requests.set(params.requestId, {
      url: params.request.url,
      method: params.request.method,
      rsc: headers.rsc === "1",
      prefetch:
        headers["next-router-prefetch"] !== undefined ||
        headers["next-router-segment-prefetch"] !== undefined,
      start: params.timestamp,
      end: null,
      order: requests.size,
    });
  } else if (message.method === "Network.loadingFinished") {
    const entry = requests.get(params.requestId);
    if (entry) entry.end = params.timestamp;
  } else if (message.method === "Network.loadingFailed") {
    const entry = requests.get(params.requestId);
    if (entry) entry.end = params.timestamp;
  }
}

let chrome;
let profile;

async function launch() {
  profile = join(tmpdir(), `planner-navtiming-${process.pid}`);
  mkdirSync(profile, { recursive: true });
  chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--window-size=1440,900",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const portFile = join(profile, "DevToolsActivePort");
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    if (existsSync(portFile))
      port = readFileSync(portFile, "utf8").split("\n")[0].trim();
    if (!port) await sleep(100);
  }
  if (!port) throw new Error("Chrome never wrote DevToolsActivePort");
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  ws = new WebSocket(version.webSocketDebuggerUrl);
  ws.addEventListener("message", (event) => onMessage(event.data));
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error("DevTools socket failed")), {
      once: true,
    });
  });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" }, null);
  const attached = await send(
    "Target.attachToTarget",
    { targetId, flatten: true },
    null,
  );
  session = attached.sessionId;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: false });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  // Installed on every full load; soft navigations keep the same window.
  await send("Page.addScriptToEvaluateOnNewDocument", { source: PROBE });
}

function shutdown() {
  try {
    ws?.close();
  } catch {}
  chrome?.kill();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ?? "evaluate failed",
    );
  }
  return result.result.value;
}

// ------------------------------------------------------------------------------ in page

const PROBE = `(() => {
  const QUIET = ${QUIET_MS};
  window.__probe = {
    // Finds the visible link: scope is "modules" (sidebar), "pages" (page bar) or "any".
    find(scope, text, hrefPrefix) {
      const visible = (el) => el.getClientRects().length > 0;
      let navs = [...document.querySelectorAll("nav")];
      if (scope === "modules") navs = navs.filter((n) => n.getAttribute("aria-label") === "Modules");
      if (scope === "pages") navs = navs.filter((n) => /pages$/.test(n.getAttribute("aria-label") ?? ""));
      for (const nav of navs) {
        for (const a of nav.querySelectorAll("a[href]")) {
          if (!visible(a)) continue;
          // A collapsed sidebar draws icons only and carries the name in the title attribute.
          const label = (a.textContent ?? "").trim() || a.getAttribute("title") || "";
          const path = new URL(a.href).pathname;
          if (text && label !== text) continue;
          if (hrefPrefix && !path.startsWith(hrefPrefix)) continue;
          return a;
        }
      }
      return null;
    },
    click(scope, text, hrefPrefix) {
      return new Promise((resolve) => {
        const link = this.find(scope, text, hrefPrefix);
        if (!link) return resolve({ error: "link not found: " + scope + " " + text });
        const target = new URL(link.href);
        const isActive = () =>
          [...document.querySelectorAll('a[aria-current="page"]')].some((a) => {
            const url = new URL(a.href);
            return url.pathname === target.pathname;
          });
        if (isActive()) {
          // Already there: a click on it is a no-op navigation. Say so rather than time it.
          return resolve({ error: "already active: " + target.pathname });
        }
        const t0 = performance.now();
        let active = null;
        let last = t0;
        const observer = new MutationObserver(() => {
          const now = performance.now();
          last = now;
          if (active === null && isActive()) active = now - t0;
        });
        observer.observe(document.documentElement, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        });
        link.click();
        const timer = setInterval(() => {
          if (performance.now() - last > QUIET) {
            clearInterval(timer);
            observer.disconnect();
            resolve({
              path: location.pathname,
              target: target.pathname,
              active,
              done: last - t0,
            });
          }
        }, 25);
      });
    },
  };
})();`;

// -------------------------------------------------------------------------- measuring

async function goto(path) {
  await send("Page.navigate", { url: `${BASE}${path}` });
  // Wait for the document to finish loading, then for hydration and the prefetch burst.
  for (let i = 0; i < 300; i++) {
    const ready = await evaluate("document.readyState").catch(() => "loading");
    if (ready === "complete") break;
    await sleep(100);
  }
  await sleep(1500);
}

/**
 * Sign in through the form, but only when the server asks for it: a dev server with the
 * login bypass serves the app straight away. A production server always asks.
 */
async function login() {
  await goto("/plan/overview");
  if ((await evaluate("location.pathname")) !== "/login") return;
  await evaluate(`document.querySelector('input[name="email"]').focus()`);
  await send("Input.insertText", { text: EMAIL });
  await evaluate(`document.querySelector('input[name="password"]').focus()`);
  await send("Input.insertText", { text: PASSWORD });
  await evaluate(`document.querySelector('button[type="submit"]').click()`);
  for (let i = 0; i < 100; i++) {
    const path = await evaluate("location.pathname");
    if (path !== "/login") return;
    await sleep(200);
  }
  throw new Error("sign-in did not leave /login");
}

/** Click a link and report timings plus the network the click caused. */
async function click(label, scope, text, hrefPrefix) {
  const before = requests.size;
  const result = await evaluate(
    `window.__probe.click(${JSON.stringify(scope)}, ${JSON.stringify(text ?? null)}, ${JSON.stringify(hrefPrefix ?? null)})`,
  );
  if (result.error) throw new Error(`${label}: ${result.error}`);
  const caused = [...requests.values()].filter(
    (entry) => entry.order >= before && entry.rsc && entry.method === "GET",
  );
  const pages = caused.filter((entry) => !entry.prefetch);
  const prefetches = caused.filter((entry) => entry.prefetch);
  const serverSeconds = pages
    .filter((entry) => entry.end !== null)
    .map((entry) => entry.end - entry.start);
  return {
    label,
    active: result.active,
    done: result.done,
    server: serverSeconds.length > 0 ? Math.max(...serverSeconds) * 1000 : null,
    requests: pages.length,
    prefetches: prefetches.length,
  };
}

const median = (values) => {
  const sorted = values
    .filter((v) => v !== null && v !== undefined)
    .sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

async function prefetchCount(path) {
  await send("Page.navigate", { url: "about:blank" });
  await sleep(300);
  const before = requests.size;
  await send("Page.navigate", { url: `${BASE}${path}` });
  for (let i = 0; i < 300; i++) {
    const ready = await evaluate("document.readyState").catch(() => "loading");
    if (ready === "complete") break;
    await sleep(100);
  }
  await sleep(5000);
  const entries = [...requests.values()].filter(
    (entry) => entry.order >= before && entry.method === "GET" && entry.rsc,
  );
  return {
    path,
    prefetch: entries.filter((entry) => entry.prefetch).length,
    other: entries.filter((entry) => !entry.prefetch).length,
    prefetchMs: median(
      entries
        .filter((entry) => entry.prefetch && entry.end !== null)
        .map((entry) => (entry.end - entry.start) * 1000),
    ),
  };
}

// One run: cold load, then each step in order. `visit` marks first visit vs revisit.
const PLAN_STEPS = [
  ["Plan: Tasks", "visit", "pages", "Tasks"],
  ["Plan: Outline", "visit", "pages", "Outline"],
  ["Plan: Goals", "visit", "pages", "Goals"],
  ["Plan: Tasks", "revisit", "pages", "Tasks"],
  ["Plan: Outline", "revisit", "pages", "Outline"],
  ["Plan: Goals", "revisit", "pages", "Goals"],
];
const FINANCE_STEPS = [
  ["Finances: module switch", "visit", "modules", "Finances"],
  // Parks on a page the measured set does not use, so the first Budget click is never a
  // no-op however the previous run left the remembered page.
  ["Finances: park", "park", "pages", "Payees"],
  ["Finances: Budget", "visit", "pages", "Budget"],
  ["Finances: Accounts", "visit", "pages", "Accounts"],
  ["Finances: Bills", "visit", "pages", "Bills"],
  ["Finances: Budget", "revisit", "pages", "Budget"],
  ["Finances: Accounts", "revisit", "pages", "Accounts"],
  ["Finances: Bills", "revisit", "pages", "Bills"],
  ["Finances: Register", "visit", "pages", "Register"],
  ["Finances: Bills (after Register)", "revisit", "pages", "Bills"],
  ["Finances: Register", "revisit", "pages", "Register"],
  ["Finances: Budget (after Register)", "revisit", "pages", "Budget"],
];

async function oneRun(steps) {
  const rows = [];
  await goto("/plan/overview");
  for (const [label, visit, scope, text] of steps) {
    // A finances-only run still starts from a cold /plan/overview, so the shell is real.
    const row = await click(label, scope, text);
    rows.push({ ...row, visit });
  }
  return rows;
}

async function main() {
  await launch();
  try {
    await login();
    const groups = [];
    if (GROUP === "all" || GROUP === "plan") groups.push(PLAN_STEPS);
    if (GROUP === "all" || GROUP === "finances") groups.push(FINANCE_STEPS);

    const collected = new Map();
    for (const steps of groups) {
      for (let run = 0; run < RUNS; run++) {
        const rows = await oneRun(steps);
        rows.forEach((row, index) => {
          if (row.visit === "park") return;
          const key = `${steps[index][1]}|${row.label}`;
          if (!collected.has(key)) collected.set(key, []);
          collected.get(key).push(row);
        });
      }
    }

    let prefetches = [];
    if (GROUP === "all" || GROUP === "prefetch") {
      for (const path of ["/plan/tasks", "/finances/budget", "/finances/register"]) {
        prefetches.push(await prefetchCount(path));
      }
    }

    const summary = [...collected.entries()].map(([key, rows]) => ({
      visit: key.split("|")[0],
      label: rows[0].label,
      active: median(rows.map((r) => r.active)),
      done: median(rows.map((r) => r.done)),
      server: median(rows.map((r) => r.server)),
      requests: median(rows.map((r) => r.requests)),
      prefetches: median(rows.map((r) => r.prefetches)),
      runs: rows.length,
    }));

    if (AS_JSON) {
      console.log(JSON.stringify({ summary, prefetches }, null, 2));
    } else {
      const fmt = (v) => (v === null ? "-" : String(Math.round(v)));
      console.log(`navigation timing against ${BASE}, median of ${RUNS}\n`);
      console.log("| Step | Visit | Active ms | Done ms | Server ms | Page requests |");
      console.log("| ---- | ----- | --------- | ------- | --------- | ------------- |");
      for (const row of summary) {
        console.log(
          `| ${row.label} | ${row.visit} | ${fmt(row.active)} | ${fmt(row.done)} | ${fmt(row.server)} | ${fmt(row.requests)} |`,
        );
      }
      if (prefetches.length > 0) {
        console.log("\nPrefetch requests in the 5 s after a cold load:\n");
        for (const entry of prefetches) {
          console.log(
            `- ${entry.path}: ${entry.prefetch} prefetch (median ${fmt(entry.prefetchMs)} ms each), ${entry.other} page request(s)`,
          );
        }
      }
    }
  } finally {
    shutdown();
  }
}

main().catch((error) => {
  console.error(error);
  shutdown();
  process.exit(1);
});
