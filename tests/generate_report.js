/**
 * generate_report.js
 * Reads accuracy_results.json and load_results.json from ./results/
 * and outputs a self-contained HTML report with Chart.js charts.
 *
 * Usage:
 *   node generate_report.js [--out path/to/report.html]
 */

const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, 'results');
const defaultOut = path.join(RESULTS_DIR, 'report.html');
const outArg = process.argv.indexOf('--out');
const OUT_PATH = outArg !== -1 ? process.argv[outArg + 1] : defaultOut;

// ─── Load data ────────────────────────────────────────────────────────────────

function loadJSON(file) {
  const p = path.join(RESULTS_DIR, file);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { console.warn(`Could not parse ${file}: ${e.message}`); return null; }
}

const acc = loadJSON('accuracy_results.json');
const load = loadJSON('load_results.json');

if (!acc && !load) {
  console.error('No result files found in ./results/. Run accuracy_tests.js and/or load_test.js first.');
  process.exit(1);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(v) { return v != null ? (v * 100).toFixed(1) : 'N/A'; }
function fmt(v, d = 1) { return v != null ? v.toFixed(d) : 'N/A'; }
function rgba(r, g, b, a = 1) { return `rgba(${r},${g},${b},${a})`; }

const PALETTE = [
  [99, 132, 255], [255, 99, 132], [54, 162, 235],
  [255, 206, 86], [75, 192, 192], [153, 102, 255],
  [255, 159, 64], [46, 204, 113], [231, 76, 60]
];
function color(i, a = 1) { const [r, g, b] = PALETTE[i % PALETTE.length]; return rgba(r, g, b, a); }

// ─── Chart data builders ──────────────────────────────────────────────────────

function accCategoryBarData() {
  if (!acc) return null;
  const cats = Object.keys(acc.categoryMetrics);
  return {
    labels: cats.map(c => c.charAt(0).toUpperCase() + c.slice(1)),
    datasets: [
      {
        label: 'MAP',
        data: cats.map(c => parseFloat((acc.categoryMetrics[c].map * 100).toFixed(1))),
        backgroundColor: color(0, 0.8)
      },
      {
        label: 'NDCG@5',
        data: cats.map(c => parseFloat((acc.categoryMetrics[c].ndcg5 * 100).toFixed(1))),
        backgroundColor: color(1, 0.8)
      },
      {
        label: 'MRR',
        data: cats.map(c => parseFloat((acc.categoryMetrics[c].mrr * 100).toFixed(1))),
        backgroundColor: color(2, 0.8)
      },
      {
        label: 'Top-1 Hit',
        data: cats.map(c => parseFloat((acc.categoryMetrics[c].top1 * 100).toFixed(1))),
        backgroundColor: color(3, 0.8)
      },
      {
        label: 'Top-3 Hit',
        data: cats.map(c => parseFloat((acc.categoryMetrics[c].top3 * 100).toFixed(1))),
        backgroundColor: color(4, 0.8)
      }
    ]
  };
}

function accRadarData() {
  if (!acc) return null;
  const m = acc.globalMetrics;
  return {
    labels: ['Top-1 Hit', 'Top-3 Hit', 'Top-5 Hit', 'P@1', 'P@3', 'P@5', 'MRR', 'NDCG@5', 'MAP'],
    datasets: [{
      label: 'Global Metrics (%)',
      data: [
        pct(m['Top-1 Hit']), pct(m['Top-3 Hit']), pct(m['Top-5 Hit']),
        pct(m['P@1']), pct(m['P@3']), pct(m['P@5']),
        pct(m['MRR']), pct(m['NDCG@5']), pct(m['MAP'])
      ].map(Number),
      fill: true,
      backgroundColor: color(0, 0.2),
      borderColor: color(0),
      pointBackgroundColor: color(0)
    }]
  };
}

function perTestBarData() {
  if (!acc || !acc.perTest) return null;
  const tests = acc.perTest;
  return {
    labels: tests.map(t => t.name.length > 20 ? t.name.slice(0, 19) + '…' : t.name),
    datasets: [
      {
        label: 'NDCG@5',
        data: tests.map(t => parseFloat((t.metrics.ndcg5 * 100).toFixed(1))),
        backgroundColor: tests.map((_, i) => color(i, 0.7))
      }
    ]
  };
}

function loadLatencyData() {
  if (!load) return null;
  const sc = load.scenarios.filter(s => s.stats);
  return {
    labels: sc.map(s => s.label.replace(/—.*/, '').trim()),
    datasets: [
      {
        label: 'Avg (ms)',
        data: sc.map(s => s.stats.avg),
        borderColor: color(0), backgroundColor: color(0, 0.15), fill: true, tension: 0.3
      },
      {
        label: 'P95 (ms)',
        data: sc.map(s => s.stats.p95),
        borderColor: color(1), backgroundColor: color(1, 0.15), fill: true, tension: 0.3
      },
      {
        label: 'P99 (ms)',
        data: sc.map(s => s.stats.p99),
        borderColor: color(2), backgroundColor: color(2, 0.0), tension: 0.3
      }
    ]
  };
}

function loadThroughputData() {
  if (!load) return null;
  const sc = load.scenarios.filter(s => s.stats);
  return {
    labels: sc.map(s => s.label.replace(/—.*/, '').trim()),
    datasets: [{
      label: 'Throughput (req/s)',
      data: sc.map(s => s.rps),
      backgroundColor: sc.map((_, i) => color(i, 0.8)),
      borderRadius: 4
    }]
  };
}

function loadSuccessData() {
  if (!load) return null;
  const sc = load.scenarios;
  return {
    labels: sc.map(s => s.label.replace(/—.*/, '').trim()),
    datasets: [
      {
        label: 'Success',
        data: sc.map(s => s.ok),
        backgroundColor: color(4, 0.8)
      },
      {
        label: 'Failed',
        data: sc.map(s => s.fail),
        backgroundColor: color(7, 0.8)
      }
    ]
  };
}

// ─── HTML template ────────────────────────────────────────────────────────────

function renderSection(title, content) {
  return `
    <section>
      <h2>${title}</h2>
      ${content}
    </section>`;
}

function renderChart(id, type, data, options = {}) {
  return `
    <div class="chart-wrap">
      <canvas id="${id}"></canvas>
    </div>
    <script>
      new Chart(document.getElementById('${id}'), {
        type: '${type}',
        data: ${JSON.stringify(data)},
        options: ${JSON.stringify(options)}
      });
    </script>`;
}

function renderTable(headers, rows) {
  const ths = headers.map(h => `<th>${h}</th>`).join('');
  const trs = rows.map(r =>
    `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`
  ).join('\n');
  return `<div class="table-wrap"><table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`;
}

function renderAccuracySection() {
  if (!acc) return renderSection('Accuracy', '<p class="empty">No accuracy results found. Run <code>npm run accuracy</code> first.</p>');

  const m = acc.globalMetrics;

  // Summary cards
  const cards = [
    ['MAP', pct(m['MAP']) + '%'],
    ['NDCG@5', pct(m['NDCG@5']) + '%'],
    ['MRR', pct(m['MRR']) + '%'],
    ['Top-1 Hit', pct(m['Top-1 Hit']) + '%'],
    ['Top-3 Hit', pct(m['Top-3 Hit']) + '%'],
    ['Top-5 Hit', pct(m['Top-5 Hit']) + '%'],
  ].map(([k, v]) => `<div class="card"><div class="card-value">${v}</div><div class="card-label">${k}</div></div>`).join('');

  // Per-test table
  const ptRows = (acc.perTest || []).map(t => [
    t.name,
    t.category,
    pct(t.metrics.precisionAt1) + '%',
    pct(t.metrics.precisionAt3) + '%',
    pct(t.metrics.ndcg5) + '%',
    pct(t.metrics.mrr) + '%',
    pct(t.metrics.ap) + '%'
  ]);

  const barOpts = {
    responsive: true,
    plugins: { legend: { position: 'top' } },
    scales: { y: { min: 0, max: 100, title: { display: true, text: 'Score (%)' } } }
  };

  return renderSection('Accuracy Evaluation', `
    <p class="meta">Run: ${acc.timestamp} &nbsp;|&nbsp; Server: <code>${acc.server}</code> &nbsp;|&nbsp; Tests: ${acc.completed}/${acc.totalTests}</p>
    <div class="cards">${cards}</div>

    <h3>Metrics by Category</h3>
    ${renderChart('catBar', 'bar', accCategoryBarData(), barOpts)}

    <h3>Global Metrics Radar</h3>
    ${renderChart('globalRadar', 'radar', accRadarData(), {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: { r: { min: 0, max: 100, ticks: { stepSize: 20 } } }
    })}

    <h3>NDCG@5 per Test</h3>
    ${renderChart('perTestBar', 'bar', perTestBarData(), {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { min: 0, max: 100, title: { display: true, text: 'NDCG@5 (%)' } } }
    })}

    <h3>Per-Test Results</h3>
    ${renderTable(
      ['Test', 'Category', 'P@1', 'P@3', 'NDCG@5', 'MRR', 'AP'],
      ptRows
    )}
  `);
}

function renderLoadSection() {
  if (!load) return renderSection('Load Test', '<p class="empty">No load results found. Run <code>npm run load</code> first.</p>');

  const scRows = load.scenarios.map(s => [
    s.label,
    s.total,
    `${s.ok} (${s.successRate}%)`,
    s.stats ? fmt(s.stats.avg, 0) + 'ms' : 'N/A',
    s.stats ? fmt(s.stats.p95, 0) + 'ms' : 'N/A',
    s.stats ? fmt(s.stats.p99, 0) + 'ms' : 'N/A',
    fmt(s.rps, 2)
  ]);

  return renderSection('Load Test', `
    <p class="meta">Run: ${load.timestamp} &nbsp;|&nbsp; Server: <code>${load.server}</code></p>

    <h3>Latency by Scenario</h3>
    ${renderChart('loadLatency', 'line', loadLatencyData(), {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: { y: { title: { display: true, text: 'Latency (ms)' } } }
    })}

    <h3>Throughput by Scenario (req/s)</h3>
    ${renderChart('loadRps', 'bar', loadThroughputData(), {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { title: { display: true, text: 'req/s' } } }
    })}

    <h3>Success vs Failure per Scenario</h3>
    ${renderChart('loadSuccess', 'bar', loadSuccessData(), {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: { x: { stacked: true }, y: { stacked: true, title: { display: true, text: 'Requests' } } }
    })}

    <h3>Scenario Summary</h3>
    ${renderTable(
      ['Scenario', 'Total', 'Success', 'Avg', 'P95', 'P99', 'RPS'],
      scRows
    )}
  `);
}

// ─── Assemble HTML ────────────────────────────────────────────────────────────

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RexReranker — Evaluation Report</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    margin: 0; padding: 0;
    background: #0f1117; color: #e2e8f0;
  }
  header {
    background: linear-gradient(135deg, #1e293b, #0f172a);
    border-bottom: 1px solid #334155;
    padding: 2rem 3rem;
  }
  header h1 { margin: 0; font-size: 1.8rem; color: #f8fafc; }
  header p  { margin: 0.4rem 0 0; color: #94a3b8; font-size: 0.95rem; }
  main { max-width: 1200px; margin: 0 auto; padding: 2rem 2rem 4rem; }
  section { margin-bottom: 3rem; }
  h2 {
    font-size: 1.3rem; color: #f1f5f9;
    border-bottom: 2px solid #334155;
    padding-bottom: 0.5rem; margin-bottom: 1.5rem;
  }
  h3 { font-size: 1rem; color: #cbd5e1; margin: 2rem 0 0.8rem; }
  p.meta { color: #64748b; font-size: 0.85rem; margin-bottom: 1.5rem; }
  p.empty { color: #64748b; font-style: italic; }
  code { background: #1e293b; padding: 0.1em 0.4em; border-radius: 3px; font-size: 0.85em; }

  .cards { display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 2rem; }
  .card {
    background: #1e293b; border: 1px solid #334155; border-radius: 10px;
    padding: 1.2rem 1.6rem; flex: 1; min-width: 130px; text-align: center;
  }
  .card-value { font-size: 1.8rem; font-weight: 700; color: #60a5fa; }
  .card-label { font-size: 0.8rem; color: #94a3b8; margin-top: 0.3rem; }

  .chart-wrap {
    background: #1e293b; border: 1px solid #334155; border-radius: 10px;
    padding: 1.5rem; margin-bottom: 1.5rem; position: relative;
    max-height: 420px;
  }
  .chart-wrap canvas { max-height: 370px; }

  .table-wrap { overflow-x: auto; margin-bottom: 1.5rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th { background: #1e293b; color: #94a3b8; padding: 0.6rem 0.8rem; text-align: left; border-bottom: 2px solid #334155; }
  td { padding: 0.55rem 0.8rem; border-bottom: 1px solid #1e293b; }
  tr:hover td { background: #1e293b; }
</style>
</head>
<body>
<header>
  <h1>RexReranker — Evaluation Report</h1>
  <p>Generated ${new Date().toISOString()} &nbsp;·&nbsp; <a href="https://huggingface.co/thebajajra/RexReranker-0.6B" style="color:#60a5fa">thebajajra/RexReranker-0.6B</a></p>
</header>
<main>
  ${renderAccuracySection()}
  ${renderLoadSection()}
</main>
</body>
</html>`;

if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
fs.writeFileSync(OUT_PATH, html);
console.log(`Report written → ${OUT_PATH}`);
