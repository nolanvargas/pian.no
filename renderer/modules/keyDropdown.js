// ── Custom key-signature dropdown ─────────────────────────────────────────────
// Wraps the native <select id="key-select"> with a button + popup that shows
// each key as a mini treble-stave preview. The native select is kept hidden
// as the source of truth: we set its .value and dispatch 'change' so existing
// listeners (practiceFlow, applyKeyFilter, etc.) work unchanged.

import { KEY_SIGS, SHARP_STEPS_TREBLE, FLAT_STEPS_TREBLE } from './staff.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const KEY_LABEL = {
  random: 'Random',
  C: 'C major',  G: 'G major',  D: 'D major',  A: 'A major',
  E: 'E major',  B: 'B major',  'F#': 'F# major',
  F: 'F major',  Bb: 'B♭ major', Eb: 'E♭ major',
  Ab: 'A♭ major', Db: 'D♭ major',
};

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

// Mini treble-stave preview. Step→y: y = 36 - 3*step (top line=10, bottom=2).
function buildPreview(key) {
  const svg = svgEl('svg', {
    viewBox: '0 0 84 36', width: 126, height: 54, class: 'key-preview',
  });
  for (let i = 0; i < 5; i++) {
    const y = 6 + i * 6;
    svg.appendChild(svgEl('line', {
      x1: 0, x2: 84, y1: y, y2: y, stroke: '#000', 'stroke-width': 0.8,
    }));
  }
  const clef = svgEl('text', {
    x: 2, y: 27, 'font-size': 26, 'font-family': 'serif', fill: '#000',
  });
  clef.textContent = '𝄞';
  svg.appendChild(clef);

  const sig = KEY_SIGS[key];
  if (sig) {
    const steps  = sig.type === '#' ? SHARP_STEPS_TREBLE : FLAT_STEPS_TREBLE;
    const symbol = sig.type === '#' ? '♯' : '♭';
    for (let i = 0; i < sig.count; i++) {
      const y = 36 - 3 * steps[i];
      const t = svgEl('text', {
        x: 22 + i * 8, y: y + 5,
        'font-size': 14, 'font-family': 'serif',
        'text-anchor': 'middle', fill: '#000',
      });
      t.textContent = symbol;
      svg.appendChild(t);
    }
  }
  return svg;
}

export function initKeyDropdown() {
  const host   = document.querySelector('[data-keyselect-host]');
  const select = document.getElementById('key-select');
  if (!host || !select) return;

  select.classList.add('key-select-hidden');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'key-dropdown-btn';
  btn.title = 'Key signature';
  host.appendChild(btn);

  const popup = document.createElement('div');
  popup.className = 'key-dropdown-popup';
  popup.hidden = true;
  document.body.appendChild(popup);

  const values = [...select.options].map(o => o.value);
  for (const value of values) {
    const opt = document.createElement('button');
    opt.type = 'button';
    opt.className = 'key-dropdown-option';
    opt.dataset.value = value;
    opt.appendChild(buildPreview(value));
    const lbl = document.createElement('span');
    lbl.className = 'key-dropdown-label';
    lbl.textContent = KEY_LABEL[value] ?? value;
    opt.appendChild(lbl);
    opt.addEventListener('click', () => {
      if (select.value !== value) {
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      closePopup();
    });
    popup.appendChild(opt);
  }

  function refreshButton() {
    btn.innerHTML = '';
    btn.appendChild(buildPreview(select.value));
    const lbl = document.createElement('span');
    lbl.className = 'key-dropdown-label';
    lbl.textContent = KEY_LABEL[select.value] ?? select.value;
    btn.appendChild(lbl);
    for (const opt of popup.querySelectorAll('.key-dropdown-option')) {
      opt.classList.toggle('selected', opt.dataset.value === select.value);
    }
  }

  function openPopup() {
    const rect = btn.getBoundingClientRect();
    popup.style.top  = (rect.bottom + 4) + 'px';
    popup.style.left = rect.left + 'px';
    popup.hidden = false;
    setTimeout(() => document.addEventListener('mousedown', onDocClick), 0);
  }
  function closePopup() {
    popup.hidden = true;
    document.removeEventListener('mousedown', onDocClick);
  }
  function onDocClick(e) {
    if (host.contains(e.target) || popup.contains(e.target)) return;
    closePopup();
  }

  btn.addEventListener('click', () => {
    if (popup.hidden) openPopup(); else closePopup();
  });
  select.addEventListener('change', refreshButton);
  window.addEventListener('resize', closePopup);

  refreshButton();
}
