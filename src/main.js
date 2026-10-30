import './styles/main.css';
import * as THREE from 'three';
import gsap from 'gsap';
import { createStage } from './stage.js';
import { buildExterior } from './scene/exterior.js';
import { buildInterior } from './scene/interior.js';
import { Character, PEOPLE, loadPeople } from './scene/characters.js';
import { buildDish, DISH_IDS } from './scene/dishes.js';
import { TABLE_H } from './scene/props.js';
import { createStory } from './story.js';
import { Experience } from './experience.js';
import { createUI } from './ui.js';

const loader = document.querySelector('[data-loader]');
const params = new URLSearchParams(location.search);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches && params.get('motion') !== 'full';

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

// Canvas textures (signboard, menu pages) are drawn with the web fonts, so wait for them briefly.
function fontsReady() {
  const load = ['500 40px Fraunces', 'italic 500 40px Fraunces', '400 20px Inter', '600 20px Inter'].map((f) => document.fonts.load(f).catch(() => {}));
  load.push(document.fonts.load('600 40px "Noto Nastaliq Urdu"', 'زعفران').catch(() => {}));
  return Promise.race([Promise.all(load), new Promise((r) => setTimeout(r, 2500))]);
}

async function start() {
  if (!hasWebGL()) {
    document.querySelector('[data-fallback]').hidden = false;
    loader.classList.add('is-done');
    return;
  }
  // the cast (one Draco-compressed GLB) downloads while the fonts settle
  await Promise.all([fontsReady(), loadPeople()]);

  const stage = createStage(document.querySelector('[data-stage]'));
  const { scene } = stage;
  const exterior = buildExterior();
  const interior = buildInterior();
  scene.add(exterior.group, interior.group);

  // ---------- people ----------
  const guest = new Character(PEOPLE.guest);
  guest.manual = true;
  const waiter = new Character(PEOPLE.waiter);
  const chef = new Character(PEOPLE.chef);
  chef.root.position.set(-0.6, 0, -12.7);
  chef.setYaw(0);
  chef.pose.wait = 0.4;
  const people = [guest, waiter, chef];

  const diners = [PEOPLE.dinerA, PEOPLE.dinerB, PEOPLE.dinerC, PEOPLE.dinerD];
  const plates = { 1: ['chicken-karahi', 'nihari'], 4: ['biryani', 'kashmiri-chai'] };
  let n = 0;
  for (const t of interior.tables.filter((x) => x.occupied)) {
    [t.d, t.d.clone().negate()].forEach((dir, i) => {
      const c = new Character(diners[n++ % diners.length]);
      c.root.position.copy(t.center).addScaledVector(dir, 0.74);
      c.setYaw(Math.atan2(-dir.x, -dir.z));
      c.pose.sit = 1;
      c.pose.talk = i === 0 ? 1 : 0.35;
      people.push(c);
      const plate = buildDish(plates[t.id][i]);
      plate.position.copy(t.center).addScaledVector(dir, 0.12).setY(TABLE_H);
      plate.rotation.y = Math.atan2(dir.x, dir.z);
      plate.scale.setScalar(0.82);
      scene.add(plate);
    });
  }
  for (const c of people) scene.add(c.root);
  // warm the dish geometry/texture caches so the first preview doesn't hitch
  for (const id of DISH_IDS) buildDish(id);

  // ---------- scroll story ----------
  const story = createStory({ cam: stage.cam, guest, setDoor: exterior.setDoor, setInside: stage.setInside });
  const scroll = { target: 0, p: 0 };
  const readScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    scroll.target = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
  };
  readScroll();
  scroll.p = scroll.target;
  addEventListener('scroll', readScroll, { passive: true });
  addEventListener('resize', readScroll);

  // ---------- experience + UI ----------
  let exp;
  const ui = createUI({
    tables: interior.tables,
    onChoose(id) {
      if (exp.state !== 'story') return;
      // jump to the end of the walk-in if the table was picked from the list early
      if (scroll.p < 0.97) {
        scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
        scroll.target = scroll.p = 1;
        story.apply(1, 0.016);
      }
      exp.chooseTable(id);
    },
    onHover(id) {
      exp.hoverId = id;
      ui.setHot(id);
    },
    onOpenMenu: () => exp.openMenu(),
    onPreview: (id) => exp.previewDish(id),
    onBack: () => exp.backToMenu(),
    onOrder: (id) => exp.orderDish(id),
    onRestart: restart,
    setInset: stage.setInset,
  });
  exp = new Experience({ stage, interior, guest, waiter, ui, reduce });
  exp.bindPointer(stage.renderer.domElement, () => scroll.p);

  function restart() {
    exp.reset();
    scrollTo({ top: 0, behavior: 'instant' });
    scroll.target = scroll.p = 0;
    stage.setInset(0, 0);
    document.querySelector('[data-brand]').focus({ preventScroll: true });
  }
  document.querySelector('[data-brand]').addEventListener('click', (e) => {
    e.preventDefault();
    restart();
  });

  // ---------- loop ----------
  let elapsed = 0;
  function frame(_time, deltaMs) {
    const dt = Math.min(deltaMs / 1000, 0.05);
    elapsed += dt;
    if (exp.state === 'story') {
      scroll.p = reduce ? scroll.target : scroll.p + (scroll.target - scroll.p) * (1 - Math.exp(-5 * dt));
      if (Math.abs(scroll.target - scroll.p) < 1e-4) scroll.p = scroll.target;
      story.apply(scroll.p, dt);
      // on tall screens the chapter copy sits at the bottom, so lift the scene above it
      stage.setInset(0, innerWidth < innerHeight * 1.1 ? innerHeight * 0.4 : 0);
    }
    for (const c of people) c.update(dt, elapsed);
    interior.update(elapsed, dt);
    exp.update(dt, elapsed, scroll.p);
    stage.render(dt);
  }
  story.apply(scroll.p, 0);
  frame(0, 16);
  gsap.ticker.lagSmoothing(500, 33);
  gsap.ticker.add(frame);
  requestAnimationFrame(() => loader.classList.add('is-done'));

  if (import.meta.env.DEV) window.__zafraan = { stage, exp, scroll, story, THREE, gsap };
}

start().catch((err) => {
  console.error(err);
  document.querySelector('[data-fallback]').hidden = false;
  loader.classList.add('is-done');
});
