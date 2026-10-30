// Procedural Pakistani dishes. Units: metres. Origin = centre of underside, front faces +Z.
import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const DISH_IDS = ['chicken-tikka', 'chapli-kebab', 'biryani', 'chicken-karahi', 'nihari', 'gulab-jamun', 'kashmiri-chai'];

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */
const V3 = THREE.Vector3;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const PI = Math.PI;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// smooth, position-based pseudo noise in about [-1,1] (consistent across duplicated seam vertices)
function wob(x, y, z, s = 0) {
  return (Math.sin(x * 1.7 + s * 3.1 + Math.sin(y * 2.3 + s)) * Math.sin(y * 1.9 + s * 1.7 + Math.sin(z * 2.1)) +
    Math.sin(z * 2.9 + s * 0.7 + x * 1.3) * 0.5) / 1.5;
}

const cache = new Map();
function cached(key, make) {
  let v = cache.get(key);
  if (!v) { v = make(); cache.set(key, v); }
  return v;
}

function smooth(g) {
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const m = mergeVertices(g, 1e-6);
  m.computeVertexNormals();
  return m;
}

function std(name, color, rough = 0.6, metal = 0, o = {}) {
  return cached('m:' + name, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...o }));
}
function phys(name, color, rough = 0.3, clearcoat = 0.8, o = {}) {
  return cached('p:' + name, () => new THREE.MeshPhysicalMaterial({ color, roughness: rough, clearcoat, clearcoatRoughness: 0.12, ...o }));
}

function canvasTex(name, w, h, draw, repeat) {
  return cached('t:' + name, () => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
    return t;
  });
}

// organic blob: icosphere with low-frequency radial jitter and anisotropic scale
function lump(r, sx = 1, sy = 1, sz = 1, amt = 0.15, seed = 0, detail = 2) {
  const g = smooth(new THREE.IcosahedronGeometry(1, detail));
  const p = g.attributes.position;
  const v = new V3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + amt * wob(v.x * 2.2, v.y * 2.2, v.z * 2.2, seed);
    p.setXYZ(i, v.x * k * r * sx, v.y * k * r * sy, v.z * k * r * sz);
  }
  g.computeVertexNormals();
  return g;
}

// rounded box with optional jitter
function rbox(w, h, d, r, seg = 4, amt = 0, seed = 0) {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const p = g.attributes.position;
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  const v = new V3(), c = new V3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(clamp(v.x, -hx, hx), clamp(v.y, -hy, hy), clamp(v.z, -hz, hz));
    v.sub(c);
    if (v.lengthSq() > 0) v.normalize().multiplyScalar(r);
    v.add(c);
    if (amt) {
      const s = Math.min(w, h, d);
      v.x += amt * s * wob(v.x / s * 3, v.y / s * 3, v.z / s * 3, seed);
      v.y += amt * s * wob(v.y / s * 3, v.z / s * 3, v.x / s * 3, seed + 1);
      v.z += amt * s * wob(v.z / s * 3, v.x / s * 3, v.y / s * 3, seed + 2);
    }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return smooth(g);
}

// profile = [[r,y],...]; trace base centre -> out -> up outer wall -> over rim -> down inner wall -> centre
function lathe(profile, seg = 40) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.00001), y)), seg);
}

// top-facing filling surface (outer -> centre), slightly domed + noisy, tucks under the wall at its edge
function surface(r, y, dome = 0.003, noise = 0.0015, seed = 0, rings = 7, seg = 36, edgeDrop = 0.004) {
  const pts = [[r, y - edgeDrop]];
  for (let i = 1; i <= rings; i++) {
    const k = 1 - i / rings;
    pts.push([Math.max(r * k, 0.00001), y + dome * (1 - k * k)]);
  }
  const g = lathe(pts, seg);
  if (noise) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), rr = Math.hypot(x, z);
      if (rr < r * 0.97) p.setY(i, p.getY(i) + noise * wob(x / r * 3, 0, z / r * 3, seed));
    }
    g.computeVertexNormals();
  }
  return g;
}

function put(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  if (s !== 1) m.scale.setScalar(s);
  m.castShadow = m.receiveShadow = false;
  parent.add(m);
  return m;
}

const _o = new THREE.Object3D();
const _c = new THREE.Color();
// instanced helper: items = [{p:[x,y,z], r:[rx,ry,rz], s:number|[x,y,z], c:hex}]
function inst(parent, geo, mat, items, colored = false) {
  const im = new THREE.InstancedMesh(geo, mat, items.length);
  items.forEach((it, i) => {
    _o.position.set(...it.p);
    if (it.q) _o.quaternion.copy(it.q); else _o.rotation.set(...(it.r || [0, 0, 0]));
    const s = it.s ?? 1;
    if (Array.isArray(s)) _o.scale.set(...s); else _o.scale.setScalar(s);
    _o.updateMatrix();
    im.setMatrixAt(i, _o.matrix);
    if (colored) im.setColorAt(i, _c.set(it.c ?? 0xffffff));
  });
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.frustumCulled = false;
  im.castShadow = im.receiveShadow = false;
  parent.add(im);
  return im;
}

// give a group-local frame so vessels can be offset easily
function sub(parent, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  parent.add(g);
  return g;
}

const ico0 = () => cached('ico0', () => smooth(new THREE.IcosahedronGeometry(1, 0)));

// vertex colours from a function(position)->THREE.Color
function paint(g, fn) {
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const v = new V3(), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    fn(v, c);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// colours given as sRGB hex -> THREE.Color (converted to working space by Color.set)
const col = (hex) => new THREE.Color(hex);

/* ------------------------------------------------------------------ */
/* shared materials / props                                            */
/* ------------------------------------------------------------------ */
const steel = () => std('steel', 0xd5d8dc, 0.32, 1);
const brass = () => std('brass', 0xd9a441, 0.3, 1);
const copper = () => std('copper', 0xc4693c, 0.3, 1);
const ceramic = () => phys('ceramic', 0xf1ebdf, 0.28, 0.5, { clearcoatRoughness: 0.2 });
const leafMat = () => std('leaf', 0xffffff, 0.6, 0, { side: THREE.DoubleSide });
const leafMat2 = () => std('leaf2', 0x2f7d32, 0.6, 0, { side: THREE.DoubleSide });

function woodTex() {
  return canvasTex('wood', 256, 256, (g, w, h) => {
    g.fillStyle = '#6e4528'; g.fillRect(0, 0, w, h);
    const r = rng(7);
    for (let i = 0; i < 90; i++) {
      const y = r() * h;
      g.strokeStyle = `rgba(${r() < 0.5 ? '60,34,16' : '200,150,100'},${0.08 + r() * 0.16})`;
      g.lineWidth = 0.6 + r() * 2.4;
      g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x / w * 12.566 + i) * 3);
      g.stroke();
    }
  });
}

function katoriGeo(r, h) {
  return cached(`kat${r}|${h}`, () => {
    const t = 0.002;
    return lathe([
      [0, 0], [r * 0.55, 0], [r * 0.66, h * 0.08], [r * 0.82, h * 0.4], [r * 0.95, h * 0.78], [r, h], [r - t * 0.5, h + 0.0008], [r - t * 1.2, h],
      [r * 0.95 - t, h * 0.78], [r * 0.82 - t, h * 0.4], [r * 0.64 - t, h * 0.1], [r * 0.5, t], [0, t],
    ], 36);
  });
}
// steel katori with inner radius estimate for fillings
function katori(parent, r, h, x, y, z, matFn = steel) {
  const g = sub(parent, x, y, z);
  put(g, katoriGeo(r, h), matFn());
  return g;
}

