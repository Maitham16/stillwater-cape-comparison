const presets = document.querySelector('.presets');
const liveButton = document.querySelector('#live');
const cards = [...document.querySelectorAll('.card')];
const lightNames = {gold: 'golden hour', dawn: 'dawn', night: 'night'};
let lighting = 'gold';

// The four original pages expose the same three presets through different controls.
const controls = {
  'sol-low': {gold: '[data-light="0"]', dawn: '[data-light="1"]', night: '[data-light="2"]'},
  'sol-xhigh': {gold: '[data-light="gold"]', dawn: '[data-light="dawn"]', night: '[data-light="night"]'},
  'astra-xhigh': {gold: '[data-mode="1"]', dawn: '[data-mode="0"]', night: '[data-mode="2"]'},
};
const selectValues = {gold: '0', dawn: '1', night: '2'};

function setSceneLight(frame) {
  if (!frame?.contentDocument || frame.dataset.ready !== 'true') return;
  const doc = frame.contentDocument;
  const id = frame.dataset.scene;
  if (id === 'sol-medium') {
    const select = doc.querySelector('select');
    if (select) {
      select.value = selectValues[lighting];
      select.dispatchEvent(new Event('change', {bubbles: true}));
    }
  } else {
    doc.querySelector(controls[id][lighting])?.click();
  }
}

function waitForScene(frame, attempt = 0) {
  if (!frame.isConnected || attempt > 120) return;
  const doc = frame.contentDocument;
  if (!doc) return;
  const id = frame.dataset.scene;
  let ready = doc.body?.classList.contains('scene-ready');
  if (id === 'sol-low') ready = doc.querySelector('#opening')?.hidden;
  if (id === 'sol-xhigh') ready = doc.querySelector('#scene')?.width > 300 && doc.querySelector('#fallback')?.hidden;
  if (ready) {
    frame.dataset.ready = 'true';
    setSceneLight(frame);
  } else {
    setTimeout(() => waitForScene(frame, attempt + 1), 250);
  }
}

presets.hidden = false;
presets.addEventListener('click', event => {
  const selected = event.target.closest('button[data-mode]');
  if (!selected) return;
  lighting = selected.dataset.mode;
  for (const button of presets.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button === selected));
  }
  for (const card of cards) {
    const img = card.querySelector('img');
    const id = img.dataset.scene;
    img.src = './media/' + id + '-' + lighting + '.jpg';
    img.alt = id.replace('-', ' ').toUpperCase() + ' rendering of Stillwater Cape at ' + lightNames[lighting];
    setSceneLight(card.querySelector('iframe'));
  }
});

if (location.protocol !== 'file:') {
  liveButton.hidden = false;
  const sizing = new ResizeObserver(entries => {
    for (const entry of entries) {
      entry.target.style.setProperty('--scale', entry.contentRect.width / 960);
    }
  });
  for (const card of cards) sizing.observe(card.querySelector('.stage'));
  liveButton.addEventListener('click', () => {
    const live = liveButton.getAttribute('aria-pressed') !== 'true';
    liveButton.setAttribute('aria-pressed', String(live));
    for (const card of cards) {
      const link = card.querySelector('.scene');
      link.hidden = live;
      if (!live) {
        card.querySelector('iframe')?.remove();
        continue;
      }
      const frame = document.createElement('iframe');
      frame.src = link.href;
      frame.title = link.getAttribute('aria-label').replace('Open ', '');
      frame.dataset.scene = link.querySelector('img').dataset.scene;
      frame.allowFullscreen = true;
      frame.addEventListener('load', () => waitForScene(frame));
      card.querySelector('.stage').append(frame);
    }
  });
}
