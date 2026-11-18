/**
 * Measure language-swap lag with realistic localStorage (accuracy both ways,
 * custom words, All range, Weak focus) on a given base URL.
 *
 * Usage: node scripts/measure-swap-lag.mjs <baseUrl> [--throttle=4]
 */
import { chromium } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:4173/language-tool/";
const throttleArg = process.argv.find((a) => a.startsWith("--throttle="));
const cpuThrottle = throttleArg ? Number(throttleArg.split("=")[1]) : 1;

function makeStatTuple(seed) {
  // StatTuple: [correct, attempts, lastSeenMs, windowBits, windowLen, manual]
  // Known requires the newest two window bits to be correct.
  const weak = seed % 5 === 0;
  const correct = weak ? 2 : 4;
  const attempts = weak ? 5 : 4;
  const windowBits = weak ? 0b10101 : 0b11111;
  const windowLen = 5;
  const manual = seed % 17 === 0 ? 1 : 0;
  return [correct, attempts, Date.now() - seed * 1000, windowBits, windowLen, manual];
}

function buildAccuracyStore(ids) {
  const enPl = {};
  const plEn = {};
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    enPl[id] = makeStatTuple(i);
    plEn[id] = makeStatTuple(i + 3);
  }
  // Extra noisy directions so localStorage is large.
  const deEn = {};
  for (let i = 0; i < Math.min(400, ids.length); i += 1) {
    deEn[ids[i]] = makeStatTuple(i + 9);
  }
  const updatedAt = new Date().toISOString();
  return {
    en_pl: { words: enPl, updatedAt },
    pl_en: { words: plEn, updatedAt },
    de_en: { words: deEn, updatedAt },
  };
}

