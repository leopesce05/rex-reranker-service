const axios = require('axios');
const fs = require('fs');
const path = require('path');

const SERVER_URL = process.env.SERVER_URL || 'https://0jck8u55r8tl2e-8000.proxy.runpod.net/rerank';
const RESULTS_DIR = path.join(__dirname, 'results');

// ─── DOCUMENT POOL ────────────────────────────────────────────────────────────

const DOCUMENTS_POOL = [
  "Camiseta básica azul marino talla M - Algodón 100% - Precio $25",
  "Pantalón jean azul oscuro talla 32 - Corte slim - Precio $45",
  "Camiseta polo blanca talla L - Manga corta - Precio $30",
  "Zapatillas deportivas negras talla 42 - Running - Precio $80",
  "Camiseta manga larga azul claro talla M - Algodón orgánico - Precio $28",
  "Short deportivo negro talla M - Secado rápido - Precio $20",
  "Camiseta básica roja talla S - Algodón 100% - Precio $25",
  "Pantalón chino beige talla 34 - Corte regular - Precio $50",
  "Camiseta polo azul marino talla M - Manga corta - Precio $30",
  "Zapatillas casuales blancas talla 41 - Cuero sintético - Precio $65",
  "Camiseta básica negra talla L - Algodón 100% - Precio $25",
  "Pantalón cargo verde talla 36 - Múltiples bolsillos - Precio $55",
  "Camiseta manga larga gris talla M - Algodón 100% - Precio $28",
  "Zapatillas running azules talla 43 - Amortiguación - Precio $90",
  "Camiseta polo verde talla S - Manga corta - Precio $30",
  "Pantalón jean azul claro talla 30 - Corte recto - Precio $45",
  "Camiseta básica blanca talla M - Algodón 100% - Precio $25",
  "Short de baño azul talla M - Secado rápido - Precio $22",
  "Camiseta manga larga negra talla L - Algodón 100% - Precio $28",
  "Zapatillas deportivas rojas talla 40 - Running - Precio $80",
  "Camiseta polo azul cielo talla M - Manga corta - Precio $30",
  "Pantalón chino azul marino talla 32 - Corte slim - Precio $50",
  "Camiseta básica azul marino talla S - Algodón 100% - Precio $25",
  "Zapatillas casuales negras talla 42 - Cuero sintético - Precio $65",
  "Camiseta manga larga azul oscuro talla M - Algodón orgánico - Precio $28",
  "Pantalón jean negro talla 34 - Corte slim - Precio $45",
  "Camiseta polo blanca talla M - Manga corta - Precio $30",
  "Short deportivo azul talla L - Secado rápido - Precio $20",
  "Camiseta básica gris talla M - Algodón 100% - Precio $25",
  "Zapatillas running negras talla 44 - Amortiguación - Precio $90",
  "Camiseta polo azul marino talla L - Manga corta - Precio $30",
  "Pantalón cargo negro talla 38 - Múltiples bolsillos - Precio $55",
  "Camiseta manga larga azul claro talla S - Algodón 100% - Precio $28",
  "Zapatillas deportivas blancas talla 41 - Running - Precio $80",
  "Camiseta básica azul cielo talla M - Algodón 100% - Precio $25",
  "Pantalón jean azul oscuro talla 36 - Corte recto - Precio $45",
  "Camiseta polo verde talla M - Manga corta - Precio $30",
  "Short de baño azul marino talla L - Secado rápido - Precio $22",
  "Camiseta manga larga azul marino talla M - Algodón orgánico - Precio $28",
  "Zapatillas casuales azules talla 43 - Cuero sintético - Precio $65",
  "Camiseta básica azul claro talla M - Algodón 100% - Precio $25",
  "Pantalón chino azul talla 30 - Corte regular - Precio $50",
  "Camiseta polo azul oscuro talla S - Manga corta - Precio $30",
  "Zapatillas running azules talla 42 - Amortiguación - Precio $90",
  "Camiseta básica azul marino talla L - Algodón 100% - Precio $25",
  "Pantalón jean azul claro talla 32 - Corte slim - Precio $45",
  "Camiseta manga larga azul cielo talla M - Algodón 100% - Precio $28",
  "Short deportivo azul oscuro talla M - Secado rápido - Precio $20",
  "Zapatillas deportivas azules talla 40 - Running - Precio $80",
  "Pantalón cargo verde oscuro talla 40 - Múltiples bolsillos - Precio $55",
  "Camiseta básica verde talla M - Algodón 100% - Precio $25",
  "Zapatillas casuales verdes talla 39 - Cuero sintético - Precio $65",
  "Camiseta manga larga verde claro talla L - Algodón orgánico - Precio $28",
  "Pantalón jean verde talla 38 - Corte recto - Precio $45",
  "Short de baño verde talla M - Secado rápido - Precio $22",
  "Zapatillas running verdes talla 41 - Amortiguación - Precio $90",
  "Camiseta básica roja talla M - Algodón 100% - Precio $25",
  "Pantalón chino rojo talla 34 - Corte regular - Precio $50",
  "Zapatillas deportivas rojas talla 42 - Running - Precio $80",
  "Pantalón jean rojo talla 36 - Corte slim - Precio $45",
  "Short deportivo rojo talla L - Secado rápido - Precio $20",
  "Zapatillas casuales rojas talla 40 - Cuero sintético - Precio $65",
  "Camiseta básica amarilla talla M - Algodón 100% - Precio $25",
  "Pantalón cargo amarillo talla 32 - Múltiples bolsillos - Precio $55",
  "Zapatillas running amarillas talla 43 - Amortiguación - Precio $90",
  "Pantalón jean amarillo talla 30 - Corte recto - Precio $45",
  "Short de baño amarillo talla M - Secado rápido - Precio $22",
  "Zapatillas deportivas amarillas talla 41 - Running - Precio $80",
  "Camiseta básica naranja talla M - Algodón 100% - Precio $25",
  "Pantalón chino naranja talla 34 - Corte regular - Precio $50",
  "Zapatillas casuales naranjas talla 42 - Cuero sintético - Precio $65",
  "Pantalón jean naranja talla 36 - Corte slim - Precio $45",
  "Short deportivo naranja talla L - Secado rápido - Precio $20",
  "Zapatillas running naranjas talla 40 - Amortiguación - Precio $90",
  "Camiseta básica morada talla M - Algodón 100% - Precio $25",
  "Pantalón cargo morado talla 32 - Múltiples bolsillos - Precio $55",
  "Zapatillas deportivas moradas talla 43 - Running - Precio $80",
  "Pantalón jean morado talla 30 - Corte recto - Precio $45",
  "Short de baño morado talla M - Secado rápido - Precio $22",
  "Zapatillas casuales moradas talla 41 - Cuero sintético - Precio $65",
  "Camiseta básica rosa talla M - Algodón 100% - Precio $25",
  "Pantalón chino rosa talla 34 - Corte regular - Precio $50",
  "Zapatillas running rosas talla 42 - Amortiguación - Precio $90",
  "Pantalón jean rosa talla 36 - Corte slim - Precio $45",
  "Short deportivo rosa talla L - Secado rápido - Precio $20",
  "Zapatillas deportivas rosas talla 40 - Running - Precio $80",
  "Camiseta básica turquesa talla M - Algodón 100% - Precio $25",
  "Pantalón cargo turquesa talla 32 - Múltiples bolsillos - Precio $55",
  "Zapatillas casuales turquesas talla 43 - Cuero sintético - Precio $65",
  "Pantalón jean turquesa talla 30 - Corte recto - Precio $45",
  "Short de baño turquesa talla M - Secado rápido - Precio $22",
  "Zapatillas running turquesas talla 41 - Amortiguación - Precio $90"
];

