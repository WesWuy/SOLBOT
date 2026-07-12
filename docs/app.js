// SOLBOT dashboard: reads committed JSON from /data.
// GitHub Pages serves only /docs, so production reads via raw.githubusercontent;
// the relative fallback covers local dev (serving the repo root).
const DATA_BASES = [
  'https://raw.githubusercontent.com/WesWuy/SOLBOT/main/data',
  '../data',
];

// Fixed per-entity palette (validated: lightness/chroma/contrast pass on the
// dark surface; adjacent CVD sits in the 8-12 floor band, which is acceptable
// because identity is never color-alone here — leaderboard chips act as direct
// labels, row hover isolates a curve, and the leaderboard is the table view).
// Benchmarks render as dashed neutral-toned reference lines.
const SERIES = {
  'ut-bot':    { color: '#4493f8' },
  'stoch-rsi': { color: '#c66a10' },
  'ema-cross': { color: '#a475f9' },
  donchian:    { color: '#57ab5a' },
  bollinger:   { color: '#c96198' },
  rsi:         { color: '#26a0a8' },
  macd:        { color: '#b08800' },
  vwap:        { color: '#e5534b' },
  momentum:    { color: '#2da44e' },
  grid:        { color: '#db61a2' },
  dca:         { color: '#316dca', dashed: true },
  hodl:        { color: '#e6edf3', dashed: true },
};

let chart = null;
let selectedId = null;