function buildCustomWords() {
  const words = [];
  for (let i = 0; i < 80; i += 1) {
    words.push({
      id: `custom-en-pl-${i}`,
      createdAt: new Date(Date.now() - i * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - i * 86400000).toISOString(),
      pair: ["en", "pl"],
      pos: i % 3 === 0 ? "verb" : i % 3 === 1 ? "adjective" : "noun",
      forms: {
        en: { text: `custom-en-${i}`, accepted: [{ text: `custom-en-${i}` }] },
        pl: { text: `custom-pl-${i}`, accepted: [{ text: `custom-pl-${i}` }] },
      },
    });
  }
  for (let i = 0; i < 20; i += 1) {
    words.push({
      id: `custom-en-de-${i}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pair: ["de", "en"],
      pos: "noun",
      forms: {
        en: { text: `cende-${i}`, accepted: [{ text: `cende-${i}` }] },
        de: { text: `cende-de-${i}`, accepted: [{ text: `cende-de-${i}` }] },
      },
    });
  }
  return { words, tombstones: [], accountRevision: {} };
}

async function seedPage(page) {
  // Wait for catalog so we can read entry ids from the live deck network / window.
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForSelector('button.swap, button[aria-label="Swap languages"]', {
    timeout: 60000,
  });

  const ids = await page.evaluate(async () => {
    const base = document.querySelector("base")?.href || location.href;
    const catalogUrl = new URL("data/catalog.json", base).href;
    const catalog = await fetch(catalogUrl).then((r) => r.json());
    return catalog.entries.slice(0, 900).map((e) => e.id);
  });

  const accuracy = buildAccuracyStore(ids);
  const customs = buildCustomWords();
  const settings = {
    from: "en",
    to: "pl",
    mode: "quiz",
    focus: "weak",
    range: "all",
    size: "all",
  };

  await page.evaluate(
    ({ accuracy, customs, settings }) => {
      localStorage.setItem("slowka-accuracy-v1", JSON.stringify(accuracy));
      localStorage.setItem("slowka-custom-words-v1", JSON.stringify(customs));
      localStorage.setItem("slowka-settings-v2", JSON.stringify(settings));
    },
    { accuracy, customs, settings },
  );

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('button[aria-label="Swap languages"]', { timeout: 60000 });
  // Warm both language packs / sentence status before measuring steady swaps.
  await page.click('button[aria-label="Swap languages"]');
  await page.waitForTimeout(1200);
  await page.click('button[aria-label="Swap languages"]');
  await page.waitForTimeout(1200);
}

async function measureSwaps(page, label, clicks) {
  const longTasks = [];
  await page.evaluate(() => {
    window.__swapLongTasks = [];
    if (window.__swapObs) window.__swapObs.disconnect();
    window.__swapObs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__swapLongTasks.push({ duration: entry.duration, start: entry.startTime });
      }
    });
    try {
      window.__swapObs.observe({ type: "longtask", buffered: false });
    } catch {
      // longtask may be unavailable in some builds
    }
  });

  const samples = [];
  for (let i = 0; i < clicks; i += 1) {
    const sample = await page.evaluate(async () => {
      const swap = document.querySelector('button[aria-label="Swap languages"]');
      const prompt = document.querySelector("#lang-prompt");
      const answer = document.querySelector("#lang-answer");
      const beforeFrom = prompt?.value;
      const beforeTo = answer?.value;
      const t0 = performance.now();
      swap.click();
      // Picker paint: values flipped.
      let pickerMs = null;
      const pickerDeadline = t0 + 5000;
      while (performance.now() < pickerDeadline) {
        if (prompt.value === beforeTo && answer.value === beforeFrom) {
          pickerMs = performance.now() - t0;
          break;
        }
        await new Promise((r) => requestAnimationFrame(r));
      }
      // Settle: no long tasks and sentence card not stuck on Loading for this pair.
      let settleMs = null;
      const settleDeadline = t0 + 8000;
      while (performance.now() < settleDeadline) {
        await new Promise((r) => requestAnimationFrame(r));
        const loading = document.body.innerText.includes("Loading…");
        if (!loading) {
          // two quiet frames
          await new Promise((r) => requestAnimationFrame(r));
          await new Promise((r) => requestAnimationFrame(r));
          settleMs = performance.now() - t0;
          break;
        }
      }
      return { pickerMs, settleMs, from: prompt.value, to: answer.value };
    });
    samples.push(sample);
    await page.waitForTimeout(150);
  }

  const observed = await page.evaluate(() => window.__swapLongTasks || []);
  longTasks.push(...observed);

  const picker = samples.map((s) => s.pickerMs).filter((n) => n != null);
  const settle = samples.map((s) => s.settleMs).filter((n) => n != null);
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const max = (arr) => (arr.length ? Math.max(...arr) : null);

  return {
    label,
    clicks: samples.length,
    pickerAvg: avg(picker),
    pickerMax: max(picker),
    settleAvg: avg(settle),
    settleMax: max(settle),
    longTaskCount: longTasks.length,
    longTaskMax: max(longTasks.map((t) => t.duration)),
    samples,
  };
}

async function measurePickers(page, label) {
  // Change Prompt to German then back to English via <select>.
  const samples = [];
  for (const value of ["de", "en", "ja", "en"]) {
    const sample = await page.evaluate(async (next) => {
      const prompt = document.querySelector("#lang-prompt");
      const before = prompt.value;
      if (before === next) return null;
      const t0 = performance.now();
      prompt.value = next;
      prompt.dispatchEvent(new Event("change", { bubbles: true }));
      let pickerMs = null;
      while (performance.now() < t0 + 5000) {
        if (prompt.value === next) {
          pickerMs = performance.now() - t0;
          break;
        }
        await new Promise((r) => requestAnimationFrame(r));
      }
      let settleMs = null;
      while (performance.now() < t0 + 8000) {
        await new Promise((r) => requestAnimationFrame(r));
        if (!document.body.innerText.includes("Loading…")) {
          await new Promise((r) => requestAnimationFrame(r));
          settleMs = performance.now() - t0;
          break;
        }
      }
      return { pickerMs, settleMs, from: prompt.value, via: `${before}->${next}` };
    }, value);
    if (sample) samples.push(sample);
    await page.waitForTimeout(400);
  }
  const picker = samples.map((s) => s.pickerMs).filter((n) => n != null);
  const settle = samples.map((s) => s.settleMs).filter((n) => n != null);
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  return {
    label,
    pickerAvg: avg(picker),
    settleAvg: avg(settle),
    samples,
  };
}

function fmt(n) {
  return n == null ? "n/a" : `${n.toFixed(1)} ms`;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const client = await context.newCDPSession(page);
if (cpuThrottle > 1) {
  await client.send("Emulation.setCPUThrottlingRate", { rate: cpuThrottle });
}

console.log(`URL: ${baseUrl}`);
console.log(`CPU throttle: ${cpuThrottle}x`);
await seedPage(page);
const swap = await measureSwaps(page, "swap-button", 8);
const pickers = await measurePickers(page, "prompt-select");
console.log(JSON.stringify({ swap, pickers }, null, 2));
console.log(
  `SWAP picker avg/max ${fmt(swap.pickerAvg)} / ${fmt(swap.pickerMax)}; settle avg/max ${fmt(swap.settleAvg)} / ${fmt(swap.settleMax)}; longTasks ${swap.longTaskCount} max ${fmt(swap.longTaskMax)}`,
);
console.log(`PICKER change settle avg ${fmt(pickers.settleAvg)}`);

await browser.close();