// fill a katori to height fraction `frac` (0..1 of h); radius follows the inner wall
function katFill(parent, r, h, frac, dome, noise, seed, material) {
  const t = 0.002;
  const pts = [[0.002 / h, r * 0.5], [0.1, r * 0.64 - t], [0.4, r * 0.82 - t], [0.78, r * 0.95 - t], [1, r - t * 1.2]];
  let rad = pts[4][1];
  for (let i = 0; i < 4; i++) if (frac <= pts[i + 1][0]) { const k = (frac - pts[i][0]) / (pts[i + 1][0] - pts[i][0]); rad = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k; break; }
  const geo = cached(`kf${r}|${h}|${frac}|${dome}|${seed}`, () => surface(rad + 0.0004, frac * h, dome, noise, seed, 7, 36, 0.001));
  return put(parent, geo, material, 0, 0, 0);
}

const lemonTex = () => canvasTex('lemon', 128, 64, (g, w, h) => {
  g.fillStyle = '#f2d95a'; g.fillRect(0, 0, w, h);
  const cx = w / 2, R = h;
  g.fillStyle = '#fff5c8'; g.beginPath(); g.arc(cx, 0, R * 0.96, 0, PI); g.fill();
  g.fillStyle = '#f6e36a'; g.beginPath(); g.arc(cx, 0, R * 0.86, 0, PI); g.fill();
  g.strokeStyle = '#fff3b0'; g.lineWidth = 2.5;
  for (let i = 1; i < 6; i++) { const a = (i / 6) * PI; g.beginPath(); g.moveTo(cx, 0); g.lineTo(cx + Math.cos(a) * R * 0.86, Math.sin(a) * R * 0.86); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(cx + (Math.random() - 0.5) * 100, Math.random() * 50, 1.2, 0, 6.3); g.fill(); }
});
function lemonWedge(parent, x, y, z, ry = 0, r = 0.025) {
  const g = sub(parent, x, y, z, ry);
  const rind = cached('lemonRind' + r, () => {
    const s = new THREE.Shape();
    s.absarc(0, 0, r, PI, 2 * PI, false);
    s.lineTo(-r, 0);
    const e = new THREE.ExtrudeGeometry(s, { depth: r * 0.4, bevelEnabled: true, bevelThickness: r * 0.1, bevelSize: r * 0.08, bevelSegments: 2, curveSegments: 14 });
    e.translate(0, 0, -r * 0.2);
    return e;
  });
  const flesh = cached('lemonFlesh' + r, () => {
    const s = new THREE.Shape();
    s.absarc(0, 0, r * 0.93, PI, 2 * PI, false);
    s.lineTo(-r * 0.93, 0);
    const e = new THREE.ShapeGeometry(s, 14);
    const p = e.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / (2 * r * 0.93) + 0.5; uv[i * 2 + 1] = (p.getY(i) + r * 0.93) / (r * 0.93); }
    e.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return e;
  });
  put(g, rind, std('lemonRind', 0xe9c62c, 0.5));
  const fm = std('lemonFlesh', 0xffffff, 0.35, 0, { map: lemonTex() });
  put(g, flesh, fm, 0, 0, r * 0.33);
  put(g, flesh, fm, 0, 0, -r * 0.33, 0, PI);
  g.position.y += r + 0.001;
  return g;
}

// leaf shape (pointed ellipse), gently cupped; length along +x
const leafGeo = () => cached('leaf', () => {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.25, 0.55, 0.75, 0.5, 1, 0);
  s.bezierCurveTo(0.75, -0.5, 0.25, -0.55, 0, 0);
  const g = new THREE.ShapeGeometry(s, 5);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, 0.4 * p.getY(i) * p.getY(i) + 0.15 * p.getX(i) * p.getX(i));
  g.rotateX(-PI / 2);
  g.computeVertexNormals();
  return g;
});
// a coriander/mint leaf item
function leafItem(r, p, size, rotY, tilt = 0.4, c) {
  return { p, r: [(r() - 0.5) * tilt, rotY, (r() - 0.5) * tilt], s: [size, size * (0.8 + r() * 0.5), size * (0.7 + r() * 0.4)], c };
}

// thin onion ring (lying flat when rotated x = PI/2)
const ringGeo = () => cached('onionRing', () => new THREE.TorusGeometry(1, 0.075, 5, 28));

const woodMat = () => std('wood', 0xb89c80, 0.6, 0, { map: woodTex() });

// round ceramic/metal bowl; inner shape is a quarter-ellipse
function bowlProfile(r, h, t) {
  const N = 8, bh = t, ri = r - t;
  const pts = [[0, 0], [r * 0.4, 0], [r * 0.43, h * 0.05]];
  for (let i = 1; i <= N; i++) { const a = (i / N) * PI / 2; pts.push([r * 0.43 + r * 0.57 * Math.sin(a), h * 0.05 + h * 0.95 * (1 - Math.cos(a))]); }
  pts.push([r - t * 0.5, h + 0.0007]);
  for (let i = N; i >= 1; i--) { const a = (i / N) * PI / 2; pts.push([r * 0.36 + (ri - r * 0.36) * Math.sin(a), bh + (h - bh) * (1 - Math.cos(a))]); }
  pts.push([r * 0.18, bh], [0, bh]);
  return pts;
}
const bowlGeo = (r, h, t = 0.0028) => cached(`bowl${r}|${h}|${t}`, () => lathe(bowlProfile(r, h, t), 40));
function bowlInnerR(r, h, y, t = 0.0028) {
  const ri = r - t, bh = t;
  const c = clamp((y - bh) / (h - bh), 0, 1);
  const a = Math.acos(1 - c);
  return r * 0.36 + (ri - r * 0.36) * Math.sin(a);
}
function bowlFill(parent, r, h, y, dome, noise, seed, material, t = 0.0028) {
  const geo = cached(`bf${r}|${h}|${y}|${dome}|${seed}`, () => surface(bowlInnerR(r, h, y, t) + 0.0004, y, dome, noise, seed, 7, 36, 0.001));
  return put(parent, geo, material, 0, 0, 0);
}

/* ------------------------------------------------------------------ */
/* 1. chicken tikka boti                                               */
/* ------------------------------------------------------------------ */
const _meat = col(0xc4642e), _coat = col(0xa82c12), _char = col(0x241008);
// a chunk of marinated thigh: irregular, deep red coat, blackened on the high points
function botiGeo(i) {
  return cached('boti' + i, () => paint(lump(0.0158, 1.05, 0.9, 0.95, 0.3, 50 + i, 2), (v, c) => {
    const coat = clamp(0.55 + 0.6 * wob(v.x * 90, v.y * 90, v.z * 90, i + 3), 0, 1);
    const ch = clamp(wob(v.x * 240, v.y * 240, v.z * 240, i) * 1.1 + (v.y > 0.004 ? 0.35 : 0) - 0.12, 0, 1);
    c.copy(_meat).lerp(_coat, coat).lerp(_char, ch * 0.9);
  }));
}
const petalGeo = () => cached('petal', () => {
  const a = new THREE.CylinderGeometry(0.0155, 0.0155, 0.024, 12, 1, true, -1.15, 2.3);
  const b = new THREE.CylinderGeometry(0.0105, 0.0105, 0.018, 10, 1, true, -1.15, 2.3);
  const m = mergeGeometries([a, b]);
  m.translate(0, 0, -0.012);
  m.rotateZ(PI / 2);
  return m;
});

