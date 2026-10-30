import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DISH_IDS, buildDish } from './scene/dishes.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;
scene.add(new THREE.HemisphereLight(0xfff1dc, 0x3a2a20, 0.8));
const key = new THREE.DirectionalLight(0xffd6a0, 2.4);
key.position.set(1.5, 3, 2);
scene.add(key);
scene.background = new THREE.Color(0x2a211b);

const table = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), new THREE.MeshStandardMaterial({ color: 0x5a3a26, roughness: 0.6 }));
table.rotation.x = -Math.PI / 2;
table.position.y = -0.0005;
scene.add(table);

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.02, 20);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = false;

const SPACING = 0.48;
const dishes = [];
const labels = [];
const stats = [];
DISH_IDS.forEach((id, i) => {
  const t0 = performance.now();
  const g = buildDish(id);
  const ms = performance.now() - t0;
  g.position.x = (i - (DISH_IDS.length - 1) / 2) * SPACING;
  scene.add(g);
  dishes.push(g);
  let tris = 0, meshes = 0;
  g.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const geo = o.geometry;
    const n = (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    tris += n * (o.isInstancedMesh ? o.count : 1);
  });
  const t1 = performance.now();
  const again = buildDish(id);
  const warm = performance.now() - t1;
  again.traverse((o) => { if (o.geometry && o.isInstancedMesh) o.dispose?.(); });
  const box = new THREE.Box3().setFromObject(g);
  const size = box.getSize(new THREE.Vector3());
  stats.push({ id, tris: Math.round(tris), meshes, buildMs: +ms.toFixed(1), warmMs: +warm.toFixed(1), w: +size.x.toFixed(3), h: +size.y.toFixed(3), d: +size.z.toFixed(3), minY: +box.min.y.toFixed(4) });
  const el = document.createElement('div');
  el.textContent = id;
  el.style.cssText = 'position:fixed;transform:translate(-50%,0);pointer-events:none;font:12px system-ui;background:#0008;padding:2px 8px;border-radius:9px;white-space:nowrap';
  document.body.appendChild(el);
  labels.push(el);
});
console.table(stats);
console.log('DISH_STATS ' + JSON.stringify(stats));
const info = document.createElement('div');
info.style.cssText = 'position:fixed;left:8px;bottom:8px;font:11px monospace;background:#000a;padding:6px 8px;border-radius:6px;white-space:pre;pointer-events:none';
info.textContent = stats.map((s) => `${s.id.padEnd(15)} ${String(s.tris).padStart(5)} tris  ${s.buildMs}/${s.warmMs}ms  ${s.w}x${s.h}x${s.d}`).join('\n');
document.body.appendChild(info);

function render() {
  renderer.render(scene, camera);
  const v = new THREE.Vector3();
  const focus = currentFocus();
  dishes.forEach((g, i) => {
    v.copy(g.position).setY(0.0).project(camera);
    const el = labels[i];
    const vis = v.z < 1 && (focus < 0 || focus === i);
    el.style.display = vis ? 'block' : 'none';
    el.style.left = (v.x * 0.5 + 0.5) * innerWidth + 'px';
    el.style.top = (-v.y * 0.5 + 0.5) * innerHeight + 10 + 'px';
  });
}

// #id[/az=deg][/el=deg][/d=metres]  -> close-up of one dish;  no hash or #all -> overview
function currentFocus() {
  const id = decodeURIComponent(location.hash.slice(1)).split('/')[0];
  return DISH_IDS.indexOf(id);
}
function frame() {
  const parts = decodeURIComponent(location.hash.slice(1)).split('/');
  const opt = {};
  parts.slice(1).forEach((p) => { const [k, v] = p.split('='); opt[k] = parseFloat(v); });
  const f = currentFocus();
  if (f >= 0) {
    const az = THREE.MathUtils.degToRad(opt.az ?? 0), el = THREE.MathUtils.degToRad(opt.el ?? 38), d = opt.d ?? 0.6;
    const c = dishes[f].position;
    controls.target.set(c.x, 0.04, c.z);
    camera.position.set(c.x + Math.sin(az) * Math.cos(el) * d, 0.04 + Math.sin(el) * d, c.z + Math.cos(az) * Math.cos(el) * d);
  } else {
    controls.target.set(0, 0.03, 0);
    camera.position.set(0, 1.2, 2.3);
  }
  camera.updateProjectionMatrix();
  controls.update();
  render();
}
controls.addEventListener('change', render);
addEventListener('hashchange', frame);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  render();
});
addEventListener('keydown', (e) => {
  const f = currentFocus();
  if (e.key === 'ArrowRight') location.hash = DISH_IDS[(f + 1) % DISH_IDS.length];
  if (e.key === 'ArrowLeft') location.hash = DISH_IDS[(f - 1 + DISH_IDS.length) % DISH_IDS.length];
  if (e.key === 'Escape') location.hash = 'all';
});
frame();
requestAnimationFrame(render);
window.__lab = { render, frame, stats };
