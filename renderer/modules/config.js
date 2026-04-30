// ── Layout config and user preferences ───────────────────────────────────────
// CFG is mutated in-place by scaleKeyboard(). config holds localStorage prefs.

import { KEY_BASE } from './constants.js';
import { setEdgeBias, practice } from './practiceCore.js';

// All tuneable display values. scaleKeyboard() updates the key dimensions at runtime.
export const CFG = {
  // Staff
  sCtr: 250, sStep: 8, staffX1: 0, staffX2: 690,
  // Note heads
  noteRx: 11, noteRy: 8.5, noteX: 366,
  // Piano keys (scaled at runtime by scaleKeyboard)
  whiteW: KEY_BASE.whiteW, blackW: KEY_BASE.blackW,
  keyH:   KEY_BASE.keyH,   blackH: KEY_BASE.blackH,
  // Practice
  practiceStep: 70, keySigX: 78, keySigSpacing: 14, keySigSizeSharp: 27, keySigSizeFlat: 38,
  // Staff signs (clefs)
  trebleX: 10, trebleYSteps: 2, trebleSize: 90,
  bassX: 11, bassYSteps: 8.5, bassSize: 72,
};

export const config = {
  showAccidentals: true,
  showFrequency:   JSON.parse(localStorage.getItem('cfg-frequency')   ?? 'false'),
  shadowOffKey:    JSON.parse(localStorage.getItem('cfg-shadow-key')  ?? 'false'),
  showRootKey:     JSON.parse(localStorage.getItem('cfg-root-key')    ?? 'true'),
};

// Callbacks wired at startup by app.js to avoid circular imports.
// onRebuildStaff  — called when accidentals toggle changes
// onApplyKeyFilter — called when shadow-key toggle changes
export function initConfig({ onRebuildStaff, onApplyKeyFilter, onApplyRootHighlight }) {
  const freqCb   = document.getElementById('cfg-frequency');
  const shadowCb = document.getElementById('cfg-shadow-key');
  const rootCb   = document.getElementById('cfg-root-key');
  const twoHCb      = document.getElementById('cfg-two-handed');
  const strictCb    = document.getElementById('cfg-scale-strict');
  const halfCb      = document.getElementById('cfg-half-notes');

  freqCb.checked   = config.showFrequency;
  shadowCb.checked = config.shadowOffKey;
  rootCb.checked   = config.showRootKey;
  twoHCb.checked   = JSON.parse(localStorage.getItem('cfg-two-handed')    ?? 'false');
  strictCb.checked = JSON.parse(localStorage.getItem('cfg-scale-strict')  ?? 'false');
  halfCb.checked   = JSON.parse(localStorage.getItem('cfg-half-notes')    ?? 'false');
  practice.scale_strict = strictCb.checked;

  freqCb.addEventListener('change', () => {
    config.showFrequency = freqCb.checked;
    localStorage.setItem('cfg-frequency', config.showFrequency);
    if (!config.showFrequency) document.getElementById('freq-label').textContent = '';
  });

  shadowCb.addEventListener('change', () => {
    config.shadowOffKey = shadowCb.checked;
    localStorage.setItem('cfg-shadow-key', config.shadowOffKey);
    onApplyKeyFilter();
  });

  rootCb.addEventListener('change', () => {
    config.showRootKey = rootCb.checked;
    localStorage.setItem('cfg-root-key', config.showRootKey);
    onApplyRootHighlight();
  });

  twoHCb.addEventListener('change', () => {
    localStorage.setItem('cfg-two-handed', twoHCb.checked);
  });

  strictCb.addEventListener('change', () => {
    practice.scale_strict = strictCb.checked;
    localStorage.setItem('cfg-scale-strict', strictCb.checked);
  });

  halfCb.addEventListener('change', () => {
    localStorage.setItem('cfg-half-notes', halfCb.checked);
  });

  const edgeSlider = document.getElementById('cfg-edge-bias');
  const edgeVal    = document.getElementById('cfg-edge-bias-val');
  edgeSlider.value = localStorage.getItem('cfg-edge-bias') ?? '0';
  edgeVal.textContent = (+edgeSlider.value).toFixed(1);
  edgeSlider.addEventListener('input', () => {
    const v = parseFloat(edgeSlider.value);
    edgeVal.textContent = v.toFixed(1);
    localStorage.setItem('cfg-edge-bias', v);
    setEdgeBias(v);
  });

  initStaffAlign();
}

const ALIGN_CYCLE = ['center', 'left', 'right'];
const ALIGN_LABEL = { center: '⊙ C', left: '← L', right: 'R →' };

function initStaffAlign() {
  const btn     = document.getElementById('staff-align-btn');
  const section = document.getElementById('staff-section');
  let current   = localStorage.getItem('cfg-staff-align') ?? 'center';

  function apply(align) {
    section.classList.remove('align-left', 'align-right');
    if (align === 'left')  section.classList.add('align-left');
    if (align === 'right') section.classList.add('align-right');
    btn.textContent = ALIGN_LABEL[align];
  }

  apply(current);

  btn.addEventListener('click', () => {
    const next = ALIGN_CYCLE[(ALIGN_CYCLE.indexOf(current) + 1) % ALIGN_CYCLE.length];
    current = next;
    localStorage.setItem('cfg-staff-align', current);
    apply(current);
  });
}
