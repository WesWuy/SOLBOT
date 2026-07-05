// SOLBOT dashboard: reads committed JSON from /data.
// GitHub Pages serves only /docs, so production reads via raw.githubusercontent;
// the relative fallback covers local dev (serving the repo root).
const DATA_BASES = [
  'https://raw.githubusercontent.com/WesWuy/SOLBOT/main/data',
  '../data',
];

const COLORS = [
  '#58a6ff', '#3fb950', '#f85149', '#d29922', '#bc8cff', '#39c5cf',
  '#ff7b72', '#7ee787', '#ffa657', '#79c0ff', '#d2a8ff', '#8b949e',
];

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

function fmt(n, digits = 4) {
  return n == null ? '—' : n.toFixed(digits);
}

function pctCell(v, digits = 2) {
  if (v == null) return '<td>—</td>';
  const cls = v >= 0 ? 'pos' : 'neg';
  return `<td class="${cls}">${v >= 0 ? '+' : ''}${v.toFixed(digits)}%</td>`;
}

function renderLeaderboard(summary) {
  const tbody = document.querySelector('#leaderboard tbody');
  tbody.innerHTML = summary.strategies
    .map((s) => {
      const cls = [
        s.statisticallyValid || s.isBenchmark ? '' : 'invalid',
        s.isBenchmark ? 'benchmark' : '',
      ].join(' ');
      return `<tr class="${cls}">
        <td>${s.name}</td>
        <td>${fmt(s.equitySol)}</td>
        ${s.id === 'hodl' ? '<td>—</td>' : pctCell(s.vsHodlPct)}
        <td>${s.closedTrades}</td>
        <td>${s.winRatePct == null ? '—' : s.winRatePct.toFixed(0) + '%'}</td>
        <td>${s.maxDrawdownPct.toFixed(1)}%</td>
        <td>${s.failedOrders}</td>
      </tr>`;
    })
    .join('');
}

async function renderChart(summary) {
  const datasets = [];
  for (let i = 0; i < summary.strategies.length; i++) {
    const s = summary.strategies[i];
    try {
      const series = await fetchJson(`equity/${s.id}.json`);
      datasets.push({
        label: s.name,
        data: series.map((p) => ({ x: p.ts, y: p.equitySol })),
        borderColor: COLORS[i % COLORS.length],
        borderWidth: s.id === 'hodl' ? 2.5 : 1.5,
        borderDash: s.id === 'hodl' ? [6, 3] : undefined,
        pointRadius: 0,
        tension: 0.1,
      });
    } catch {
      /* strategy may not have equity yet */
    }
  }
  new Chart(document.getElementById('equityChart'), {
    type: 'line',
    data: { datasets },
    options: {
      animation: false,
      parsing: false,
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
      plugins: { legend: { labels: { color: '#e6edf3' } } },
    },
  });
}

async function main() {
  const status = document.getElementById('status');
  try {
    const summary = await fetchJson('summary.json');
    const age = Math.round((Date.now() - summary.generatedAt) / 60000);
    const started = summary.startedAt
      ? new Date(summary.startedAt).toISOString().slice(0, 10)
      : '—';
    status.textContent = `last run: ${new Date(summary.generatedAt).toUTCString()} (${age} min ago) · SOL/USDC ${summary.price.toFixed(2)} · collecting since ${started}`;
    renderLeaderboard(summary);
    await renderChart(summary);
  } catch (err) {
    status.textContent = `no data yet (${err.message}) — waiting for the first tick to commit /data`;
  }
}

main();