function buildChickenTikka() {
  const g = new THREE.Group();
  const r = rng(11);
  put(g, cached('ptBoard', () => lathe([[0, 0], [0.164, 0], [0.17, 0.005], [0.17, 0.0155], [0.166, 0.02], [0, 0.02]], 48).rotateY(PI)), woodMat());
  put(g, cached('ptPlate', () => lathe([[0, 0], [0.125, 0], [0.14, 0.005], [0.148, 0.0135], [0.1445, 0.0155], [0.1405, 0.0135], [0.13, 0.0065], [0.12, 0.005], [0, 0.005]], 48)),
    std('iron', 0x2c2927, 0.42, 0.6), 0, 0.02, 0);
  const y0 = 0.0255, yc = y0 + 0.0165;
  const botiM = std('botiV', 0xffffff, 0.45, 0, { vertexColors: true });
  const onionM = std('redOnion', 0x9c3d78, 0.4, 0, { side: THREE.DoubleSide });
  const seqs = [['P', 'P', 'O', 'P', 'P', 'O', 'P', 'P'], ['P', 'O', 'P', 'P', 'P', 'O', 'P', 'P']];
  const W = { P: 0.031, O: 0.025 };
  const zs = [-0.012, 0.052];
  const skG = cached('skewer', () => new THREE.CylinderGeometry(0.0016, 0.0016, 0.31, 6).rotateZ(PI / 2));
  const ringG = cached('skRing', () => new THREE.TorusGeometry(0.0085, 0.0016, 5, 16).rotateX(PI / 2));
  let pi = 0;
  const leaves = [];
  seqs.forEach((seq, si) => {
    const z = zs[si];
    const total = seq.reduce((a, k) => a + W[k] + 0.0006, 0);
    let x = -total / 2 + (si ? 0.01 : -0.006);
    put(g, skG, steel(), x + total / 2 + (si ? -0.005 : 0.006), yc, z);
    put(g, ringG, steel(), x + total / 2 + 0.159 + (si ? -0.005 : 0.006), yc, z);
    for (const k of seq) {
      const cx = x + W[k] / 2, jz = z + (r() - 0.5) * 0.003;
      const rx = (r() - 0.5) * 0.7, ry = (r() - 0.5) * 0.35, rz = (r() - 0.5) * 0.2;
      if (k === 'P') put(g, botiGeo(pi++ % 4), botiM, cx, yc, jz, rx, ry * 4, rz);
      else put(g, petalGeo(), onionM, cx, yc, jz, r() * 6.28, (r() - 0.5) * 0.3, (r() - 0.5) * 0.2);
      x += W[k] + 0.0006;
    }
    for (let i = 0; i < 6; i++) leaves.push(leafItem(r, [-0.09 + r() * 0.18, yc + 0.0158, z + (r() - 0.5) * 0.014], 0.011 + r() * 0.005, r() * 6.28, 0.3, r() < 0.5 ? 0x4a9a3c : 0x2f7d32));
  });
  // chutney katori
  const kt = katori(g, 0.032, 0.03, 0.072, y0, -0.078);
  katFill(kt, 0.032, 0.03, 0.74, 0.006, 0.0008, 3, phys('mint', 0x5b9a35, 0.4, 0.5));
  const mintTop = [];
  for (let i = 0; i < 3; i++) mintTop.push(leafItem(r, [(r() - 0.5) * 0.02, 0.0285, (r() - 0.5) * 0.02], 0.009, r() * 6.28, 0.3, 0x2f7d32));
  inst(kt, leafGeo(), leafMat(), mintTop, true);
  // lemon + onion rings
  lemonWedge(g, -0.07, y0, 0.098, 0.5);
  const rings = [
    { p: [0.0, y0 + 0.0014, 0.103], r: [PI / 2, 0, 0.3], s: 0.018 },
    { p: [0.026, y0 + 0.0014, 0.108], r: [PI / 2, 0, 1.1], s: 0.014 },
    { p: [0.012, y0 + 0.0042, 0.106], r: [PI / 2 + 0.12, 0.1, 0.6], s: 0.0125 },
    { p: [-0.026, y0 + 0.0014, 0.112], r: [PI / 2, 0, 2], s: 0.015 },
  ];
  inst(g, ringG0(), onionM, rings);
  for (let i = 0; i < 7; i++) leaves.push(leafItem(r, [-0.03 + r() * 0.1, y0 + 0.004, 0.09 + r() * 0.03], 0.012 + r() * 0.005, r() * 6.28, 0.5, r() < 0.5 ? 0x4a9a3c : 0x2f7d32));
  inst(g, leafGeo(), leafMat(), leaves, true);
  return g;
}
function ringG0() { return ringGeo(); }

