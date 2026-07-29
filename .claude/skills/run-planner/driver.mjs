#!/usr/bin/env node
// Browser driver for the planner app. Zero dependencies: it launches the Chrome that is
// already on this machine with the DevTools protocol enabled and talks to it over Node's
// built-in WebSocket. There is no Playwright/Puppeteer install and nothing added to
// package.json.
//
// Usage (steps as args, or on stdin — see SKILL.md):
//   node .claude/skills/run-planner/driver.mjs 'goto /outline' 'shot outline'
//   node .claude/skills/run-planner/driver.mjs <<'EOF'
//   goto /outline
//   shot outline
//   EOF

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const BASE = process.env.PLANNER_URL ?? "http://localhost:3047";
const CHROME =
  process.env.PLANNER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = resolve(
  process.env.PLANNER_SHOTS ?? join(process.cwd(), ".artifacts/planner-shots"),
);

const argv = process.argv.slice(2);
const HEADED = argv.includes("--headed");
const KEEP = argv.includes("--keep-open"); // implies headed; leaves the browser running
const steps = argv.filter((a) => !a.startsWith("--"));

// ---------------------------------------------------------------------------- CDP client

let ws;
let nextId = 1;
const pending = new Map();
const consoleLog = [];
let session; // page session id
let dragData = null; // payload captured from Input.dragIntercepted
let dialogAccept = true; // how window.confirm() gets answered; flipped by `dismiss`

function send(method, params = {}, sessionId = session) {
  const id = nextId++;
  const msg = { id, method, params };
  if (sessionId) msg.sessionId = sessionId;
  ws.send(JSON.stringify(msg));
  return new Promise((res, rej) => {
    pending.set(id, { res, rej, method });
    setTimeout(() => {
      if (pending.delete(id)) rej(new Error(`CDP timeout: ${method}`));
    }, 30000);
  });
}

function onMessage(raw) {
  const m = JSON.parse(raw);
  if (m.id && pending.has(m.id)) {
    const { res, rej, method } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) rej(new Error(`${method}: ${m.error.message}`));
    else res(m.result);
    return;
  }
  if (m.method === "Runtime.consoleAPICalled") {
    const text = (m.params.args ?? [])
      .map((a) => a.value ?? a.description ?? a.type)
      .join(" ");
    consoleLog.push(`[${m.params.type}] ${text}`);
  }
  if (m.method === "Input.dragIntercepted") {
    dragData = m.params.data;
  }
  // A native window.confirm() freezes the renderer, and every later CDP call times out.
  // Deleting an appointment or a Time Chart area still uses one, so answer it immediately.
  if (m.method === "Page.javascriptDialogOpening") {
    consoleLog.push(`[dialog:${m.params.type}] ${m.params.message}`);
    send("Page.handleJavaScriptDialog", { accept: dialogAccept }).catch(() => {});
  }
  if (m.method === "Runtime.exceptionThrown") {
    const d = m.params.exceptionDetails;
    consoleLog.push(`[exception] ${d.exception?.description ?? d.text}`);
  }
}

// ------------------------------------------------------------------------- browser launch

let chromeProc;
let profileDir;