const QUERIES = [
  "camiseta azul talla M",
  "pantalón jean azul",
  "zapatillas running",
  "short deportivo",
  "camiseta polo",
  "pantalón chino",
  "zapatillas casuales",
  "camiseta manga larga",
  "pantalón cargo",
  "zapatillas negras"
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function getRandomDocuments(count) {
  const pool = [...DOCUMENTS_POOL];
  const selected = [];
  while (selected.length < count && pool.length > 0) {
    selected.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  while (selected.length < count) {
    selected.push(DOCUMENTS_POOL[Math.floor(Math.random() * DOCUMENTS_POOL.length)]);
  }
  return selected;
}

async function makeRequest(requestId, numDocuments = 100) {
  const query = QUERIES[Math.floor(Math.random() * QUERIES.length)];
  const documents = getRandomDocuments(numDocuments);
  const startTime = Date.now();

  try {
    const response = await axios.post(SERVER_URL, { query, documents, top_k: 10 }, { timeout: 120000 });
    const endTime = Date.now();
    return {
      requestId, success: true,
      totalTime: endTime - startTime,
      latencyMs: response.data.latency_ms || (endTime - startTime),
      statusCode: response.status, startTime, endTime
    };
  } catch (error) {
    const endTime = Date.now();
    return {
      requestId, success: false,
      totalTime: endTime - startTime,
      latencyMs: null,
      error: error.message,
      statusCode: error.response?.status || 'N/A',
      startTime, endTime
    };
  }
}

function calcStats(times) {
  if (!times.length) return null;
  const s = [...times].sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  const p = (pct) => s[Math.min(Math.floor(s.length * pct), s.length - 1)];
  return {
    count: s.length, min: s[0], max: s[s.length - 1],
    avg: sum / s.length, p50: p(0.5), p75: p(0.75),
    p90: p(0.9), p95: p(0.95), p99: p(0.99)
  };
}

function asciiHistogram(times, title, width = 40) {
  if (!times.length) return;
  const s = [...times].sort((a, b) => a - b);
  const min = s[0], max = s[s.length - 1];
  const range = max - min || 1;
  const BUCKETS = 15;
  const bucketSize = range / BUCKETS;
  const hist = new Array(BUCKETS).fill(0);
  s.forEach(t => hist[Math.min(Math.floor((t - min) / bucketSize), BUCKETS - 1)]++);
  const peak = Math.max(...hist);

  console.log(`\n  ${title}`);
  console.log('  ' + '─'.repeat(60));
  hist.forEach((count, i) => {
    const lo = (min + i * bucketSize).toFixed(0).padStart(6);
    const hi = (min + (i + 1) * bucketSize).toFixed(0).padStart(6);
    const bar = '█'.repeat(Math.round((count / peak) * width));
    const pct = ((count / s.length) * 100).toFixed(1).padStart(5);
    console.log(`  ${lo}-${hi}ms │${bar.padEnd(width)} ${count} (${pct}%)`);
  });
}

function asciiTimeline(results, title) {
  // Show throughput over time in 1s buckets
  if (!results.length) return;
  const start = Math.min(...results.map(r => r.startTime));
  const end = Math.max(...results.map(r => r.endTime));
  const durationS = Math.ceil((end - start) / 1000);
  if (durationS <= 0) return;

  const buckets = new Array(durationS).fill(0);
  results.filter(r => r.success).forEach(r => {
    const bucket = Math.min(Math.floor((r.endTime - start) / 1000), durationS - 1);
    buckets[bucket]++;
  });
  const peak = Math.max(...buckets, 1);
  const W = 36;

  console.log(`\n  ${title} (requests completed per second)`);
  console.log('  ' + '─'.repeat(55));
  buckets.forEach((count, i) => {
    const bar = '█'.repeat(Math.round((count / peak) * W));
    console.log(`  ${String(i + 1).padStart(3)}s │${bar.padEnd(W)} ${count}`);
  });
}

function displayResults(label, results, totalMs) {
  const ok = results.filter(r => r.success);
  const fail = results.filter(r => !r.success);
  const times = ok.map(r => r.totalTime);
  const lats = ok.map(r => r.latencyMs).filter(Boolean);

  console.log('\n' + '═'.repeat(72));
  console.log(`  ${label}`);
  console.log('─'.repeat(72));
  console.log(`  Duration  : ${(totalMs / 1000).toFixed(2)}s`);
  console.log(`  Throughput: ${(results.length / (totalMs / 1000)).toFixed(2)} req/s`);
  console.log(`  Success   : ${ok.length}/${results.length} (${(ok.length / results.length * 100).toFixed(1)}%)`);
  console.log(`  Failures  : ${fail.length}`);

  const ts = calcStats(times);
  if (ts) {
    console.log(`\n  Round-trip latency (ms)`);
    console.log(`    avg ${ts.avg.toFixed(0).padStart(6)}  min ${ts.min.toFixed(0).padStart(6)}  max ${ts.max.toFixed(0).padStart(6)}`);
    console.log(`    p50 ${ts.p50.toFixed(0).padStart(6)}  p75 ${ts.p75.toFixed(0).padStart(6)}  p90 ${ts.p90.toFixed(0).padStart(6)}  p95 ${ts.p95.toFixed(0).padStart(6)}  p99 ${ts.p99.toFixed(0).padStart(6)}`);
    asciiHistogram(times, 'Latency distribution (round-trip)');
  }

  const ls = calcStats(lats);
  if (ls) {
    console.log(`\n  Server-side processing latency (ms)`);
    console.log(`    avg ${ls.avg.toFixed(0).padStart(6)}  p50 ${ls.p50.toFixed(0).padStart(6)}  p95 ${ls.p95.toFixed(0).padStart(6)}  p99 ${ls.p99.toFixed(0).padStart(6)}`);
  }

  if (fail.length) {
    const errs = {};
    fail.forEach(f => { const k = f.error || `HTTP ${f.statusCode}`; errs[k] = (errs[k] || 0) + 1; });
    console.log(`\n  Errors:`);
    Object.entries(errs).forEach(([e, c]) => console.log(`    ${e}: ${c}`));
  }

  asciiTimeline(results, 'Completions over time');

  return { label, totalMs, stats: ts, serverStats: ls, ok: ok.length, fail: fail.length, total: results.length };
}

// ─── TEST SCENARIOS ───────────────────────────────────────────────────────────

async function runScenario(label, fn) {
  console.log(`\n  ▶ ${label}`);
  const start = Date.now();
  const results = await fn();
  const elapsed = Date.now() - start;
  return displayResults(label, results, elapsed);
}

async function parallel(n, docs = 100) {
  return Promise.all(Array.from({ length: n }, (_, i) => makeRequest(i + 1, docs)));
}

async function sustained(n, durationMs) {
  const interval = durationMs / n;
  return Promise.all(
    Array.from({ length: n }, (_, i) =>
      new Promise(res => setTimeout(() => res(makeRequest(i + 1)), i * interval))
    )
  );
}

async function bursts(burstSize, numBursts, intervalMs) {
  const all = [];
  for (let b = 0; b < numBursts; b++) {
    console.log(`    Burst ${b + 1}/${numBursts}…`);
    all.push(...await parallel(burstSize));
    if (b < numBursts - 1) await new Promise(r => setTimeout(r, intervalMs));
  }
  return all;
}

async function incremental(stages, pauseMs) {
  const all = [];
  for (const n of stages) {
    console.log(`    Stage ${n} requests…`);
    all.push(...await parallel(n));
    if (stages.indexOf(n) < stages.length - 1) await new Promise(r => setTimeout(r, pauseMs));
  }
  return all;
}

async function docSizes(sizes, reqPerSize) {
  const all = [];
  for (const size of sizes) {
    console.log(`    ${size} docs/request…`);
    all.push(...await parallel(reqPerSize, size));
  }
  return all;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function runAllTests() {
  console.log('═'.repeat(72));
  console.log('  LOAD TEST SUITE — RexReranker');
  console.log('═'.repeat(72));
  console.log(`  Server : ${SERVER_URL}`);
  console.log(`  Start  : ${new Date().toISOString()}`);
  console.log('═'.repeat(72));

  const pause = (ms) => new Promise(r => setTimeout(r, ms));
  const scenarioResults = [];

  try {
    scenarioResults.push(await runScenario('Low load — 10 parallel requests',       () => parallel(10)));
    await pause(5000);
    scenarioResults.push(await runScenario('Medium load — 50 parallel requests',    () => parallel(50)));
    await pause(5000);
    scenarioResults.push(await runScenario('High load — 100 parallel requests',     () => parallel(100)));
    await pause(5000);
    scenarioResults.push(await runScenario('Extreme load — 200 parallel requests',  () => parallel(200)));
    await pause(5000);
    scenarioResults.push(await runScenario('Sustained — 100 req over 30s',          () => sustained(100, 30000)));
    await pause(5000);
    scenarioResults.push(await runScenario('Burst — 5 × 20 req every 5s',           () => bursts(20, 5, 5000)));
    await pause(5000);
    scenarioResults.push(await runScenario('Incremental — 10→25→50→75→100',         () => incremental([10, 25, 50, 75, 100], 10000)));
    await pause(5000);
    scenarioResults.push(await runScenario('Doc sizes — 10/50/100/200 docs × 10',   () => docSizes([10, 50, 100, 200], 10)));
  } catch (err) {
    console.error('\nError during tests:', err.message);
  }

  // ── Comparison table ──
  console.log('\n\n' + '═'.repeat(72));
  console.log('  SCENARIO COMPARISON');
  console.log('─'.repeat(72));
  console.log('  Scenario                          Avg(ms)  P95(ms)  Succ%  RPS');
  console.log('  ' + '─'.repeat(68));
  scenarioResults.forEach(s => {
    if (!s.stats) return;
    const label = s.label.slice(0, 33).padEnd(33);
    const avg = s.stats.avg.toFixed(0).padStart(7);
    const p95 = s.stats.p95.toFixed(0).padStart(7);
    const succ = (s.ok / s.total * 100).toFixed(1).padStart(5);
    const rps = (s.total / (s.totalMs / 1000)).toFixed(2).padStart(5);
    console.log(`  ${label}  ${avg}  ${p95}  ${succ}%  ${rps}`);
  });

  // ── Save results ──
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

  const output = {
    timestamp: new Date().toISOString(),
    server: SERVER_URL,
    scenarios: scenarioResults.map(s => ({
      label: s.label,
      totalMs: s.totalMs,
      total: s.total,
      ok: s.ok,
      fail: s.fail,
      successRate: parseFloat((s.ok / s.total * 100).toFixed(2)),
      rps: parseFloat((s.total / (s.totalMs / 1000)).toFixed(2)),
      stats: s.stats ? {
        avg: parseFloat(s.stats.avg.toFixed(2)),
        min: s.stats.min, max: s.stats.max,
        p50: s.stats.p50, p75: s.stats.p75,
        p90: s.stats.p90, p95: s.stats.p95, p99: s.stats.p99
      } : null,
      serverStats: s.serverStats ? {
        avg: parseFloat(s.serverStats.avg.toFixed(2)),
        p50: s.serverStats.p50, p95: s.serverStats.p95, p99: s.serverStats.p99
      } : null
    }))
  };

  const outPath = path.join(RESULTS_DIR, 'load_results.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\n  Results saved → ${outPath}`);
  console.log('\n  End: ' + new Date().toISOString());
  console.log('═'.repeat(72));

  return output;
}

if (require.main === module) {
  runAllTests().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { runAllTests };