/* ------------------------------------------------------------------ */
/* 2. chapli kebab                                                     */
/* ------------------------------------------------------------------ */
const CH_R = 0.056, CH_T = 0.12; // radius, flatness (half-thickness = CH_R * CH_T)
// hand-pressed patty: ragged lacy edge fried almost black, coarse brown top
function chapliGeo(i) {
  return cached('chapli' + i, () => paint(lump(CH_R, 1, CH_T, 0.93, 0.13, 60 + i, 3), (v, c) => {
    const rr = Math.hypot(v.x / CH_R, v.z / (CH_R * 0.93));
    const n = wob(v.x * 170, v.y * 170, v.z * 170, i);
    c.set(0x6a3115).lerp(col(0x9c5822), clamp(n * 0.6 + 0.3, 0, 1)).lerp(col(0x22100a), clamp((rr - 0.78) * 3.5 + n * 0.35, 0, 0.92));
  }));
}
const tomatoTex = () => canvasTex('tomato', 128, 128, (g, w, h) => {
  const cx = w / 2, cy = h / 2;
  g.fillStyle = '#b8261a'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#d6402a'; g.beginPath(); g.arc(cx, cy, w * 0.44, 0, 6.3); g.fill();
  g.fillStyle = '#c4301f'; g.beginPath(); g.arc(cx, cy, w * 0.13, 0, 6.3); g.fill();
  for (let k = 0; k < 4; k++) { // seed chambers
    const a = (k / 4) * 2 * PI + 0.4, x = cx + Math.cos(a) * w * 0.26, y = cy + Math.sin(a) * h * 0.26;
    g.fillStyle = '#e9784e'; g.beginPath(); g.ellipse(x, y, w * 0.12, w * 0.085, a, 0, 6.3); g.fill();
    g.fillStyle = '#f4d28a';
    for (let s = 0; s < 5; s++) { g.beginPath(); g.ellipse(x + Math.cos(a + s) * 5, y + Math.sin(a + s) * 5, 2.2, 1.3, a + s, 0, 6.3); g.fill(); }
  }
  // fried edges where it pressed into the kebab
  const gr = g.createRadialGradient(cx, cy, w * 0.3, cx, cy, w * 0.5);
  gr.addColorStop(0, 'rgba(60,20,8,0)'); gr.addColorStop(1, 'rgba(60,20,8,0.55)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
function buildChapliKebab() {
  const g = new THREE.Group();
  const r = rng(21);
  put(g, cached('thali', () => lathe([[0, 0], [0.13, 0], [0.15, 0.004], [0.1585, 0.012], [0.1605, 0.0145], [0.158, 0.0158], [0.1555, 0.0145], [0.148, 0.0075], [0.13, 0.0037], [0, 0.0037]], 56)), steel());
  const y0 = 0.0037;
  // naan under the first kebab
  const nn = sub(g, -0.06, y0, -0.035, 2.5);
  put(nn, naanGeo(), naanMat());
  const half = CH_R * CH_T;
  const kebabs = [[-0.045, y0 + 0.0125 + half, -0.012, 0.04, 0.3], [0.058, y0 + half + 0.003, 0.034, -0.05, 2.1]];
  const chM = std('chapliV', 0xffffff, 0.62, 0, { vertexColors: true });
  const tomM = [std('tomSkin', 0xa61e14, 0.35), std('tomCut', 0xffffff, 0.3, 0, { map: tomatoTex() }), std('tomSkin', 0xa61e14, 0.35)];
  const tomG = cached('tomSlice', () => new THREE.CylinderGeometry(0.023, 0.023, 0.0045, 28));
  const fleckG = ico0();
  kebabs.forEach(([x, y, z, tilt, ry], i) => {
    const k = sub(g, x, y, z, ry);
    k.rotation.z = tilt;
    put(k, chapliGeo(i), chM);
    // anardana, tomato, coriander and onion pressed into the top
    const fl = [];
    for (let j = 0; j < 80; j++) {
      const a = r() * 6.28, rho = Math.sqrt(r()) * CH_R * 0.82;
      const fx = Math.cos(a) * rho, fz = Math.sin(a) * rho * 0.93;
      const top = half * Math.sqrt(Math.max(0, 1 - (rho / CH_R) ** 2)) - 0.0006;
      const kind = r();
      fl.push({ p: [fx, top, fz], r: [r() * 3, r() * 3, r() * 3], s: [0.0022 + r() * 0.0016, 0.0012, 0.002 + r() * 0.0014], c: kind < 0.3 ? 0x5a0d14 : kind < 0.55 ? 0xb83a1e : kind < 0.85 ? 0x2f6b28 : 0xe6d8b0 });
    }
    inst(k, fleckG, std('chapliFleck', 0xffffff, 0.5), fl, true);
    put(k, tomG, tomM, 0.006, half - 0.0006, -0.004, 0.04, r() * 6.28, -0.03);
  });
  // green chutney
  const kt = katori(g, 0.032, 0.03, 0.082, y0, -0.088);
  katFill(kt, 0.032, 0.03, 0.74, 0.006, 0.0008, 5, phys('mint', 0x5b9a35, 0.4, 0.5));
  // sliced onion + lemon at the front
  lemonWedge(g, -0.092, y0, 0.085, 0.7);
  inst(g, ringGeo(), std('whiteOnion', 0xeee3e6, 0.4, 0, { side: THREE.DoubleSide }), [
    { p: [-0.03, y0 + 0.0014, 0.112], r: [PI / 2, 0, 0.4], s: 0.018 },
    { p: [-0.005, y0 + 0.0014, 0.118], r: [PI / 2, 0, 1.2], s: 0.014 },
    { p: [-0.018, y0 + 0.0042, 0.114], r: [PI / 2 + 0.12, 0.1, 0.7], s: 0.0125 },
  ]);
  const lv = [];
  for (let i = 0; i < 6; i++) lv.push(leafItem(r, [-0.05 + r() * 0.07, y0 + 0.004, 0.1 + r() * 0.03], 0.012 + r() * 0.004, r() * 6.28, 0.5, r() < 0.5 ? 0x4a9a3c : 0x2f7d32));
  inst(g, leafGeo(), leafMat(), lv, true);
  return g;
}

/* ------------------------------------------------------------------ */
/* 3. biryani                                                          */
/* ------------------------------------------------------------------ */
const handiGeo = () => cached('handi', () => lathe([
  [0, 0], [0.06, 0], [0.085, 0.006], [0.105, 0.03], [0.115, 0.065], [0.11, 0.1], [0.095, 0.122], [0.092, 0.133], [0.103, 0.143], [0.108, 0.1485],
  [0.1055, 0.1505], [0.1032, 0.1478], [0.09, 0.1315], [0.093, 0.1], [0.107, 0.065], [0.1, 0.03], [0.08, 0.012], [0, 0.01],
], 44));
const _cr = col(0xf8f0dc), _sf = col(0xeb9418);
const MOUND_R = 0.096, MOUND_Y = 0.139, MOUND_H = 0.05;
function moundNoise(x, z) { return 0.004 * wob((x / MOUND_R) * 3, 0, (z / MOUND_R) * 3, 5); }
const moundGeo = () => cached('mound', () => paint(surface(MOUND_R, MOUND_Y, MOUND_H, 0.004, 5, 12, 36, 0.001), (v, c) => {
  const n = wob(v.x * 32, v.y * 20, v.z * 32, 2);
  c.copy(_cr).lerp(_sf, clamp(n * 1.6 + 0.35, 0, 0.9));
}));
const grainGeo = () => cached('grain', () => new THREE.OctahedronGeometry(1, 0));
const friedOnionGeo = () => cached('friedOnion', () => {
  const b = new THREE.BoxGeometry(0.02, 0.0016, 0.0036, 2, 1, 1);
  const p = b.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + 0.003 * (1 - Math.pow(p.getX(i) / 0.01, 2)));
  b.computeVertexNormals();
  return b;
});
// julienned ginger
const gingerGeo = () => cached('ginger', () => rbox(0.022, 0.0016, 0.0018, 0.0005, 2));

function buildBiryani() {
  const g = new THREE.Group();
  const r = rng(31);
  const h = sub(g, -0.04, 0, -0.02);
  put(h, handiGeo(), copper());
  const earG = cached('handiEar', () => new THREE.TorusGeometry(0.013, 0.0028, 6, 14).rotateY(PI / 2));
  put(h, earG, copper(), 0.1, 0.128, 0);
  put(h, earG, copper(), -0.1, 0.128, 0);
  put(h, moundGeo(), std('riceBase', 0xffffff, 0.75, 0, { vertexColors: true }));

  const surf = (x, z) => MOUND_Y + MOUND_H * (1 - (x * x + z * z) / (MOUND_R * MOUND_R)) + moundNoise(x, z);
  const normalAt = (x, z) => new V3(2 * MOUND_H * x / (MOUND_R * MOUND_R), 1, 2 * MOUND_H * z / (MOUND_R * MOUND_R)).normalize();
  const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), UP = new V3(0, 1, 0);
  const grains = [];
  const palette = [0xf7efd9, 0xf0e2bd, 0xfbf3df, 0xf0a51e, 0xe48a1c, 0xf5c44a];
  for (let i = 0; i < 470; i++) {
    const a = r() * 2 * PI, rho = Math.sqrt(r()) * (MOUND_R - 0.004);
    const x = Math.cos(a) * rho, z = Math.sin(a) * rho;
    const n = normalAt(x, z).add(new V3(r() - 0.5, r() * 0.3, r() - 0.5).multiplyScalar(0.35)).normalize();
    _q1.setFromUnitVectors(UP, n);
    _q2.setFromAxisAngle(n, r() * 2 * PI);
    const patch = wob(x * 32, 0, z * 32, 2) * 1.6 + 0.35;
    const cidx = patch > 0.45 && r() < 0.85 ? 3 + ((r() * 3) | 0) : (r() * 3) | 0;
    grains.push({ p: [x, surf(x, z) + 0.0009, z], q: new THREE.Quaternion().multiplyQuaternions(_q2, _q1), s: [0.0027 + r() * 0.0005, 0.0022, 0.0062 + r() * 0.0018], c: palette[cidx] });
  }
  inst(h, grainGeo(), std('grain', 0xffffff, 0.55), grains, true);

  // chicken peeking out around the rim
  const chickenGeos = [0, 1, 2].map((i) => cached('bChicken' + i, () => lump(0.016, 1.25, 0.8, 1, 0.3, 10 + i, 2)));
  const chickenM = std('chickenTikka', 0x9a3b17, 0.5);
  const chickenM2 = std('chickenTikka2', 0x7a2a10, 0.55);
  [[-0.07, -0.02], [-0.045, 0.062], [0.065, 0.012], [0.02, -0.07], [-0.02, 0.02]].forEach(([x, z], i) => {
    put(h, chickenGeos[i % 3], i % 2 ? chickenM2 : chickenM, x, surf(x, z) + 0.001, z, r() * 0.6, r() * 6.28, r() * 0.6, 0.85 + r() * 0.35);
  });

  // Karachi style: a masala-stained potato facing the diner, a few sour aloo bukhara
  const potG = cached('biryaniAloo', () => paint(lump(0.021, 1.15, 0.85, 1, 0.12, 7, 3), (v, c) => {
    c.set(0xf0c25a).lerp(col(0xc96a1c), clamp(wob(v.x * 90, v.y * 90, v.z * 90, 4) * 0.7 + 0.25 + v.y * 18, 0, 0.85));
  }));
  put(h, potG, std('alooV', 0xffffff, 0.55, 0, { vertexColors: true }), 0.014, surf(0.014, 0.058) + 0.004, 0.058, 0.3, 0.4, 0.1);
  const plumG = cached('alooBukhara', () => lump(0.0072, 1, 0.85, 1.1, 0.2, 9, 2));
  const plumM = phys('alooBukhara', 0x3a0f12, 0.35, 0.8);
  [[0.05, -0.035], [-0.035, -0.055], [0.04, 0.05], [-0.06, 0.035]].forEach(([x, z]) => put(h, plumG, plumM, x, surf(x, z) + 0.004, z, r() * 3, r() * 3, r() * 3));
  const chilliG = cached('chiliGreen', () => lump(0.0045, 5, 0.9, 0.9, 0.15, 2, 1));
  put(h, chilliG, std('greenChili', 0x3a8a2c, 0.45), -0.012, surf(-0.012, -0.03) + 0.004, -0.03, 0.2, 0.9, 0.1);

  // fried onions
  const onG = friedOnionGeo();
  const onions = [], oc = [0xc98a2b, 0x8b5a1c, 0xe0aa45, 0x6b3f12, 0xd39a35];
  for (let i = 0; i < 46; i++) {
    const a = r() * 2 * PI, rho = Math.sqrt(r()) * 0.082;
    const x = Math.cos(a) * rho, z = Math.sin(a) * rho;
    onions.push({ p: [x, surf(x, z) + 0.0022, z], r: [(r() - 0.5) * 0.6, r() * 6.28, (r() - 0.5) * 0.6], s: [0.7 + r() * 0.8, 1, 1 + r()], c: oc[(r() * 5) | 0] });
  }
  inst(h, onG, std('friedOnion', 0xffffff, 0.6), onions, true);
  // mint + coriander leaves
  const lv = [];
  for (let i = 0; i < 15; i++) {
    const a = r() * 2 * PI, rho = Math.sqrt(r()) * 0.08;
    const x = Math.cos(a) * rho, z = Math.sin(a) * rho;
    lv.push(leafItem(r, [x, surf(x, z) + 0.003, z], 0.014 + r() * 0.008, r() * 6.28, 0.6, [0x3f8f3a, 0x2f7d32, 0x57a846][(r() * 3) | 0]));
  }
  inst(h, leafGeo(), leafMat(), lv, true);

  // raita
  const rb = sub(g, 0.115, 0, 0.09);
  put(rb, bowlGeo(0.045, 0.042), ceramic());
  bowlFill(rb, 0.045, 0.042, 0.032, 0.005, 0.0006, 4, phys('raita', 0xf6f1e2, 0.45, 0.25));
  const rbits = [];
  for (let i = 0; i < 26; i++) {
    const a = r() * 6.28, rho = Math.sqrt(r()) * 0.028;
    const cu = r() < 0.5;
    rbits.push({ p: [Math.cos(a) * rho, 0.0375 - rho * rho * 3, Math.sin(a) * rho], r: [r() * 3, r() * 3, r() * 3], s: cu ? 0.0026 + r() * 0.0015 : 0.0016 + r() * 0.001, c: cu ? 0x9cc46a : [0xd23a2a, 0xc2315a][(r() * 2) | 0] });
  }
  inst(rb, cached('rbit', () => ico0()), std('rbit', 0xffffff, 0.5), rbits, true);
  inst(rb, leafGeo(), leafMat(), [leafItem(r, [0.002, 0.0385, 0.002], 0.012, 0.6, 0.2, 0x3f8f3a)], true);
  return g;
}

/* ------------------------------------------------------------------ */
/* shared: naan, spirals                                               */
/* ------------------------------------------------------------------ */
function naanTex() {
  return canvasTex('naan', 256, 256, (g, w, h) => {
    const r = rng(9);
    g.fillStyle = '#e4b66c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = r() * w, y = r() * h, rad = 8 + r() * 26;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      const lt = r() < 0.5;
      gr.addColorStop(0, lt ? 'rgba(248,226,170,0.5)' : 'rgba(170,100,40,0.3)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < 46; i++) { // char blisters
      const x = r() * w, y = r() * h, rad = 3 + r() * 9;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(52,24,8,0.95)'); gr.addColorStop(0.55, 'rgba(95,48,16,0.7)'); gr.addColorStop(1, 'rgba(120,70,30,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rad * 1.2, rad, r() * 3, 0, 6.3); g.fill();
    }
    for (let i = 0; i < 60; i++) { // herb flecks
      g.fillStyle = r() < 0.6 ? 'rgba(60,110,40,0.8)' : 'rgba(255,248,230,0.7)';
      g.fillRect(r() * w, r() * h, 1.5 + r() * 2, 1.5 + r() * 2);
    }
  });
}
function naanGeo() {
  return cached('naan', () => {
    const SEG = 44, RINGS = 10, base = 0.07;
    const pos = [], uv = [], idx = [];
    const R = (th) => {
      const d = Math.abs(((th - PI / 2) + PI * 3) % (2 * PI) - PI);
      return base * (1 + 0.95 * Math.exp(-(d * d) / 0.18)) * (1 + 0.04 * wob(Math.cos(th) * 2, Math.sin(th) * 2, 0, 3));
    };
    for (let layer = 0; layer < 2; layer++) {
      for (let i = 0; i <= RINGS; i++) {
        const rho = i / RINGS;
        for (let j = 0; j < SEG; j++) {
          const th = (j / SEG) * 2 * PI;
          const x = Math.cos(th) * rho * R(th), z = Math.sin(th) * rho * R(th);
          let y = 0;
          if (layer === 0) {
            const bl = Math.max(0, wob(x * 130, 0, z * 130, 4) - 0.25);
            y = 0.004 + 0.009 * (1 - rho * rho) * (0.8 + 0.4 * wob(x * 45, 0, z * 45, 6)) + 0.003 * bl * (1 - rho * rho * rho);
          }
          pos.push(x, y, z);
          uv.push(x / 0.28 + 0.5, z / 0.28 + 0.5);
        }
      }
    }
    const off = (RINGS + 1) * SEG;
    for (let i = 0; i < RINGS; i++) for (let j = 0; j < SEG; j++) {
      const j2 = (j + 1) % SEG;
      const a = i * SEG + j, b = i * SEG + j2, c = (i + 1) * SEG + j, d = (i + 1) * SEG + j2;
      idx.push(a, b, c, b, d, c);
      idx.push(off + a, off + c, off + b, off + b, off + c, off + d);
    }
    for (let j = 0; j < SEG; j++) {
      const j2 = (j + 1) % SEG, t = RINGS * SEG + j, t2 = RINGS * SEG + j2;
      idx.push(t, t2, off + t, t2, off + t2, off + t);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  });
}
const naanMat = () => std('naan', 0xffffff, 0.65, 0, { map: naanTex(), side: THREE.DoubleSide });

function spiralGeo(key, turns, r0, r1, tubeR, flat = 0.55) {
  return cached('spiral' + key, () => {
    const pts = [];
    const n = 70;
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = t * turns * 2 * PI;
      const rad = r0 + (r1 - r0) * t;
      pts.push(new V3(Math.cos(a) * rad, 0, Math.sin(a) * rad));
    }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, tubeR, 6, false);
    g.scale(1, flat, 1);
    return g;
  });
}
function planarUV(g, w, d) {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / w + 0.5; uv[i * 2 + 1] = p.getZ(i) / d + 0.5; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/* ------------------------------------------------------------------ */
/* 4. chicken karahi                                                   */
/* ------------------------------------------------------------------ */
const ironMat = () => std('karahiIron', 0x2b2725, 0.42, 0.75);
// glossy masala with the oil that has risen and pooled round the edge
function oilyGravy(key, R, y, deep, bright, oil, seed) {
  return cached(key, () => paint(surface(R, y, 0.003, 0.0013, seed, 9, 40, 0.001), (v, c) => {
    const rr = Math.hypot(v.x, v.z) / R;
    c.set(deep).lerp(col(bright), clamp(wob(v.x * 50, 0, v.z * 50, seed) * 0.8 + 0.2, 0, 0.8)).lerp(col(oil), clamp((rr - 0.72) * 3 + wob(v.x * 120, 0, v.z * 120, seed + 1) * 0.3, 0, 0.75));
  }));
}
function buildChickenKarahi() {
  const g = new THREE.Group();
  const r = rng(41);
  put(g, cached('bcBoard', () => planarUV(rbox(0.34, 0.018, 0.3, 0.007, 6, 0, 0), 0.34, 0.3)), woodMat());
  const kd = sub(g, -0.07, 0.018, -0.008, 0.6);
  const KR = 0.088, KH = 0.046, GY = 0.034;
  put(kd, bowlGeo(KR, KH, 0.0022), ironMat());
  // loop handles, flat out from the rim and tipped up a little
  const handleG = cached('karahiHandle', () => new THREE.TorusGeometry(0.0135, 0.0028, 6, 18, PI).scale(1, 1.3, 1));
  for (const s of [1, -1]) {
    const hg = sub(kd, s * (KR - 0.002), KH - 0.003, 0, s > 0 ? 0 : PI);
    hg.rotation.z = 0.3;
    put(hg, handleG, ironMat(), 0, 0, 0, PI / 2, 0, -PI / 2);
  }
  put(kd, oilyGravy('karahiGravy', bowlInnerR(KR, KH, GY, 0.0022) + 0.0004, GY, 0x7e220a, 0xb8431a, 0xd9701c, 7), phys('gravy', 0xffffff, 0.2, 1, { vertexColors: true, clearcoatRoughness: 0.06 }));
  // chicken on the bone, coated in masala
  const cgs = [0, 1, 2].map((i) => cached('kChicken' + i, () => paint(lump(0.017, 1.35, 0.75, 1, 0.3, 20 + i, 2), (v, c) => {
    const n = wob(v.x * 240, v.y * 240, v.z * 240, i);
    c.set(0x8a2c10).lerp(col(0xc0561e), clamp(wob(v.x * 80, v.y * 80, v.z * 80, i) * 0.8 + 0.3, 0, 1)).lerp(col(0x3a1408), clamp((n - 0.4) * 2, 0, 0.7));
  })));
  const cm = phys('kChickenV', 0xffffff, 0.35, 0.6, { vertexColors: true });
  const boneG = cached('bone', () => new THREE.CylinderGeometry(0.0032, 0.0042, 0.02, 8).rotateZ(PI / 2));
  const boneM = std('bone', 0xe9dcc0, 0.5);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * 2 * PI + r() * 0.3, rho = i < 7 ? 0.045 + r() * 0.012 : 0.004;
    const p = sub(kd, Math.cos(a) * rho, GY + 0.004, Math.sin(a) * rho, r() * 6.28);
    p.rotation.x = (r() - 0.5) * 0.4;
    put(p, cgs[i % 3], cm, 0, 0, 0, 0, 0, 0, 0.9 + r() * 0.25);
    if (i % 3 === 0) put(p, boneG, boneM, 0.026, 0.002, 0, 0, 0, 0.15);
  }
  // ginger, slit green chillies, coriander, black pepper
  const gj = [];
  for (let i = 0; i < 16; i++) {
    const a = r() * 6.28, rho = Math.sqrt(r()) * 0.05;
    gj.push({ p: [Math.cos(a) * rho, GY + 0.012 + r() * 0.002, Math.sin(a) * rho], r: [(r() - 0.5) * 0.5, r() * 6.28, (r() - 0.5) * 0.5], s: 0.8 + r() * 0.4, c: [0xf1dca0, 0xe8cf8a, 0xf6e6b8][(r() * 3) | 0] });
  }
  inst(kd, gingerGeo(), std('gingerV', 0xffffff, 0.5), gj, true);
  const chG = cached('chiliGreen', () => lump(0.0045, 5, 0.9, 0.9, 0.15, 2, 1));
  [[0.018, -0.02, 0.6], [-0.03, 0.012, 2.2], [0.006, 0.034, 4]].forEach(([x, z, ry]) => put(kd, chG, std('greenChili', 0x3a8a2c, 0.45), x, GY + 0.011, z, 0.1, ry, 0.05));
  const lv = [];
  for (let i = 0; i < 12; i++) {
    const a = r() * 6.28, rho = 0.01 + r() * 0.06;
    lv.push(leafItem(r, [Math.cos(a) * rho, GY + 0.012, Math.sin(a) * rho], 0.011 + r() * 0.006, r() * 6.28, 0.7, [0x3f8f3a, 0x2f7d32, 0x57a846][(r() * 3) | 0]));
  }
  inst(kd, leafGeo(), leafMat(), lv, true);
  const pep = [];
  for (let i = 0; i < 30; i++) { const a = r() * 6.28, rho = Math.sqrt(r()) * 0.07; pep.push({ p: [Math.cos(a) * rho, GY + 0.003, Math.sin(a) * rho], s: 0.0011 + r() * 0.0006 }); }
  inst(kd, ico0(), std('pepper', 0x1a1410, 0.6), pep);
  // roghni naan with sesame
  const nn = sub(g, 0.1, 0.018, -0.03, -0.18);
  nn.rotation.z = 0.06;
  put(nn, naanGeo(), naanMat());
  const ses = [];
  for (let i = 0; i < 70; i++) {
    const a = r() * 6.28, rho = Math.sqrt(r()) * 0.6;
    ses.push({ p: [Math.cos(a) * rho * 0.07, 0.004 + 0.009 * (1 - rho * rho) + 0.0008, Math.sin(a) * rho * 0.07], r: [0, r() * 6.28, 0], s: [0.0019, 0.0006, 0.0011] });
  }
  inst(nn, ico0(), std('sesame', 0xf3e6c4, 0.5), ses);
  return g;
}