async function launch() {
  profileDir = join(tmpdir(), `planner-driver-${process.pid}`);
  mkdirSync(profileDir, { recursive: true });

  const args = [
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--window-size=1600,1000",
    "--hide-scrollbars",
    "about:blank",
  ];
  if (!HEADED && !KEEP) args.unshift("--headless=new");

  chromeProc = spawn(CHROME, args, { stdio: "ignore", detached: false });
  chromeProc.on("error", (e) => {
    console.error(`Cannot launch Chrome at ${CHROME}: ${e.message}`);
    process.exit(1);
  });

  // Chrome writes the chosen port here once the DevTools endpoint is listening.
  const portFile = join(profileDir, "DevToolsActivePort");
  let port;
  for (let i = 0; i < 100; i++) {
    if (existsSync(portFile)) {
      const first = readFileSync(portFile, "utf8").split("\n")[0].trim();
      if (first) {
        port = first;
        break;
      }
    }
    await sleep(100);
  }
  if (!port) throw new Error("Chrome never wrote DevToolsActivePort");

  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  ws = new WebSocket(version.webSocketDebuggerUrl);
  ws.addEventListener("message", (e) => onMessage(e.data));
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", () => rej(new Error("DevTools socket failed")), {
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
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1600,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

async function shutdown(code) {
  if (KEEP) {
    console.log("[driver] --keep-open: leaving Chrome running; close it yourself.");
    process.exit(code);
  }
  try {
    ws?.close();
  } catch {}
  try {
    chromeProc?.kill();
  } catch {}
  await sleep(200);
  try {
    if (profileDir) rmSync(profileDir, { recursive: true, force: true });
  } catch {}
  process.exit(code);
}

// -------------------------------------------------------------------- page-side helpers

// Injected into the page. Resolves a selector spec to an element:
//   text=Foo   deepest visible element whose text contains Foo
//   label=Foo  the form control labelled Foo (drawer/form fields)
//   css=...    explicit CSS
//   anything else is treated as CSS
const FINDER = `
(spec) => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };
  // 'scopeCss >> text=Foo' searches inside the scope — the same label often appears in
  // two places (a project sits in the schedule rail AND on the calendar).
  let root = document;
  if (spec.includes(' >> ')) {
    const [scope, inner] = spec.split(' >> ');
    root = document.querySelector(scope.trim());
    if (!root) return null;
    spec = inner.trim();
  }
  let el = null;
  if (spec.startsWith('label=')) {
    // Form fields carry React-generated ids (_r_0_), so labels are the only stable handle.
    const want = spec.slice(6).trim().toLowerCase();
    const labels = [...root.querySelectorAll('label')].filter(
      (l) => l.textContent.trim().toLowerCase() === want,
    );
    for (const l of labels) {
      const byFor = l.htmlFor ? document.getElementById(l.htmlFor) : null;
      const cand =
        byFor ||
        l.querySelector('input, select, textarea') ||
        l.parentElement?.querySelector('input, select, textarea');
      if (cand && visible(cand)) { el = cand; break; }
    }
  } else if (spec.startsWith('text=')) {
    const needle = spec.slice(5).trim().toLowerCase();
    const all = [...root.querySelectorAll('*')].filter(visible);
    const norm = (e) => (e.textContent || '').trim().toLowerCase();
    // Exact matches win outright: 'text=Save' must not land on "Unsaved changes".
    let hits = all.filter((e) => norm(e) === needle);
    if (!hits.length) hits = all.filter((e) => norm(e).includes(needle));
    // then the deepest, so 'text=ACME Account' hits the cell rather than <body>
    el = hits.filter((e) => !hits.some((o) => o !== e && e.contains(o))).pop() || null;
  } else {
    el = root.querySelector(spec.startsWith('css=') ? spec.slice(4) : spec);
    if (el && !visible(el)) { /* still return it; caller may only need existence */ }
  }
  return el;
}`;

async function evaluate(expression, awaitPromise = true) {
  const { result, exceptionDetails } = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise,
  });
  if (exceptionDetails)
    throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  return result.value;
}

// The finder is installed on window so page-side commands (select, text) can resolve the
// same selector specs without re-shipping it, and re-installed after every navigation.
async function installFinder() {
  await evaluate(`window.__find = ${FINDER}; 1`, false);
}

async function find(spec, { timeout = 8000, required = true } = {}) {
  const deadline = Date.now() + timeout;
  const probe = `(() => {
    const el = window.__find(${JSON.stringify(spec)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
             top: Math.round(r.top), left: Math.round(r.left),
             width: Math.round(r.width), height: Math.round(r.height),
             tag: el.tagName.toLowerCase(),
             text: (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)
               ? el.value : el.textContent || '').toString().trim().slice(0, 120) };
  })()`;
  for (;;) {
    const hit = await evaluate(probe, false);
    if (hit) return hit;
    if (Date.now() > deadline) {
      if (!required) return null;
      throw new Error(`selector not found after ${timeout}ms: ${spec}`);
    }
    await sleep(150);
  }
}

// ------------------------------------------------------------------------- input helpers

async function mouse(type, x, y, { button = "left", clickCount = 0 } = {}) {
  await send("Input.dispatchMouseEvent", {
    type,
    x,
    y,
    button,
    buttons: type === "mouseReleased" ? 0 : button === "left" ? 1 : 2,
    clickCount,
  });
}

async function clickAt(x, y, { button = "left", clicks = 1 } = {}) {
  await mouse("mouseMoved", x, y, { button: "none" });
  for (let i = 1; i <= clicks; i++) {
    await mouse("mousePressed", x, y, { button, clickCount: i });
    await mouse("mouseReleased", x, y, { button, clickCount: i });
  }
}

