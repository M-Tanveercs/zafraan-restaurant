import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MENU, formatPrice } from '../data/menu.js';

export const TABLE_H = 0.76;
export const TABLE_R = 0.48;

const M = {
  marble: new THREE.MeshStandardMaterial({ color: 0xece6db, roughness: 0.28 }),
  iron: new THREE.MeshStandardMaterial({ color: 0x1b1a19, roughness: 0.55, metalness: 0.6 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xc9953f, roughness: 0.32, metalness: 1 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x3e2618, roughness: 0.55 }),
  cane: new THREE.MeshStandardMaterial({ color: 0xc8a46a, roughness: 0.85 }),
  terracotta: new THREE.MeshStandardMaterial({ color: 0xa5532f, roughness: 0.9 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x2f5a35, roughness: 0.8, flatShading: true }),
  leafLight: new THREE.MeshStandardMaterial({ color: 0x4a7a3c, roughness: 0.8, flatShading: true }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xdfeee9, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.28, depthWrite: false }),
  water: new THREE.MeshStandardMaterial({ color: 0xbfd8d6, roughness: 0.1, transparent: true, opacity: 0.5, depthWrite: false }),
  bulb: new THREE.MeshBasicMaterial({ color: 0xffe2b0 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xc9ccce, roughness: 0.25, metalness: 1 }),
  napkin: new THREE.MeshStandardMaterial({ color: 0x8e2f3a, roughness: 0.9 }),
};
export const MATERIALS = M;

// ---------- glow halo (cheap stand-in for bloom) ----------
let haloTex;
export function halo(size = 0.6, color = 0xffc77a, opacity = 0.55) {
  if (!haloTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.2, 'rgba(255,255,255,0.45)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    haloTex = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  s.scale.setScalar(size);
  return s;
}

// ---------- Marble café table on an iron pedestal ----------
let tableGeo;
export function createTable() {
  if (!tableGeo) {
    const top = new THREE.CylinderGeometry(TABLE_R, TABLE_R, 0.035, 40);
    top.translate(0, TABLE_H - 0.0175, 0);
    const rim = new THREE.TorusGeometry(TABLE_R, 0.012, 6, 48);
    rim.rotateX(Math.PI / 2);
    rim.translate(0, TABLE_H - 0.02, 0);
    const stem = new THREE.CylinderGeometry(0.035, 0.05, TABLE_H - 0.06, 12);
    stem.translate(0, (TABLE_H - 0.06) / 2 + 0.03, 0);
    const feet = [];
    for (let i = 0; i < 4; i++) {
      const f = new THREE.BoxGeometry(0.05, 0.035, 0.34);
      f.translate(0, 0.02, 0.16);
      f.rotateY((i * Math.PI) / 2 + Math.PI / 4);
      feet.push(f);
    }
    tableGeo = { top, rim, iron: mergeGeometries([stem, ...feet]) };
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(tableGeo.top, M.marble), new THREE.Mesh(tableGeo.rim, M.brass), new THREE.Mesh(tableGeo.iron, M.iron));
  return g;
}

// ---------- Bentwood chair with a cane seat (faces +Z) ----------
let chairGeo;
export function createChair() {
  if (!chairGeo) {
    const parts = [];
    const seatH = 0.46;
    for (const [x, z] of [[-0.16, 0.15], [0.16, 0.15], [-0.15, -0.15], [0.15, -0.15]]) {
      const leg = new THREE.CylinderGeometry(0.016, 0.014, seatH, 8);
      leg.translate(0, seatH / 2, 0);
      leg.rotateX(z > 0 ? -0.06 : 0.06);
      leg.translate(x, 0, z);
      parts.push(leg);
    }
    const ring = new THREE.TorusGeometry(0.15, 0.012, 6, 24);
    ring.rotateX(Math.PI / 2);
    ring.translate(0, 0.2, 0);
    parts.push(ring);
    const rail = new THREE.TorusGeometry(0.205, 0.016, 6, 32);
    rail.rotateX(Math.PI / 2);
    rail.translate(0, seatH - 0.012, 0);
    parts.push(rail);
    const hoop = new THREE.TorusGeometry(0.17, 0.016, 6, 24, Math.PI);
    hoop.scale(1, 1.6, 1);
    hoop.translate(0, seatH + 0.16, -0.2);
    hoop.rotateX(-0.12);
    parts.push(hoop);
    for (const x of [-0.17, 0.17]) {
      const post = new THREE.CylinderGeometry(0.016, 0.016, 0.2, 8);
      post.translate(x, seatH + 0.08, -0.2);
      parts.push(post);
    }
    const seat = new THREE.CylinderGeometry(0.2, 0.2, 0.025, 28);
    seat.translate(0, seatH, 0);
    chairGeo = { wood: mergeGeometries(parts), seat };
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(chairGeo.wood, M.wood), new THREE.Mesh(chairGeo.seat, M.cane));
  return g;
}

// ---------- Small table setting: glass, folded napkin, brass candle ----------
export function createSetting() {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.11, 16, 1, true), M.glass);
  glass.position.y = 0.055;
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.029, 0.07, 16), M.water);
  water.position.y = 0.04;
  const glassGroup = new THREE.Group();
  glassGroup.add(glass, water);
  glassGroup.name = 'glass';
  g.add(glassGroup);
  const napkin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.18), M.napkin);
  napkin.name = 'napkin';
  g.add(napkin);
  return g;
}

