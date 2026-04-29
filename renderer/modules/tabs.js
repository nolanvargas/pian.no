// ── Tab bar: switch between Piano / Scale / Random / Tails / Settings ────────
// Per-tab control fragments live in #tab-fragments and are moved into
// #tab-strip on activation. The shared #key-select is hosted in fragments
// and dropped into the active fragment's [data-keyselect-slot] on each switch.

const VALID_TABS = ['piano', 'scale', 'random', 'tails', 'settings'];

export function initTabs() {
  const buttons   = document.querySelectorAll('.tab');
  const strip     = document.getElementById('tab-strip');
  const fragments = document.getElementById('tab-fragments');
  const keyHost   = document.querySelector('[data-keyselect-host]');

  function parkFragment(fragment) {
    const host = fragment.querySelector('[data-keyselect-host]');
    if (host) {
      const slot = document.createElement('span');
      slot.dataset.keyselectSlot = '';
      host.replaceWith(slot);
      fragments.appendChild(host);
    }
    fragments.appendChild(fragment);
  }

  function activate(name) {
    if (!VALID_TABS.includes(name)) name = 'piano';

    document.body.dataset.tab = name;
    buttons.forEach(b => b.classList.toggle('active', b.dataset.tab === name));

    const mounted = strip.querySelector('[data-tab-controls]');
    if (mounted) parkFragment(mounted);

    const fragment = fragments.querySelector(`[data-tab-controls="${name}"]`);
    if (fragment) {
      const slot = fragment.querySelector('[data-keyselect-slot]');
      if (slot) slot.replaceWith(keyHost);
      strip.appendChild(fragment);
    }

    localStorage.setItem('cfg-tab', name);
  }

  buttons.forEach(b => {
    b.addEventListener('click', () => activate(b.dataset.tab));
  });

  const saved = localStorage.getItem('cfg-tab') ?? 'piano';
  activate(saved);
}