const KEYS = {
  Enter: { code: "Enter", key: "Enter", vk: 13, text: "\r" },
  Tab: { code: "Tab", key: "Tab", vk: 9 },
  Escape: { code: "Escape", key: "Escape", vk: 27 },
  Backspace: { code: "Backspace", key: "Backspace", vk: 8 },
  Delete: { code: "Delete", key: "Delete", vk: 46 },
  ArrowDown: { code: "ArrowDown", key: "ArrowDown", vk: 40 },
  ArrowUp: { code: "ArrowUp", key: "ArrowUp", vk: 38 },
  ArrowLeft: { code: "ArrowLeft", key: "ArrowLeft", vk: 37 },
  ArrowRight: { code: "ArrowRight", key: "ArrowRight", vk: 39 },
  Space: { code: "Space", key: " ", vk: 32, text: " " },
  // The outline's keyboard map leans on these: F2 renames, Insert adds a sibling.
  F2: { code: "F2", key: "F2", vk: 113 },
  Insert: { code: "Insert", key: "Insert", vk: 45 },
  Home: { code: "Home", key: "Home", vk: 36 },
  End: { code: "End", key: "End", vk: 35 },
};

async function pressKey(name) {
  const mods = { Shift: 8, Control: 2, Alt: 1, Meta: 4 };
  const parts = name.split("+");
  const base = parts.pop();
  const modifiers = parts.reduce((acc, p) => acc | (mods[p] ?? 0), 0);
  const k = KEYS[base];
  if (!k) throw new Error(`unknown key: ${base} (known: ${Object.keys(KEYS).join(", ")})`);
  const common = {
    key: k.key,
    code: k.code,
    windowsVirtualKeyCode: k.vk,
    nativeVirtualKeyCode: k.vk,
    modifiers,
  };
  await send("Input.dispatchKeyEvent", {
    type: k.text ? "keyDown" : "rawKeyDown",
    ...common,
    text: k.text,
  });
  await send("Input.dispatchKeyEvent", { type: "keyUp", ...common });
}

// Two-part step args are split on ' | ' (e.g. `fill input#name | Health`).
function split2(rest, cmd) {
  const i = rest.indexOf("|");
  if (i === -1) throw new Error(`${cmd} needs 'a | b', got: ${rest}`);
  return [rest.slice(0, i).trim(), rest.slice(i + 1).trim()];
}

// ------------------------------------------------------------------------------- commands

let shotCount = 0;

