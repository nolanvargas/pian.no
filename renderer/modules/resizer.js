// ── Draggable panel resizer ───────────────────────────────────────────────────

import { CFG } from './config.js';

const MIN_STAFF    = 60;
const MIN_PRACTICE = 44;
const minPiano     = () => Math.ceil(CFG.keyH) + 4;

// Recalculates and applies practice-panel and piano-container heights.
// Staff (flex:1) fills whatever remains automatically — its height is not set here.
// Safe to call any time: on load, on window resize, when practice content toggles.
export function syncHeights() {
  const container  = document.getElementById('resize-container');
  const practiceEl = document.getElementById('practice-panel');
  const pianoEl    = document.getElementById('piano-container');
  const handles    = document.querySelectorAll('.resize-handle');

  const total   = container.getBoundingClientRect().height;
  const handleH = handles.length * 4;
  const pianoH  = minPiano();
  const rest    = total - handleH - pianoH;

  const contentHidden = document.getElementById('practice-content').hasAttribute('hidden');
  const practiceH = contentHidden
    ? MIN_PRACTICE
    : Math.max(MIN_PRACTICE, Math.round(rest * 0.4));

  practiceEl.style.height = practiceH + 'px';
  pianoEl.style.height    = pianoH + 'px';
}

export function initResizer() {
  const staffEl    = document.getElementById('staff-section');
  const practiceEl = document.getElementById('practice-panel');
  const handles    = document.querySelectorAll('.resize-handle');

  syncHeights();

  handles.forEach(handle => {
    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      const above = handle.previousElementSibling;
      const below = handle.nextElementSibling;
      const minAbove = above === staffEl    ? MIN_STAFF    : MIN_PRACTICE;
      const minBelow = below === practiceEl ? MIN_PRACTICE : minPiano();
      const startY     = e.clientY;
      const startAbove = above.getBoundingClientRect().height;
      const startBelow = below.getBoundingClientRect().height;
      const total      = startAbove + startBelow;

      handle.classList.add('dragging');
      document.body.style.cursor     = 'ns-resize';
      document.body.style.userSelect = 'none';

      function onMove(e) {
        const delta = e.clientY - startY;
        let a = startAbove + delta;
        let b = startBelow - delta;
        if (a < minAbove) { a = minAbove; b = total - a; }
        if (b < minBelow) { b = minBelow; a = total - b; }
        above.style.height = a + 'px';
        below.style.height = b + 'px';
      }

      function onUp() {
        handle.classList.remove('dragging');
        document.body.style.cursor     = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
}
