import { MENU, formatPrice } from './data/menu.js';

const $ = (sel, root = document) => root.querySelector(sel);
const DESKTOP = matchMedia('(min-width: 761px)');

const CHILLI = '<path d="M12 3c0 1.5 1 2.5 2.5 2.5" /><path d="M14.5 5.5c-3 0-4.5 2-5 5.5-.6 4-2.4 7-6.5 9.5 6 .5 11-2 12.7-7.4.9-2.9.3-5.7-1.2-7.6Z" />';
const spiceLabel = ['Not spicy', 'Mild', 'Medium', 'Hot'];
const madeWith = (d) => d.meat ?? 'Vegetarian';

function el(tag, attrs = {}, html = '') {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (html) n.innerHTML = html;
  return n;
}
// Menu copy is our own data, but escape anyway so nothing in it can ever become markup.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createUI({ tables, onChoose, onHover, onOpenMenu, onPreview, onBack, onOrder, onRestart, setInset }) {
  const html = document.documentElement;
  const status = $('[data-status]');
  const statusKicker = $('[data-status-kicker]');
  const statusText = $('[data-status-text]');
  const steps = $('[data-steps]');
  const actions = $('[data-status-actions]');
  const menu = $('[data-menu]');
  const listView = $('[data-list-view]');
  const dishView = $('[data-dish-view]');
  const bill = $('[data-bill]');
  const restart = $('[data-restart]');
  const tagsLayer = $('[data-tags]');
  const free = tables.filter((t) => !t.occupied);
  let state = 'story';
  let lastDishId = null;
  let returnFocus = null;
  const bag = [];

  // ---------- table choice (accessible list + floating tags) ----------
  const list = $('[data-table-list]');
  const tableBtns = new Map();
  for (const t of free) {
    const li = el('li');
    const b = el('button', { type: 'button', class: 'table-btn' }, `<strong>Table ${t.id}</strong><span>${esc(t.label)} · 2 seats</span>`);
    b.addEventListener('click', () => onChoose(t.id));
    b.addEventListener('pointerenter', () => onHover(t.id));
    b.addEventListener('pointerleave', () => onHover(null));
    li.append(b);
    list.append(li);
    tableBtns.set(t.id, b);
  }
  const tags = new Map();
  for (const t of free) {
    const b = el('button', { type: 'button', class: 'tag', tabindex: '-1', 'data-off': '' }, `Table ${t.id}`);
    b.addEventListener('click', () => onChoose(t.id));
    b.addEventListener('pointerenter', () => onHover(t.id));
    b.addEventListener('pointerleave', () => onHover(null));
    tagsLayer.append(b);
    tags.set(t.id, b);
  }

  // ---------- menu list ----------
  const menuList = $('[data-menu-list]');
  for (const sec of MENU) {
    const s = el('section', { class: 'menu-section' });
    s.append(el('h3', {}, `${esc(sec.section)} <small>${esc(sec.note ?? '')}</small>`));
    const ul = el('ul', { role: 'list' });
    for (const d of sec.dishes) {
      const li = el('li');
      const b = el(
        'button',
        { type: 'button', class: 'dish-row', 'data-dish': d.id },
        `<span class="dish-row-name">${esc(d.name)}</span>` +
          `<span class="dish-row-price">${formatPrice(d.price)}</span>` +
          `<span class="dish-row-desc"><span class="dish-row-meat">${esc(madeWith(d))}</span> · ${esc(d.short)}</span>`,
      );
      b.addEventListener('click', () => onPreview(d.id));
      li.append(b);
      ul.append(li);
    }
    s.append(ul);
    menuList.append(s);
  }
  $('[data-back]').addEventListener('click', () => onBack());
  $('[data-order]').addEventListener('click', () => lastDishId && onOrder(lastDishId));
  restart.addEventListener('click', () => onRestart());

  function fillDish(d) {
    const sec = MENU.find((s) => s.dishes.includes(d));
    $('[data-dish-section]').textContent = sec ? sec.section : '';
    $('[data-dish-name]').textContent = d.name;
    $('[data-dish-price]').textContent = formatPrice(d.price);
    const chillies = [1, 2, 3].map((i) => `<svg class="chilli${i <= d.spice ? ' is-on' : ''}" viewBox="0 0 24 24" aria-hidden="true">${CHILLI}</svg>`).join('');
    $('[data-dish-spice]').innerHTML = `${chillies}<span class="sr-only">${spiceLabel[d.spice]}</span>`;
    $('[data-dish-spice]').title = spiceLabel[d.spice];
    $('[data-dish-time]').textContent = `${d.time} min`;
    $('[data-dish-meat]').textContent = madeWith(d);
    $('[data-dish-desc]').textContent = d.description;
    const ing = $('[data-dish-ingredients]');
    ing.replaceChildren(...d.ingredients.map((x) => el('li', {}, esc(x))));
    $('[data-order]').textContent = `Order this · ${formatPrice(d.price)}`;
    $('.dish-scroll', dishView).scrollTop = 0;
  }

  function updateBill() {
    const total = bag.reduce((s, d) => s + d.price, 0);
    bill.hidden = bag.length === 0;
    $('[data-bill-total]').textContent = formatPrice(total);
    $('[data-bill-count]').textContent = bag.length === 1 ? '1 dish' : `${bag.length} dishes`;
  }

  function button(label, cls, fn) {
    const b = el('button', { type: 'button', class: `btn ${cls}` }, esc(label));
    b.addEventListener('click', fn);
    return b;
  }

  function showStatus(kicker, text, acts = [], step = -1) {
    status.hidden = false;
    statusKicker.textContent = kicker;
    statusText.textContent = text;
    actions.replaceChildren(...acts);
    steps.hidden = step < 0;
    [...steps.children].forEach((li, i) => {
      li.classList.toggle('is-done', i < step);
      li.classList.toggle('is-now', i === step);
    });
  }

  // Tell the 3D stage how much of the screen the panels cover.
  function syncInset() {
    let left = 0;
    let bottom = 0;
    if (!menu.hidden) {
      const r = menu.getBoundingClientRect();
      if (DESKTOP.matches) left = r.right;
      else bottom = window.innerHeight - r.top;
    } else if (!status.hidden && !DESKTOP.matches) {
      bottom = (window.innerHeight - status.getBoundingClientRect().top) * 0.6;
    }
    setInset(left, bottom);
  }
  window.addEventListener('resize', syncInset);

  function setState(s, ctx = {}) {
    const prev = state;
    state = s;
    const t = ctx.table;
    const where = t ? `Table ${t.id} · ${t.label}` : '';
    html.classList.toggle('is-locked', s !== 'story');
    restart.hidden = s === 'story';
    for (const b of tableBtns.values()) b.disabled = s !== 'story';

    const inMenu = s === 'menu' || s === 'dish';
    if (inMenu && menu.hidden) returnFocus = document.activeElement;
    menu.hidden = !inMenu;
    if (inMenu) status.hidden = true;

    switch (s) {
      case 'story':
        status.hidden = true;
        bag.length = 0;
        lastDishId = null;
        updateBill();
        break;
      case 'walking':
        showStatus(where, 'Taking your seat…');
        break;
      case 'waiting':
        showStatus(where, 'Imran is bringing you the menu.');
        break;
      case 'menu-ready': {
        const open = button('Open the menu', 'btn-primary', () => onOpenMenu());
        showStatus(where, 'The menu is on your table. Open it, or tap the book.', [open]);
        open.focus({ preventScroll: true });
        break;
      }
      case 'opening':
        showStatus(where, 'Opening the menu…');
        break;
      case 'menu':
        listView.hidden = false;
        dishView.hidden = true;
        if (prev === 'dish' && lastDishId) {
          const row = $(`[data-dish="${lastDishId}"]`, menuList);
          row?.focus({ preventScroll: false });
        } else {
          menuList.scrollTop = 0;
          $('#menu-title').focus({ preventScroll: true });
        }
        break;
      case 'dish':
        lastDishId = ctx.dish.id;
        fillDish(ctx.dish);
        listView.hidden = true;
        dishView.hidden = false;
        $('[data-dish-name]').focus({ preventScroll: true });
        break;
      case 'serving': {
        const name = ctx.dish.name;
        if (ctx.step === 0) {
          bag.push(ctx.dish);
          updateBill();
        }
        const text = [`Order taken: ${name}.`, 'Imran has gone to the kitchen pass.', `${name} is on its way to you.`][ctx.step];
        showStatus(where, text, [], ctx.step);
        break;
      }
      case 'served': {
        const more = button('Order something else', 'btn-primary', () => onOpenMenu());
        const over = button('Start over', 'btn-ghost', () => onRestart());
        showStatus(`Served · ${where}`, `${ctx.dish.name} is served. Enjoy your meal.`, [more, over]);
        more.focus({ preventScroll: true });
        break;
      }
    }
    if (!inMenu && (prev === 'menu' || prev === 'dish') && s !== 'serving' && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    requestAnimationFrame(syncInset);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state === 'dish') {
      e.preventDefault();
      onBack();
    }
  });

  let tagsShown = false;
  function placeTags(list, choosing) {
    if (!choosing) {
      if (tagsShown) for (const b of tags.values()) b.setAttribute('data-off', '');
      tagsShown = false;
      return;
    }
    tagsShown = true;
    for (const p of list) {
      const b = tags.get(p.id);
      if (!b) continue;
      b.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
      b.toggleAttribute('data-off', !p.visible);
    }
  }

  function setHot(id) {
    for (const [k, b] of tableBtns) b.classList.toggle('is-hot', k === id);
  }

  return { setState, placeTags, setHot };
}