const COMMANDS = {
  async goto(rest) {
    const url = rest.startsWith("http") ? rest : BASE + (rest || "/");
    await send("Page.navigate", { url });
    // Next.js App Router: wait for the document then let React hydrate + paint.
    await evaluate(
      `new Promise((r) => document.readyState === 'complete'
         ? r(1) : addEventListener('load', () => r(1), { once: true }))`,
    );
    await sleep(600);
    await installFinder();
    console.log(`  → ${url}  "${await evaluate("document.title")}"`);
  },

  async shot(rest) {
    mkdirSync(OUT, { recursive: true });
    const name = (rest || `shot-${++shotCount}`).replace(/[^\w.-]+/g, "_");
    const file = join(OUT, name.endsWith(".png") ? name : `${name}.png`);
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(file, Buffer.from(data, "base64"));
    console.log(`  → ${file}`);
  },

  async click(rest) {
    const el = await find(rest);
    await clickAt(el.x, el.y);
    await sleep(400);
    console.log(`  → clicked <${el.tag}> "${el.text}"`);
  },

  async dblclick(rest) {
    const el = await find(rest);
    await clickAt(el.x, el.y, { clicks: 2 });
    await sleep(400);
    console.log(`  → double-clicked <${el.tag}> "${el.text}"`);
  },

  async rightclick(rest) {
    const el = await find(rest);
    await mouse("mouseMoved", el.x, el.y, { button: "none" });
    await mouse("mousePressed", el.x, el.y, { button: "right", clickCount: 1 });
    await mouse("mouseReleased", el.x, el.y, { button: "right", clickCount: 1 });
    await sleep(400);
    console.log(`  → right-clicked <${el.tag}> "${el.text}"`);
  },

  // Outline reorder is HTML5 drag-and-drop (draggable + dataTransfer), which plain
  // synthesized mouse events do NOT start. Chrome only exposes it through drag
  // interception: press, nudge past the threshold, catch Input.dragIntercepted, then
  // replay the payload as dragEnter/dragOver/drop on the target.
  //
  //   drag <src> | <dst> [| before|inside|after]
  //
  // The zone matters — DataGrid reads which third of the row the pointer is in, so a
  // drop at the exact centre reparents ("inside") instead of reordering.
  async drag(rest) {
    const parts = rest.split("|").map((s) => s.trim());
    if (parts.length < 2) throw new Error("drag needs 'src | dst [| zone]'");
    const [from, to, zone = "after"] = parts;
    const a = await find(from);
    const b = await find(to);
    const frac = { before: 0.15, inside: 0.5, after: 0.85 }[zone];
    if (frac === undefined) throw new Error(`zone must be before|inside|after, got ${zone}`);
    const tx = b.x;
    const ty = Math.round(b.top + b.height * frac);

    dragData = null;
    await send("Input.setInterceptDrags", { enabled: true });
    await mouse("mouseMoved", a.x, a.y, { button: "none" });
    await mouse("mousePressed", a.x, a.y, { clickCount: 1 });
    // The row only sets draggable=true in its mousedown handler, so React has to render
    // once before the gesture starts. Without this pause the drag never begins.
    await sleep(150);
    for (const [dx, dy] of [[6, 3], [18, 9], [30, 15]]) {
      await mouse("mouseMoved", a.x + dx, a.y + dy);
      await sleep(40);
    }
    for (let i = 0; i < 40 && !dragData; i++) await sleep(50);
    if (!dragData) {
      await send("Input.setInterceptDrags", { enabled: false });
      await mouse("mouseReleased", a.x, a.y, { clickCount: 1 });
      throw new Error(
        `no drag started from ${from} — is the row draggable? (only the outline grid is)`,
      );
    }
    for (const type of ["dragEnter", "dragOver", "drop"]) {
      await send("Input.dispatchDragEvent", { type, x: tx, y: ty, data: dragData });
      await sleep(120);
    }
    await send("Input.setInterceptDrags", { enabled: false });
    await mouse("mouseReleased", tx, ty, { clickCount: 1 });
    await sleep(800);
    console.log(`  → dragged "${a.text}" ${zone} "${b.text}"`);
  },

  // Pointer-based drag, for FullCalendar's rail → calendar drop (its Draggable listens to
  // mouse events, not HTML5 DnD) and anything else that tracks the pointer itself.
  async pdrag(rest) {
    const [from, to] = split2(rest, "pdrag");
    const a = await find(from);
    const b = await find(to);
    await mouse("mouseMoved", a.x, a.y, { button: "none" });
    await mouse("mousePressed", a.x, a.y, { clickCount: 1 });
    await sleep(80);
    const steps = 15;
    for (let i = 1; i <= steps; i++) {
      await mouse(
        "mouseMoved",
        Math.round(a.x + ((b.x - a.x) * i) / steps),
        Math.round(a.y + ((b.y - a.y) * i) / steps),
      );
      await sleep(35);
    }
    await mouse("mouseReleased", b.x, b.y, { clickCount: 1 });
    await sleep(800);
    console.log(`  → pointer-dragged "${a.text}" onto "${b.text}"`);
  },

  async type(rest) {
    await send("Input.insertText", { text: rest });
    await sleep(150);
    console.log(`  → typed ${JSON.stringify(rest)}`);
  },

  async key(rest) {
    await pressKey(rest);
    await sleep(300);
    console.log(`  → key ${rest}`);
  },

  async fill(rest) {
    const [sel, value] = split2(rest, "fill");
    const el = await find(sel);
    await clickAt(el.x, el.y, { clicks: 3 }); // triple-click selects existing value
    await send("Input.insertText", { text: value });
    await sleep(200);
    console.log(`  → filled ${sel} = ${JSON.stringify(value)}`);
  },

  // React tracks input values on the DOM node, so a plain `el.value = x` is swallowed on
  // the next render. Going through the prototype setter is what makes onChange fire.
  async select(rest) {
    const [sel, value] = split2(rest, "select");
    await find(sel); // wait for it, and fail with a useful message if absent
    const got = await evaluate(
      `(() => {
         const el = window.__find(${JSON.stringify(sel)});
         const opt = [...el.options].find(
           (o) => o.value === ${JSON.stringify(value)} ||
                  o.textContent.trim() === ${JSON.stringify(value)});
         if (!opt) return 'no such option: ' + [...el.options].map((o) => o.textContent.trim()).join(', ');
         const setter = Object.getOwnPropertyDescriptor(
           window.HTMLSelectElement.prototype, 'value').set;
         setter.call(el, opt.value);
         el.dispatchEvent(new Event('change', { bubbles: true }));
         return 'ok: ' + opt.textContent.trim();
       })()`,
      false,
    );
    if (got.startsWith("no such")) throw new Error(got);
    await sleep(300);
    console.log(`  → ${sel} → ${got}`);
  },

  // Flip how the next native dialogs are answered ('dialogs dismiss' to cancel a delete).
  async dialogs(rest) {
    dialogAccept = rest.trim() !== "dismiss";
    console.log(`  → window.confirm() will be ${dialogAccept ? "accepted" : "dismissed"}`);
  },

  async wait(rest) {
    const [sel, ms] = rest.split("|").map((s) => s.trim());
    const el = await find(sel, { timeout: ms ? Number(ms) : 8000 });
    console.log(`  → present <${el.tag}> "${el.text}"`);
  },

  async sleep(rest) {
    await sleep(Number(rest || 500));
  },

  async text(rest) {
    const value = await evaluate(
      // innerText, not textContent: textContent on 'body' drags in Next.js's inline
      // bootstrap scripts and buries the actual page copy.
      `(() => { const e = document.querySelector(${JSON.stringify(rest)});
                return e ? e.innerText.trim().replace(/\\s+/g, ' ').slice(0, 600) : null; })()`,
      false,
    );
    console.log(`  → ${value === null ? "(no match)" : value}`);
  },

  async count(rest) {
    const n = await evaluate(
      `document.querySelectorAll(${JSON.stringify(rest)}).length`,
      false,
    );
    console.log(`  → ${n} match(es) for ${rest}`);
  },

  async eval(rest) {
    const value = await evaluate(rest);
    console.log(`  → ${JSON.stringify(value)}`);
  },

  async console() {
    console.log(consoleLog.length ? consoleLog.join("\n") : "  → (console empty)");
  },
};