/* ------------------------------------------------------------------ */
/* 5. nihari                                                           */
/* ------------------------------------------------------------------ */
function buildNihari() {
  const g = new THREE.Group();
  const r = rng(51);
  put(g, cached('thaliBrass', () => lathe([[0, 0], [0.15, 0], [0.162, 0.004], [0.168, 0.012], [0.17, 0.0138], [0.1675, 0.0152], [0.1655, 0.0138], [0.158, 0.008], [0.14, 0.0045], [0, 0.0045]], 56)), brass());
  const y0 = 0.0045;
  const d = sub(g, -0.04, y0, -0.02);
  const BR = 0.085, BH = 0.07, DY = 0.058;
  put(d, bowlGeo(BR, BH, 0.002), steel());
  put(d, oilyGravy('nihariSurf', bowlInnerR(BR, BH, DY, 0.002) + 0.0004, DY, 0x34100a, 0x5e1e0c, 0x9a3412, 11), phys('nihari', 0xffffff, 0.22, 1, { vertexColors: true, clearcoatRoughness: 0.08 }));
  // slow-cooked shank, half under the gravy
  const meatG = [0, 1].map((i) => cached('nMeat' + i, () => paint(lump(0.022, 1.2, 0.7, 1, 0.28, 70 + i, 2), (v, c) => {
    c.set(0x4a1c0c).lerp(col(0x7a3818), clamp(wob(v.x * 110, v.y * 110, v.z * 110, i) * 0.7 + 0.3, 0, 0.9));
  })));
  const mm = phys('nMeatV', 0xffffff, 0.4, 0.6, { vertexColors: true });
  [[-0.03, -0.02, 0.3], [0.028, -0.032, 2.1], [-0.006, 0.03, 4.2]].forEach(([x, z, ry], i) => put(d, meatG[i % 2], mm, x, DY + 0.002, z, 0.1, ry, 0.05));
  // nalli: marrow bone lying across the bowl
  const nalli = sub(d, 0.03, DY + 0.006, 0.018, -0.7);
  nalli.rotation.z = 0.18;
  put(nalli, cached('nalli', () => lathe([[0, -0.024], [0.0105, -0.024], [0.0125, -0.02], [0.0085, -0.01], [0.0078, 0.01], [0.0095, 0.02], [0.0102, 0.024], [0, 0.024]], 18).rotateZ(PI / 2)), std('nalliBone', 0xe3d2b0, 0.55));
  put(nalli, cached('marrow', () => new THREE.CircleGeometry(0.0062, 16).rotateY(PI / 2)), std('marrow', 0x6e3a20, 0.4), 0.0242, 0, 0);
  // the classic toppings
  const gj = [];
  for (let i = 0; i < 14; i++) {
    const a = r() * 6.28, rho = Math.sqrt(r()) * 0.06;
    gj.push({ p: [Math.cos(a) * rho, DY + 0.006, Math.sin(a) * rho], r: [(r() - 0.5) * 0.4, r() * 6.28, (r() - 0.5) * 0.4], s: 0.8 + r() * 0.4, c: [0xf1dca0, 0xe8cf8a][(r() * 2) | 0] });
  }
  inst(d, gingerGeo(), std('gingerV', 0xffffff, 0.5), gj, true);
  const rings = [];
  for (let i = 0; i < 9; i++) {
    const a = r() * 6.28, rho = 0.02 + r() * 0.045;
    rings.push({ p: [Math.cos(a) * rho, DY + 0.005, Math.sin(a) * rho], r: [PI / 2 + (r() - 0.5) * 0.4, 0, r() * 6.28], s: 0.0038 + r() * 0.001 });
  }
  inst(d, cached('chilliRing', () => new THREE.TorusGeometry(1, 0.32, 5, 12)), std('greenChili', 0x3a8a2c, 0.45), rings);
  const onions = [], oc = [0xc98a2b, 0x8b5a1c, 0xe0aa45, 0x6b3f12];
  for (let i = 0; i < 18; i++) {
    const a = r() * 6.28, rho = Math.sqrt(r()) * 0.06;
    onions.push({ p: [Math.cos(a) * rho, DY + 0.004, Math.sin(a) * rho], r: [(r() - 0.5) * 0.5, r() * 6.28, (r() - 0.5) * 0.5], s: [0.6 + r() * 0.6, 1, 1 + r()], c: oc[(r() * 4) | 0] });
  }
  inst(d, friedOnionGeo(), std('friedOnion', 0xffffff, 0.6), onions, true);
  const lv = [];
  for (let i = 0; i < 9; i++) {
    const a = r() * 6.28, rho = 0.015 + r() * 0.05;
    lv.push(leafItem(r, [Math.cos(a) * rho, DY + 0.009, Math.sin(a) * rho], 0.012 + r() * 0.005, r() * 6.28, 0.6, [0x3f8f3a, 0x57a846, 0x2f7d32][(r() * 3) | 0]));
  }
  inst(d, leafGeo(), leafMat(), lv, true);
  // khameeri roti + lemon on the thali
  const roti = sub(g, 0.098, y0, 0.06, PI);
  roti.scale.setScalar(0.75);
  put(roti, naanGeo(), naanMat());
  lemonWedge(g, -0.098, y0, 0.098, 0.4);
  return g;
}

