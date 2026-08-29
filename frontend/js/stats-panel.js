// Claudio FM — 统计面板
import { dom } from './dom.js';

const RANGES = [
  ['week', '本周'],
  ['month', '本月'],
  ['quarter', '本季度'],
  ['year', '本年'],
];

function getRangeLabel(range) {
  return RANGES.find(([value]) => value === range)?.[1] || '本月';
}

function fetchStats(range) {
  return fetch('/api/stats?range=' + encodeURIComponent(range), { cache: 'no-store' });
}

function clearStatsContent() {
  dom.statsPanel.querySelectorAll('.stats-report, .panel-empty').forEach(el => el.remove());
}

function renderEmpty() {
  clearStatsContent();
  const empty = document.createElement('div');
  empty.className = 'panel-empty';
  empty.textContent = '暂无报告';
  const genBtn = dom.statsPanel.querySelector('.stats-gen-btn');
  if (genBtn) {
    dom.statsPanel.insertBefore(empty, genBtn);
  } else {
    dom.statsPanel.appendChild(empty);
  }
}

function renderReportContent(data) {
  clearStatsContent();

  const card = document.createElement('div');
  card.className = 'stats-report';

  const insight = document.createElement('div');
  insight.className = 'stats-insight';
  insight.textContent = data.insight;
  card.appendChild(insight);

  if (data.stat) {
    const detail = document.createElement('div');
    detail.className = 'stats-detail';
    const stat = data.stat;
    const lines = [
      `总播放: ${stat.totalPlays} 次`,
      `最爱歌手: ${(stat.topArtists || []).map(a => a.name).join(', ') || '—'}`,
      `新发现: ${(stat.newDiscoveries || []).map(d => d.name).join(', ') || '—'}`,
    ];
    detail.textContent = lines.join('  ·  ');
    card.appendChild(detail);
  }

  const genBtn = dom.statsPanel.querySelector('.stats-gen-btn');
  if (genBtn) {
    dom.statsPanel.insertBefore(card, genBtn);
  } else {
    dom.statsPanel.appendChild(card);
  }
}

export async function renderStatsPanel() {
  dom.statsPanel.innerHTML = '<div class="panel-empty">Loading...</div>';
  try {
    let selectedRange = 'month';
    const res = await fetchStats(selectedRange);
    const data = await res.json();

    dom.statsPanel.innerHTML = '';

    const sel = document.createElement('select');
    sel.className = 'stats-range-select';
    for (const [value, label] of RANGES) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      opt.selected = value === selectedRange;
      sel.appendChild(opt);
    }
    dom.statsPanel.appendChild(sel);

    if (data.insight) {
      renderReportContent(data);
    } else {
      renderEmpty();
    }

    const btn = document.createElement('button');
    btn.className = 'stats-gen-btn';
    btn.textContent = `生成${getRangeLabel(selectedRange)}报告`;
    const generateSelectedReport = async () => {
      btn.textContent = '生成中…';
      btn.disabled = true;
      try {
        const r = await fetch('/api/stats/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ range: selectedRange }),
        });
        if (!r.ok) throw new Error('生成失败');
        const d = await r.json();
        renderReportContent(d);
      } catch {
        renderEmpty();
      } finally {
        btn.textContent = `生成${getRangeLabel(selectedRange)}报告`;
        btn.disabled = false;
      }
    };
    btn.addEventListener('click', generateSelectedReport);
    dom.statsPanel.appendChild(btn);

    sel.addEventListener('change', async () => {
      selectedRange = sel.value;
      btn.textContent = `生成${getRangeLabel(selectedRange)}报告`;
      const r = await fetchStats(selectedRange);
      const d = await r.json();
      if (d.insight) {
        renderReportContent(d);
      } else {
        renderEmpty();
      }
    });
  } catch {
    dom.statsPanel.innerHTML = '<div class="panel-empty">加载失败</div>';
  }
}