async function fetchJson(path) {
  let lastErr;
  for (const base of DATA_BASES) {
    try {
      const res = await fetch(`${base}/${path}`, { cache: 'no-store' });
      if (res.ok) return await res.json();
      lastErr = new Error(`${base}/${path} -> ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

const fmt = (n, d = 4) => (n == null ? '—' : n.toFixed(d));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function statusClass(level) {
  return { good: 'status-good', warn: 'status-warn', bad: 'status-bad' }[level];
}
function statusIcon(level) {
  return { good: '●', warn: '▲', bad: '✕' }[level];
}

function tile({ label, value, valueClass = '', detail = '', barPct = null }) {
  return `<div class="tile">
    <div class="label">${label}</div>
    <div class="value ${valueClass}">${value}</div>
    <div class="detail">${detail}</div>
    ${barPct == null ? '' : `<div class="bar"><div style="width:${Math.min(100, barPct).toFixed(0)}%"></div></div>`}
  </div>`;
}

function renderTiles(summary) {
  const now = Date.now();
  const dayMs = 86_400_000;

  // Gate progress
  const days = summary.startedAt ? (now - summary.startedAt) / dayMs : 0;
  const gateDays = summary.gateDays ?? 60;

  // Cadence health (effective bar interval)
  const th = summary.tickHealth ?? {};
  const gap = th.medianGapMin;
  const gapLevel = gap == null ? 'warn' : gap <= 20 ? 'good' : gap <= 45 ? 'warn' : 'bad';
  const gapText = gap == null ? 'n/a' : `${gap.toFixed(0)} min`;

  // Freshness
  const ageMin = (now - summary.generatedAt) / 60_000;
  const ageLevel = ageMin <= 30 ? 'good' : ageMin <= 90 ? 'warn' : 'bad';

  document.getElementById('tiles').innerHTML = [
    tile({
      label: 'Evaluation gate',
      value: `day ${Math.floor(days)} / ${gateDays}`,
      detail: `then +5% vs HODL margin & 30d confirmation`,
      barPct: (days / gateDays) * 100,
    }),
    tile({
      label: 'Sampling cadence (24h)',
      value: `${statusIcon(gapLevel)} ${gapText}`,
      valueClass: statusClass(gapLevel),
      detail: `median gap · ${th.samplesLast24h ?? 0}/${th.expectedSamplesPer24h ?? 96} samples — design 15 min`,
    }),
    tile({
      label: 'Last run',
      value: `${statusIcon(ageLevel)} ${ageMin.toFixed(0)} min ago`,
      valueClass: statusClass(ageLevel),
      detail: new Date(summary.generatedAt).toUTCString().replace(' GMT', 'Z'),
    }),
    tile({
      label: 'SOL/USDC',
      value: summary.price.toFixed(2),
      detail: `${summary.priceCount ?? '—'} samples collected`,
    }),
  ].join('');
}

function chipHtml(id) {
  const s = SERIES[id] ?? { color: '#8b949e' };
  return `<span class="chip ${s.dashed ? 'dashed' : ''}" style="${s.dashed ? `color:${s.color}` : `background:${s.color}`}"></span>`;
}

function renderLeaderboard(summary) {
  const minTrades = summary.minTradesForValidity ?? 30;
  const tbody = document.querySelector('#leaderboard tbody');
  tbody.innerHTML = summary.strategies
    .map((s) => {
      const invalid = !s.statisticallyValid && !s.isBenchmark;
      const warm = s.isWarmingUp
        ? `<span class="badge">warming up ${summary.priceCount}/${s.warmupTicks}</span>`
        : '';
      const bench = s.isBenchmark ? `<span class="bench"> (benchmark)</span>` : '';
      const vsHodl =
        s.id === 'hodl' || s.vsHodlPct == null
          ? '<td>—</td>'
          : `<td class="${s.vsHodlPct >= 0 ? 'pos' : 'neg'}">${s.vsHodlPct >= 0 ? '+' : ''}${s.vsHodlPct.toFixed(2)}%</td>`;
      return `<tr data-id="${s.id}" class="${invalid ? 'invalid' : ''}">
        <td>${chipHtml(s.id)}${esc(s.name)}${bench}${warm}</td>
        <td>${fmt(s.equitySol)}</td>
        ${vsHodl}
        <td>${s.closedTrades}/${minTrades}</td>
        <td>${s.winRatePct == null ? '—' : s.winRatePct.toFixed(0) + '%'}</td>
        <td>${s.maxDrawdownPct.toFixed(1)}%</td>
        <td>${s.failedOrders}</td>
      </tr>`;
    })
    .join('');

  for (const row of tbody.querySelectorAll('tr')) {
    row.addEventListener('mouseenter', () => highlight(row.dataset.id));
    row.addEventListener('mouseleave', () => highlight(selectedId));
    row.addEventListener('click', () => selectStrategy(row.dataset.id, summary));
  }
}

function highlight(id) {
  if (!chart) return;
  for (const ds of chart.data.datasets) {
    const base = SERIES[ds.strategyId]?.color ?? '#8b949e';
    if (!id) {
      ds.borderColor = base;
      ds.borderWidth = ds.strategyId === 'hodl' ? 2.5 : 1.5;
    } else if (ds.strategyId === id) {
      ds.borderColor = base;
      ds.borderWidth = 3;
    } else {
      ds.borderColor = base + '26'; // ~15% alpha
      ds.borderWidth = 1;
    }
  }
  chart.update('none');
}

async function selectStrategy(id, summary) {
  selectedId = selectedId === id ? null : id;
  document
    .querySelectorAll('#leaderboard tbody tr')
    .forEach((r) => r.classList.toggle('selected', r.dataset.id === selectedId));
  highlight(selectedId);

  const panel = document.getElementById('tradePanel');
  if (!selectedId) {
    panel.classList.remove('open');
    return;
  }
  const meta = summary.strategies.find((s) => s.id === selectedId);
  document.getElementById('tradeTitle').textContent = `Trades — ${meta?.name ?? selectedId}`;
  const tbody = document.querySelector('#tradeLog tbody');
  tbody.innerHTML = '<tr><td colspan="6">loading…</td></tr>';
  panel.classList.add('open');
  try {
    const trades = await fetchJson(`trades/${selectedId}.json`);
    const recent = trades.slice(-30).reverse();
    tbody.innerHTML = recent
      .map((t) => {
        const time = new Date(t.ts).toISOString().slice(0, 16).replace('T', ' ');
        if (t.failed) {
          return `<tr><td>${time}</td><td class="fail">✕ ${t.side}</td><td class="fail" colspan="3">order failed (8% failure model)</td><td class="reason" style="text-align:left">${esc(t.reason)}</td></tr>`;
        }
        return `<tr>
          <td>${time}</td><td>${t.side}</td><td>${fmt(t.fillPrice, 2)}</td>
          <td>${fmt(t.solDelta, 4)}</td><td>${fmt(t.usdcDelta, 2)}</td>
          <td class="reason" style="text-align:left">${esc(t.reason)}</td>
        </tr>`;
      })
      .join('');
    document.getElementById('tradeNote').textContent =
      `${recent.length} most recent of ${trades.length} logged orders (incl. failed). Fees & slippage included in deltas.`;
  } catch {
    tbody.innerHTML = '<tr><td colspan="6">no trades yet</td></tr>';
    document.getElementById('tradeNote').textContent = '';
  }
}

async function renderChart(summary) {
  const datasets = [];
  for (const s of summary.strategies) {
    try {
      const series = await fetchJson(`equity/${s.id}.json`);
      const spec = SERIES[s.id] ?? { color: '#8b949e' };
      datasets.push({
        label: s.name,
        strategyId: s.id,
        data: series.map((p) => ({ x: p.ts, y: p.equitySol })),
        borderColor: spec.color,
        borderWidth: s.id === 'hodl' ? 2.5 : 1.5,
        borderDash: spec.dashed ? [6, 3] : undefined,
        pointRadius: 0,
        pointHitRadius: 8,
        tension: 0.1,
      });
    } catch {
      /* strategy may not have equity yet */
    }
  }
  chart = new Chart(document.getElementById('equityChart'), {
    type: 'line',
    data: { datasets },
    options: {
      animation: false,
      parsing: false,
      interaction: { mode: 'nearest', intersect: false },
      scales: {
        x: {
          type: 'linear',
          ticks: {
            color: '#8b949e',
            maxTicksLimit: 8,
            callback: (v) => new Date(v).toISOString().slice(5, 16).replace('T', ' '),
          },
          grid: { color: '#21262d' },
        },
        y: {
          title: { display: true, text: 'Equity (SOL)', color: '#8b949e' },
          ticks: { color: '#8b949e' },
          grid: { color: '#21262d' },
        },
      },
      plugins: {
        legend: { display: false }, // the leaderboard is the legend (chips + names)
        tooltip: {
          callbacks: {
            title: (items) => new Date(items[0].parsed.x).toUTCString().replace(' GMT', 'Z'),
            label: (item) => `${item.dataset.label}: ${item.parsed.y.toFixed(4)} SOL`,
          },
        },
      },
    },
  });
}

async function main() {
  const status = document.getElementById('status');
  try {
    const summary = await fetchJson('summary.json');
    status.textContent = `collecting since ${summary.startedAt ? new Date(summary.startedAt).toISOString().slice(0, 10) : '—'} · experiment restarted 2026-07-12 (see archive/ for week-1 data)`;
    renderTiles(summary);
    renderLeaderboard(summary);
    await renderChart(summary);
  } catch (err) {
    status.textContent = `no data yet (${err.message}) — waiting for the first tick to commit /data`;
  }
}

main();