/* ------------------------------------------------------------------ */
/* 6. gulab jamun                                                      */
/* ------------------------------------------------------------------ */
const petalRoseGeo = () => cached('rosePetal', () => {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(-0.55, 0.25, -0.6, 1.0, -0.1, 1.05);
  s.bezierCurveTo(0.0, 1.12, 0.1, 1.12, 0.1, 1.05);
  s.bezierCurveTo(0.6, 1.0, 0.55, 0.25, 0, 0);
  const g = new THREE.ShapeGeometry(s, 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, 0.35 * p.getX(i) * p.getX(i) + 0.12 * p.getY(i) * p.getY(i));
  g.rotateX(-PI / 2);
  g.computeVertexNormals();
  return g;
});
const _jam = col(0x2c0e06), _jam2 = col(0x6a2a12);
function jamunGeo(i) {
  return cached('jamun' + i, () => paint(lump(0.026, 1, 0.93, 1.04, 0.06, 30 + i, 3), (v, c) => {
    c.copy(_jam).lerp(_jam2, clamp(wob(v.x * 70, v.y * 70, v.z * 70, i) * 0.7 + 0.15 + v.y * 5, 0, 0.8));
  }));
}

function buildGulabJamun() {
  const g = new THREE.Group();
  const r = rng(61);
  put(g, cached('gjPlate', () => lathe([[0, 0], [0.07, 0], [0.1, 0.004], [0.136, 0.0135], [0.14, 0.0158], [0.1385, 0.0168], [0.1365, 0.0158], [0.13, 0.0125], [0.1, 0.0078], [0.05, 0.0058], [0, 0.0058]], 56)), ceramic());
  const y0 = 0.0058;
  const b = sub(g, 0, y0, -0.005);
  const BR = 0.075, BH = 0.055, SY = 0.04;
  put(b, bowlGeo(BR, BH, 0.003), ceramic());
  put(b, cached('gjGold', () => new THREE.TorusGeometry(BR - 0.0012, 0.0012, 5, 48).rotateX(PI / 2)), std('gold', 0xe0b050, 0.3, 1), 0, BH + 0.0004, 0);
  bowlFill(b, BR, BH, SY, 0.002, 0.0006, 7, phys('syrup', 0xc97a10, 0.1, 1, { clearcoatRoughness: 0.04 }), 0.003);
  const jc = [[-0.026, 0.012], [0.027, 0.012], [0.0, -0.033]];
  const jy = 0.0345;
  const _q1 = new THREE.Quaternion(), UP = new V3(0, 1, 0), slivers = [];
  jc.forEach(([x, z], i) => {
    put(b, jamunGeo(i), phys('jamunV', 0xffffff, 0.3, 0.9, { vertexColors: true, clearcoatRoughness: 0.12 }), x, jy, z, r() * 0.3, r() * 6.28, r() * 0.3, 0.97 + r() * 0.08);
    for (let k = 0; k < 7; k++) {
      const n = new V3(r() - 0.5, 0.45 + r() * 0.55, r() - 0.5).normalize();
      _q1.setFromUnitVectors(UP, n);
      const rot = new THREE.Quaternion().setFromAxisAngle(n, r() * 6.28);
      slivers.push({ p: [x + n.x * 0.0255, jy + n.y * 0.0245, z + n.z * 0.0255], q: rot.multiply(_q1.clone()), s: [0.9 + r() * 0.5, 1, 0.8 + r() * 0.5], c: [0x8fb33f, 0xb4d065, 0x6f9a2c][(r() * 3) | 0] });
    }
  });
  for (let k = 0; k < 10; k++) {
    const a = r() * 6.28, rho = 0.045 + r() * 0.015;
    slivers.push({ p: [Math.cos(a) * rho, SY + 0.0016, Math.sin(a) * rho], r: [0, r() * 6.28, 0], s: [1, 1, 1], c: [0x8fb33f, 0xb4d065][(r() * 2) | 0] });
  }
  inst(b, cached('sliver', () => rbox(0.011, 0.002, 0.003, 0.0008, 2)), std('pista', 0xffffff, 0.5), slivers, true);
  // rose petals
  const pm = std('rose', 0xd9486f, 0.45, 0, { side: THREE.DoubleSide });
  put(b, petalRoseGeo(), pm, -0.045, SY + 0.002, 0.03, 0, 0.6, 0, 0.04);
  put(b, petalRoseGeo(), std('rose2', 0xef7b9b, 0.45, 0, { side: THREE.DoubleSide }), 0.03, SY + 0.0022, 0.04, 0.05, -2.4, 0, 0.034);
  put(g, petalRoseGeo(), pm, 0.095, y0 + 0.0008, 0.07, 0.03, 2.2, 0.04, 0.04);
  put(g, petalRoseGeo(), std('rose2', 0xef7b9b, 0.45, 0, { side: THREE.DoubleSide }), 0.1, y0 + 0.0008, 0.045, 0, 0.2, 0, 0.032);
  // brass spoon on the plate
  const sp = sub(g, -0.005, y0, 0.108, 0.08);
  put(sp, cached('spoonBowl', () => lump(0.013, 1.5, 0.28, 1, 0.05, 1, 2)), brass(), -0.04, 0.0035, 0);
  put(sp, cached('spoonHandle', () => rbox(0.07, 0.0028, 0.007, 0.001, 3)), brass(), 0.01, 0.0027, 0);
  return g;
}