export function createCandle() {
  const g = new THREE.Group();
  const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.05, 16), M.brass);
  holder.position.y = 0.025;
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), M.bulb);
  flame.scale.y = 1.7;
  flame.position.y = 0.075;
  const h = halo(0.22, 0xffb45a, 0.7);
  h.position.y = 0.08;
  g.add(holder, flame, h);
  return g;
}

// ---------- Brass dome pendant ----------
export function createPendant(drop = 1.25) {
  const g = new THREE.Group();
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, drop, 6), M.iron);
  cord.position.y = -drop / 2;
  const shade = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.brass.clone());
  shade.material.side = THREE.DoubleSide;
  shade.scale.y = 0.7;
  shade.position.y = -drop - 0.12;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), M.bulb);
  bulb.position.y = -drop - 0.14;
  const h = halo(0.9, 0xffc77a, 0.5);
  h.position.y = -drop - 0.18;
  g.add(cord, shade, bulb, h);
  return g;
}

// ---------- Potted plant (low-poly) ----------
export function createPlant(height = 1.4, seed = 1) {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.19, 0.45, 18), M.terracotta);
  pot.position.y = 0.225;
  const rimm = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.025, 6, 24), M.terracotta);
  rimm.rotation.x = Math.PI / 2;
  rimm.position.y = 0.45;
  g.add(pot, rimm);
  let r = seed * 9301 + 49297;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const leafGeo = new THREE.SphereGeometry(0.11, 6, 4);
  leafGeo.scale(0.55, 0.12, 1.6);
  leafGeo.translate(0, 0, 0.16);
  for (let i = 0; i < 16; i++) {
    const a = rnd() * Math.PI * 2;
    const h = 0.5 + rnd() * (height - 0.5);
    const stem = new THREE.Group();
    stem.position.set(Math.cos(a) * 0.05, h, Math.sin(a) * 0.05);
    stem.rotation.y = a;
    const leaf = new THREE.Mesh(leafGeo, i % 3 ? M.leaf : M.leafLight);
    leaf.rotation.x = 0.2 + rnd() * 0.6;
    leaf.scale.setScalar(0.8 + rnd() * 0.9);
    stem.add(leaf);
    g.add(stem);
  }
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, height - 0.4, 6), M.leaf);
  stalk.position.y = 0.45 + (height - 0.4) / 2;
  g.add(stalk);
  return g;
}

// ---------- Serving tray ----------
export function createTray() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.21, 0.012, 36), M.brass);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.218, 0.009, 6, 40), M.brass);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.008;
  g.add(base, rim);
  return g;
}

// ---------- Menu book: cover hinges on the spine, pages carry the printed menu ----------
const BOOK_W = 0.23;
const BOOK_D = 0.31;

function paperCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#f6eedf';
  g.fillRect(0, 0, w, h);
  return [c, g];
}

function coverTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 690;
  const g = c.getContext('2d');
  g.fillStyle = '#1d4644';
  g.fillRect(0, 0, 512, 690);
  // subtle leather grain
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
    g.fillRect(Math.random() * 512, Math.random() * 690, 2, 2);
  }
  g.strokeStyle = '#d1a24c';
  g.lineWidth = 4;
  g.strokeRect(28, 28, 456, 634);
  g.lineWidth = 1.5;
  g.strokeRect(40, 40, 432, 610);
  // arch emblem
  g.beginPath();
  g.moveTo(206, 330);
  g.lineTo(206, 250);
  g.quadraticCurveTo(206, 196, 256, 176);
  g.quadraticCurveTo(306, 196, 306, 250);
  g.lineTo(306, 330);
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = '#d1a24c';
  g.beginPath();
  g.arc(256, 280, 14, 0, Math.PI * 2);
  g.fill();
  g.textAlign = 'center';
  g.font = '600 72px Fraunces, Georgia, serif';
  g.fillText('Zafraan', 256, 430);
  g.font = '600 34px "Noto Nastaliq Urdu", serif';
  g.fillText('زعفران', 256, 500);
  g.font = '500 20px Inter, system-ui, sans-serif';
  g.letterSpacing = '6px';
  g.fillText('EVENING MENU', 256, 572);
  return c;
}