// ----------------------------------------------------------------------------------- main

async function readStdin() {
  if (process.stdin.isTTY) return [];
  let buf = "";
  for await (const chunk of process.stdin) buf += chunk;
  return buf.split("\n");
}

const HELP = `planner driver — commands (one per line on stdin, or one per argv entry)

  goto <path|url>          navigate (path is joined to ${BASE})
  shot <name>              PNG into ${OUT}
  click <sel>              real mouse click at element centre
  dblclick <sel>           double click (opens the detail drawer on grid rows)
  rightclick <sel>         context menu
  drag <selA> | <selB> [| before|inside|after]
                           HTML5 drag-and-drop — outline row reorder (default zone: after)
  pdrag <selA> | <selB>    pointer drag — FullCalendar rail → calendar
  type <text>              insert text into the focused element
  key <Name>               Enter Tab Escape Backspace Delete Insert F2 Home End Space
                           Arrow{Up,Down,Left,Right}; modifiers as 'Shift+Tab'
  fill <sel> | <value>     triple-click then insert
  select <sel> | <value>   choose an <option> (by value or visible text)
  wait <sel> [| ms]        poll until present (default 8000ms)
  sleep <ms>
  text <cssSel>            print innerText
  count <cssSel>           print match count
  eval <js>                evaluate in page, print result
  dialogs accept|dismiss   how window.confirm() is answered (default: accept)
  console                  dump collected console output

  <sel> is one of:
    text=Some Label        deepest visible match; exact text beats substring
    label=Priority         the form control with that label (stable; ids are not)
    .fc-timegrid-body >> text=Foo
                           CSS scope >> inner selector, when a label appears twice
    anything else          plain CSS

  Flags: --headed (visible window), --keep-open (leave Chrome running).
  Env:   PLANNER_URL, PLANNER_CHROME, PLANNER_SHOTS.`;

async function main() {
  let lines = steps.length ? steps : await readStdin();
  lines = lines.map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  if (!lines.length || lines[0] === "help") {
    console.log(HELP);
    process.exit(0);
  }

  // Fail loudly rather than screenshotting Chrome's error page.
  try {
    const res = await fetch(BASE, { method: "HEAD" });
    if (!res.ok && res.status >= 500) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    console.error(
      `Dev server not reachable at ${BASE} (${e.message}).\n` +
        `Start it first:  npm run db:up && npm run dev`,
    );
    process.exit(1);
  }

  await launch();

  for (const line of lines) {
    const sp = line.indexOf(" ");
    const cmd = sp === -1 ? line : line.slice(0, sp);
    const rest = sp === -1 ? "" : line.slice(sp + 1).trim();
    const fn = COMMANDS[cmd];
    if (!fn) {
      console.error(`unknown command: ${cmd}\n\n${HELP}`);
      await shutdown(1);
    }
    console.log(`${cmd}${rest ? " " + rest : ""}`);
    try {
      await fn(rest);
    } catch (e) {
      console.error(`  ✗ ${e.message}`);
      if (consoleLog.length) console.error(`page console:\n${consoleLog.join("\n")}`);
      await shutdown(1);
    }
  }

  const errors = consoleLog.filter((l) => l.startsWith("[error") || l.startsWith("[exception"));
  if (errors.length) console.log(`\npage errors:\n${errors.join("\n")}`);
  await shutdown(0);
}

main().catch(async (e) => {
  console.error(e);
  await shutdown(1);
});