/* ------------------------------------------------------------------ */
/* 7. kashmiri chai                                                    */
/* ------------------------------------------------------------------ */
function clayTex() {
  return canvasTex('clay', 128, 128, (g, w, h) => {
    const r = rng(3);
    g.fillStyle = '#c4633a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = r() < 0.5 ? `rgba(120,50,25,${0.1 + r() * 0.25})` : `rgba(235,150,100,${0.08 + r() * 0.2})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 2);
    }
    for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(100,40,20,${0.08 + r() * 0.1})`; g.fillRect(0, r() * h, w, 1 + r() * 3); }
  });
}
const KUL_H = 0.088;
const kulR = (y) => 0.026 + 0.017 * Math.pow(y / KUL_H, 0.9) + 0.0006 * Math.sin(y * 330);
function kulhadGeo() {
  return cached('kulhad', () => {
    const pts = [[0, 0], [0.02, 0], [0.0255, 0.002], [0.0265, 0.006]];
    for (let i = 1; i <= 14; i++) { const y = 0.006 + (KUL_H - 0.006) * (i / 14); pts.push([kulR(y), y]); }
    pts.push([kulR(KUL_H) + 0.0012, KUL_H + 0.0008], [kulR(KUL_H) - 0.0012, KUL_H + 0.0006]);
    for (let i = 13; i >= 1; i--) { const y = 0.008 + (KUL_H - 0.008) * (i / 14); pts.push([kulR(y) - 0.0034, y]); }
    pts.push([0.014, 0.0085], [0, 0.0085]);
    return lathe(pts, 36);
  });
}
const _foam = col(0xf2d6d4), _tea = col(0xc98b92);
function buildKashmiriChai() {
  const g = new THREE.Group();
  const r = rng(71);
  put(g, cached('chaiPlate', () => lathe([[0, 0], [0.06, 0], [0.09, 0.0035], [0.124, 0.012], [0.128, 0.0142], [0.1265, 0.0152], [0.1245, 0.0142], [0.118, 0.0112], [0.09, 0.0068], [0.05, 0.0052], [0, 0.0052]], 56)), ceramic());
  const y0 = 0.0052;
  const k = sub(g, -0.035, y0, -0.03);
  k.scale.setScalar(1.2);
  put(k, kulhadGeo(), std('clay', 0xffffff, 0.92, 0, { map: clayTex() }));
  const TY = 0.077, tr = kulR(TY) - 0.0034 + 0.0004;
  put(k, cached('chaiSurf', () => paint(surface(tr, TY, 0.0008, 0.0003, 2, 6, 32, 0.001), (v, c) => {
    const d = Math.hypot(v.x, v.z) / tr;
    c.copy(_tea).lerp(_foam, clamp((d - 0.55) * 1.6 + wob(v.x * 300, 0, v.z * 300, 1) * 0.3, 0, 0.85));
  })), phys('chai', 0xffffff, 0.45, 0.35, { vertexColors: true }));
  const bub = [];
  for (let i = 0; i < 18; i++) {
    const a = r() * 6.28, rho = (0.55 + r() * 0.4) * tr;
    bub.push({ p: [Math.cos(a) * rho, TY + 0.0008, Math.sin(a) * rho], s: 0.0012 + r() * 0.0014, c: [0xf6dede, 0xeec8c8, 0xfbeaea][(r() * 3) | 0] });
  }
  inst(k, ico0(), phys('bubble', 0xffffff, 0.3, 0.6), bub, true);
  // crushed pistachio and almond on the pink
  const nuts = [];
  for (let i = 0; i < 16; i++) {
    const a = r() * 6.28, rho = Math.sqrt(r()) * tr * 0.7;
    nuts.push({ p: [Math.cos(a) * rho, TY + 0.0012, Math.sin(a) * rho], r: [(r() - 0.5) * 0.3, r() * 6.28, (r() - 0.5) * 0.3], s: [0.55 + r() * 0.3, 1, 0.8 + r() * 0.4], c: i % 3 === 0 ? 0xf1e2c4 : [0x8fb33f, 0xb4d065, 0x6f9a2c][(r() * 3) | 0] });
  }
  inst(k, cached('sliver', () => rbox(0.011, 0.002, 0.003, 0.0008, 2)), std('pista', 0xffffff, 0.5), nuts, true);
  // rusks
  const rusk = cached('ruskGeo', () => paint(rbox(0.07, 0.024, 0.032, 0.007, 5, 0.035, 8), (v, c) => {
    const edge = Math.max(Math.abs(v.x) / 0.035, Math.abs(v.z) / 0.016);
    const top = clamp((v.y + 0.012) / 0.024, 0, 1);
    c.set(0xe2bb7a).lerp(col(0x9a5a1c), clamp(0.4 + top * 0.4 + (edge - 0.5) * 0.5 + wob(v.x * 120, v.y * 120, v.z * 120, 3) * 0.2, 0, 0.95));
  }));
  const rm = std('ruskV', 0xffffff, 0.8, 0, { vertexColors: true });
  put(g, rusk, rm, 0.05, y0 + 0.012, 0.05, 0.03, -0.45, -0.02);
  put(g, rusk, rm, 0.068, y0 + 0.012, -0.012, -0.02, 0.2, 0.03);
  const crumbs = [];
  for (let i = 0; i < 8; i++) crumbs.push({ p: [0.03 + r() * 0.07, y0 + 0.0008, 0.0 + r() * 0.08], r: [r() * 3, r() * 3, r() * 3], s: [0.0016 + r() * 0.001, 0.001, 0.0015], c: 0xc58a3e });
  inst(g, ico0(), std('crumb', 0xffffff, 0.8), crumbs, true);
  // spices
  const pod = cached('cardamom', () => lump(0.0055, 1.6, 0.9, 0.9, 0.08, 4, 2));
  put(g, pod, std('cardamom', 0x93b05a, 0.6), -0.035, y0 + 0.005, 0.07, 0, 0.5, 0);
  put(g, pod, std('cardamom', 0x93b05a, 0.6), -0.02, y0 + 0.005, 0.083, 0, -0.7, 0);
  const star = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * 2 * PI; star.push({ p: [-0.075 + Math.cos(a) * 0.0075, y0 + 0.0025, 0.07 + Math.sin(a) * 0.0075], r: [0, -a, 0], s: [0.0072, 0.0026, 0.0034], c: 0x5a2f18 }); }
  inst(g, cached('starPt', () => smooth(new THREE.IcosahedronGeometry(1, 1))), std('anise', 0xffffff, 0.7), star, true);
  return g;
}

// ==EXPORT==
const BUILDERS = {
  'chicken-tikka': buildChickenTikka,
  'chapli-kebab': buildChapliKebab,
  'biryani': buildBiryani,
  'chicken-karahi': buildChickenKarahi,
  'nihari': buildNihari,
  'gulab-jamun': buildGulabJamun,
  'kashmiri-chai': buildKashmiriChai,
};
export function buildDish(id) {
  const fn = BUILDERS[id];
  if (!fn) throw new Error('buildDish: unknown dish id "' + id + '"');
  const g = fn();
  g.name = id;
  g.userData.dishId = id;
  return g;
}