function welcomeTexture() {
  const [c, g] = paperCanvas(512, 690);
  g.fillStyle = '#2a2119';
  g.textAlign = 'center';
  g.font = 'italic 500 44px Fraunces, Georgia, serif';
  g.fillText('Welcome to Zafraan', 256, 140);
  g.font = '400 21px Inter, system-ui, sans-serif';
  g.fillStyle = '#5d5146';
  const lines = ['Slow-cooked food from', 'Lahore, Karachi and Peshawar,', 'served the way our', 'grandparents liked it.'];
  lines.forEach((l, i) => g.fillText(l, 256, 210 + i * 34));
  g.strokeStyle = '#c47f16';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(206, 380);
  g.lineTo(306, 380);
  g.stroke();
  g.font = '500 18px Inter, system-ui, sans-serif';
  g.fillStyle = '#7a6d60';
  g.fillText('All our meat is halal.', 256, 440);
  g.fillText('Tell Imran about any allergies.', 256, 470);
  return c;
}

function menuPageTexture() {
  const [c, g] = paperCanvas(512, 690);
  let y = 64;
  g.textAlign = 'left';
  for (const section of MENU) {
    g.fillStyle = '#c47f16';
    g.font = '600 15px Inter, system-ui, sans-serif';
    g.fillText(section.section.toUpperCase(), 44, y);
    y += 34;
    for (const d of section.dishes) {
      g.fillStyle = '#c47f16';
      g.save();
      g.translate(49, y - 8);
      g.rotate(Math.PI / 4);
      g.fillRect(-4, -4, 8, 8);
      g.restore();
      g.fillStyle = '#2a2119';
      g.font = '500 23px Fraunces, Georgia, serif';
      g.fillText(d.name, 66, y);
      g.textAlign = 'right';
      g.font = '500 19px Inter, system-ui, sans-serif';
      g.fillText(formatPrice(d.price), 468, y);
      g.textAlign = 'left';
      y += 44;
    }
    y += 22;
  }
  return c;
}

export function createMenuBook() {
  const root = new THREE.Group();
  root.name = 'menu-book';
  const inner = new THREE.Group();
  inner.position.x = -BOOK_W / 2;
  root.add(inner);

  const tex = (canvas) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  const leather = new THREE.MeshStandardMaterial({ color: 0x1d4644, roughness: 0.6 });
  const pageEdge = new THREE.MeshStandardMaterial({ color: 0xeee4d0, roughness: 0.9 });
  const coverMat = new THREE.MeshStandardMaterial({ map: tex(coverTexture()), roughness: 0.55 });
  const welcomeTex = tex(welcomeTexture());
  // the cover's underside is seen after the cover swings over, so turn the page round
  welcomeTex.center.set(0.5, 0.5);
  welcomeTex.rotation = Math.PI;
  const welcomeMat = new THREE.MeshStandardMaterial({ map: welcomeTex, roughness: 0.9 });
  const menuMat = new THREE.MeshStandardMaterial({ map: tex(menuPageTexture()), roughness: 0.9 });

  const back = new THREE.Mesh(new THREE.BoxGeometry(BOOK_W, 0.006, BOOK_D), leather);
  back.position.set(BOOK_W / 2, 0.003, 0);
  const pages = new THREE.Mesh(new THREE.BoxGeometry(BOOK_W - 0.012, 0.012, BOOK_D - 0.012), [pageEdge, pageEdge, menuMat, pageEdge, pageEdge, pageEdge]);
  pages.position.set(BOOK_W / 2, 0.012, 0);

  const cover = new THREE.Group();
  cover.position.y = 0.019;
  const coverMesh = new THREE.Mesh(new THREE.BoxGeometry(BOOK_W, 0.006, BOOK_D), [leather, leather, coverMat, welcomeMat, leather, leather]);
  coverMesh.position.set(BOOK_W / 2, 0.003, 0);
  cover.add(coverMesh);
  inner.add(back, pages, cover);

  // Big invisible hit box so the book is easy to click.
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.42), new THREE.MeshBasicMaterial({ visible: false }));
  hit.name = 'book-hit';
  root.add(hit);

  const state = { open: 0 };
  root.userData = {
    hit,
    state,
    setOpen(v) {
      state.open = v;
      cover.rotation.z = v * (Math.PI - 0.03);
      inner.position.x = -BOOK_W / 2 + (BOOK_W / 2) * v;
    },
  };
  return root;
}
