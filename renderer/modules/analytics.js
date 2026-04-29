// ── Analytics charts and sparklines ──────────────────────────────────────────

import { practice } from './practiceCore.js';

export function renderAnalytics() {
  const el = document.getElementById('analytics-section');
  if (!el) return;
  const isScaleRun = practice.viewingScaleMode;
  const history    = practice.completionHistory.filter(h =>
    isScaleRun ? h.mode === 'scalerun' : (h.mode === 'chord' || !h.mode)
  );
  if (history.length === 0) {
    el.innerHTML = '<div class="analytics-empty">Complete a round to see stats</div>';
    return;
  }
  if (isScaleRun) {
    el.innerHTML = buildScaleChart(history);
  } else {
    el.innerHTML = buildTimeChart(history);
    const selectedNotes = parseInt(document.getElementById('count-select')?.value);
    initTimeChartInteraction(isNaN(selectedNotes) ? null : selectedNotes);
  }
}

export function computeStreak(history) {
  const days = new Set(history.filter(h => h.ts).map(h => {
    const d = new Date(h.ts);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }));
  let d      = (() => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime(); })();
  let streak = 0;
  while (days.has(d)) { streak++; d -= 86400000; }
  return streak;
}

function buildScaleChart(data) {
  const W = 560, H = 140, ML = 38, MT = 10, MR = 12, MB = 28;
  const cW = W - ML - MR, cH = H - MT - MB;
  const n    = data.length;
  const yMax = Math.max(...data.map(h => h.time)) * 1.18;

  const px = i => n === 1 ? ML + cW / 2 : ML + (i / (n - 1)) * cW;
  const py = y => MT + (1 - y / yMax) * cH;

  const yTicks = 4;
  let yTickLines = '', yTickLabels = '';
  for (let i = 0; i <= yTicks; i++) {
    const v = (yMax / yTicks) * i;
    const y = py(v).toFixed(1);
    yTickLines  += `<line class="tc-axis" x1="${ML}" y1="${y}" x2="${ML + cW}" y2="${y}" stroke-dasharray="${i === 0 ? 'none' : '3 3'}" stroke-opacity="${i === 0 ? 1 : 0.4}"/>`;
    yTickLabels += `<text class="tc-tick-label" x="${ML - 4}" y="${(parseFloat(y) + 3).toFixed(1)}" text-anchor="end">${v < 60 ? v.toFixed(v < 10 ? 1 : 0) + 's' : (v / 60).toFixed(1) + 'm'}</text>`;
  }

  const xTickCount = Math.min(n, 6);
  let xTickLabels = '';
  for (let i = 0; i < xTickCount; i++) {
    const idx = xTickCount === 1 ? 0 : Math.round(i * (n - 1) / (xTickCount - 1));
    xTickLabels += `<text class="tc-tick-label" x="${px(idx).toFixed(1)}" y="${H - 6}" text-anchor="middle">${idx + 1}</text>`;
  }

  const color = '#22c55e';
  const d     = data.map((h, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(h.time).toFixed(1)}`).join('');
  const dots  = data.map((h, i) =>
    `<circle cx="${px(i).toFixed(1)}" cy="${py(h.time).toFixed(1)}" r="2.5" fill="${color}" opacity="0.85"/>`
  ).join('');

  return `<div id="time-chart-container">
    <div class="time-chart-title">Time per attempt <span class="time-chart-xhint">(x = attempt)</span></div>
    <svg class="time-chart-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      ${yTickLines}
      <line class="tc-axis" x1="${ML}" y1="${MT}" x2="${ML}" y2="${MT + cH}"/>
      <line class="tc-axis" x1="${ML}" y1="${MT + cH}" x2="${ML + cW}" y2="${MT + cH}"/>
      ${yTickLabels}${xTickLabels}
      <path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.8"/>
      ${dots}
    </svg>
  </div>`;
}

function buildTimeChart(data) {
  const NOTE_COLORS = { 2: '#4ade80', 3: '#60a5fa', 4: '#f472b6', 5: '#fb923c', 6: '#a78bfa', 7: '#34d399', 8: '#fbbf24' };
  const W = 560, H = 140, ML = 38, MT = 10, MR = 12, MB = 28;
  const cW = W - ML - MR, cH = H - MT - MB;

  const groups = {};
  for (const h of data) {
    if (!h.ts) continue;
    if (!groups[h.notes]) groups[h.notes] = [];
    groups[h.notes].push(h);
  }
  for (const k of Object.keys(groups)) groups[k].sort((a, b) => a.ts - b.ts);

  const series = {};
  for (const [k, sessions] of Object.entries(groups)) {
    const pts = [];
    for (let i = 0; i < sessions.length; i += 10) {
      const bucket = sessions.slice(i, i + 10);
      pts.push({ x: pts.length, y: bucket.reduce((s, h) => s + h.time, 0) / bucket.length, partial: bucket.length < 10 });
    }
    if (pts.length > 0) series[k] = pts;
  }

  const noteKeys = Object.keys(series).map(Number).sort((a, b) => a - b);
  if (noteKeys.length === 0) return '';

  const allY = noteKeys.flatMap(k => series[k].map(p => p.y));
  const xMax = Math.max(...noteKeys.flatMap(k => series[k].map(p => p.x)));
  const yMax = Math.max(...allY) * 1.18;

  const px = x => xMax === 0 ? ML + cW / 2 : ML + (x / xMax) * cW;
  const py = y => MT + (1 - y / yMax) * cH;

  const yTicks = 4;
  let yTickLines = '', yTickLabels = '';
  for (let i = 0; i <= yTicks; i++) {
    const v = (yMax / yTicks) * i;
    const y = py(v).toFixed(1);
    yTickLines  += `<line class="tc-axis" x1="${ML}" y1="${y}" x2="${ML + cW}" y2="${y}" stroke-dasharray="${i === 0 ? 'none' : '3 3'}" stroke-opacity="${i === 0 ? 1 : 0.4}"/>`;
    yTickLabels += `<text class="tc-tick-label" x="${ML - 4}" y="${(parseFloat(y) + 3).toFixed(1)}" text-anchor="end">${v < 60 ? v.toFixed(v < 10 ? 1 : 0) + 's' : (v / 60).toFixed(1) + 'm'}</text>`;
  }

  const xTickCount = Math.min(xMax + 1, 6);
  let xTickLabels = '';
  for (let i = 0; i < xTickCount; i++) {
    const bucketIdx  = xTickCount === 1 ? 0 : Math.round(i * xMax / (xTickCount - 1));
    const sessionNum = (bucketIdx + 1) * 10;
    xTickLabels += `<text class="tc-tick-label" x="${px(bucketIdx).toFixed(1)}" y="${H - 6}" text-anchor="middle">${sessionNum}</text>`;
  }

  let paths = '', dots = '';
  for (const k of noteKeys) {
    const pts   = series[k];
    const color = NOTE_COLORS[k] || '#aaa';
    const d     = pts.map((p, i) => `${i ? 'L' : 'M'}${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join('');
    paths += `<path class="tc-line" data-notes="${k}" d="${d}" stroke="${color}" stroke-width="1.5" opacity="0.25"/>`;
    paths += `<path class="tc-hit" data-notes="${k}" d="${d}"/>`;
    for (const p of pts) {
      dots += `<circle class="tc-dot" data-notes="${k}" cx="${px(p.x).toFixed(1)}" cy="${py(p.y).toFixed(1)}" r="2.5" fill="${color}" opacity="0.25" ${p.partial ? 'stroke-dasharray="2 2"' : ''}/>`;
    }
  }

  const legend = noteKeys.map(k =>
    `<span class="tl-item" data-notes="${k}" style="color:${NOTE_COLORS[k] || '#aaa'}">
      <svg width="16" height="4" style="vertical-align:middle;margin-right:2px"><line x1="0" y1="2" x2="16" y2="2" stroke="${NOTE_COLORS[k] || '#aaa'}" stroke-width="2" stroke-linecap="round"/></svg>${k}n
    </span>`
  ).join('');

  return `<div id="time-chart-container">
    <div class="time-chart-title">Avg time per 10 sessions <span class="time-chart-xhint">(x = session count)</span></div>
    <div class="time-chart-legend">${legend}</div>
    <svg class="time-chart-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      ${yTickLines}
      <line class="tc-axis" x1="${ML}" y1="${MT}" x2="${ML}" y2="${MT + cH}"/>
      <line class="tc-axis" x1="${ML}" y1="${MT + cH}" x2="${ML + cW}" y2="${MT + cH}"/>
      ${yTickLabels}${xTickLabels}
      ${paths}${dots}
    </svg>
  </div>`;
}

function initTimeChartInteraction(selectedNotes) {
  const container = document.getElementById('time-chart-container');
  if (!container) return;

  const lines = container.querySelectorAll('.tc-line');
  const hits  = container.querySelectorAll('.tc-hit');
  const dots  = container.querySelectorAll('.tc-dot');
  const items = container.querySelectorAll('.tl-item');

  function setHighlight(activeNotes) {
    const anyActive = activeNotes !== null;
    lines.forEach(el => {
      const match = parseInt(el.dataset.notes) === activeNotes;
      el.setAttribute('opacity', anyActive ? (match ? '1' : '0.12') : '0.25');
      el.setAttribute('stroke-width', match ? '2.5' : '1.5');
    });
    dots.forEach(el => {
      const match = parseInt(el.dataset.notes) === activeNotes;
      el.setAttribute('opacity', anyActive ? (match ? '1' : '0.06') : '0.25');
    });
    items.forEach(el => {
      el.classList.toggle('tl-active', anyActive ? parseInt(el.dataset.notes) === activeNotes : false);
    });
  }

  setHighlight(selectedNotes);

  let hovered = null;
  hits.forEach(hit => {
    const k = parseInt(hit.dataset.notes);
    hit.addEventListener('mouseenter', () => { hovered = k; setHighlight(k); });
    hit.addEventListener('mouseleave', () => {
      hovered = null;
      const sel = parseInt(document.getElementById('count-select')?.value);
      setHighlight(isNaN(sel) ? null : sel);
    });
  });

  const countSel = document.getElementById('count-select');
  if (countSel) {
    countSel._tcHandler = () => { if (hovered === null) setHighlight(parseInt(countSel.value)); };
    countSel.addEventListener('change', countSel._tcHandler);
  }
}

export function buildSparklines(data) {
  const W = 600, H = 66, ML = 34, MT = 8, MR = 8, MB = 18;
  const cW = W - ML - MR, cH = H - MT - MB;
  const n = data.length;

  const accVals  = data.map(h => h.attempts > 0 ? h.correct / h.attempts : 1);
  const tpnVals  = data.map(h => h.time / Math.max(h.notes, 1));
  const tpnMin   = Math.min(...tpnVals), tpnMax = Math.max(...tpnVals);
  const tpnRange = tpnMax - tpnMin || 0.1;

  const xOf = i => ML + (n === 1 ? cW / 2 : (i / (n - 1)) * cW);
  const yA  = v => MT + (1 - v) * cH;
  const yT  = v => MT + (1 - (v - tpnMin) / tpnRange) * cH;

  const aPath = data.map((_, i) => `${i ? 'L' : 'M'}${xOf(i).toFixed(1)},${yA(accVals[i]).toFixed(1)}`).join('');
  const tPath = data.map((_, i) => `${i ? 'L' : 'M'}${xOf(i).toFixed(1)},${yT(tpnVals[i]).toFixed(1)}`).join('');
  const aArea = `${aPath} L${xOf(n - 1).toFixed(1)},${(MT + cH).toFixed(1)} L${xOf(0).toFixed(1)},${(MT + cH).toFixed(1)} Z`;

  const y50      = (MT + 0.5 * cH).toFixed(1);
  const labelIdxs = n <= 6 ? data.map((_, i) => i) : [0, Math.floor((n - 1) / 3), Math.floor(2 * (n - 1) / 3), n - 1];
  const xLbls    = labelIdxs.map(i =>
    `<text x="${xOf(i).toFixed(1)}" y="${H - 4}" text-anchor="middle" font-size="8" fill="#454b50" font-family="Space Grotesk,sans-serif">${i + 1}</text>`
  ).join('');

  return `<svg class="analytics-chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#22c55e" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#22c55e" stop-opacity="0"/>
    </linearGradient></defs>
    <line x1="${ML}" y1="${MT}" x2="${ML}" y2="${MT + cH}" stroke="#3c4044" stroke-width="1"/>
    <line x1="${ML}" y1="${MT + cH}" x2="${W - MR}" y2="${MT + cH}" stroke="#3c4044" stroke-width="1"/>
    <line x1="${ML}" y1="${y50}" x2="${W - MR}" y2="${y50}" stroke="#3c4044" stroke-width="0.5" stroke-dasharray="3 3"/>
    <text x="${ML - 4}" y="${MT + 5}" text-anchor="end" font-size="8" fill="#454b50" font-family="Space Grotesk,sans-serif">100%</text>
    <text x="${ML - 4}" y="${(parseFloat(y50) + 4).toFixed(1)}" text-anchor="end" font-size="8" fill="#454b50" font-family="Space Grotesk,sans-serif">50%</text>
    <path d="${aArea}" fill="url(#ag)"/>
    <path d="${aPath}" fill="none" stroke="#22c55e" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${tPath}" fill="none" stroke="#767c80" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="4 2"/>
    <circle cx="${xOf(n - 1).toFixed(1)}" cy="${yA(accVals[n - 1]).toFixed(1)}" r="2.5" fill="#22c55e"/>
    ${xLbls}
  </svg>`;
}
