// Dev-only page for checking the people and their poses: /people-lab.html?pose=sit&cam=front
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Character, PEOPLE, loadPeople } from './scene/characters.js';
import { createChair, createMenuBook, createTray } from './scene/props.js';

const params = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a211b);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;
scene.add(new THREE.HemisphereLight(0xffe0b5, 0x3a281c, 0.8));
const key = new THREE.DirectionalLight(0xfff0dd, 1.6);
key.position.set(2, 4, 3);
scene.add(key);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x5a4335 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 100);
await loadPeople();
const people = [];
const names = (params.get('who') ?? 'guest,waiter,chef,dinerA,dinerB,dinerC,dinerD').split(',');
names.forEach((n, i) => {
  const c = new Character(PEOPLE[n]);
  c.root.position.x = (i - (names.length - 1) / 2) * 0.9;
  scene.add(c.root);
  people.push(c);
});
const pose = params.get('pose');
for (const c of people) {
  if (pose === 'sit') {
    c.pose.sit = 1;
    const chair = createChair?.();
    if (chair) {
      chair.position.copy(c.root.position).add(new THREE.Vector3(0, 0, -0.04));
      scene.add(chair);
    }
  }
  if (pose === 'walk') { c.pose.walk = 1; c.pose.phase = +(params.get('phase') ?? 1.2); }
  // ?poses=wait,read,reachR — one pose per person, left to right
  const multi = params.get('poses')?.split(',');
  if (multi) c.pose[multi[people.indexOf(c)]] = 1;
  if (pose && pose in c.pose && pose !== 'sit' && pose !== 'walk') c.pose[pose] = 1;
  if (params.get('sit')) c.pose.sit = 1;
  // same prop offsets as experience.js, to check the hands meet them
  if (pose === 'carryL') {
    const tray = createTray();
    tray.position.set(0.27, 1.31, 0.42);
    c.root.add(tray);
  }
  if (pose === 'holdR') {
    const book = createMenuBook();
    book.rotation.order = 'YXZ';
    book.userData.setOpen(0);
    book.position.set(-0.08, 1.33, 0.165);
    book.rotation.set(Math.PI / 2 - 0.12, 0, 0);
    c.root.add(book);
  }
  if (pose === 'read') {
    // where experience.bookHeld() puts the open menu, in the seated guest's space
    c.pose.sit = 1;
    const book = createMenuBook();
    book.rotation.order = 'YXZ';
    book.userData.setOpen(1);
    book.position.set(0, 0.98, 0.37);
    book.rotation.set(0.95, Math.PI, 0);
    c.root.add(book);
  }
  c.applyPose(0);
}
const camMode = params.get('cam') ?? 'front';
const dist = 3.2 + names.length * 0.9;
const ang = { front: 0, side: Math.PI / 2, back: Math.PI, q: 0.6 }[camMode] ?? 0;
const h = +(params.get('h') ?? 1.0);
camera.position.set(Math.sin(ang) * dist, h + 0.3, Math.cos(ang) * dist);
camera.lookAt(0, h * 0.85, 0);
if (params.get('zoom')) {
  camera.position.set(Math.sin(ang) * 1.3 + people[0].root.position.x, 1.6, Math.cos(ang) * 1.3);
  camera.lookAt(people[0].root.position.x, 1.5, 0);
}
renderer.render(scene, camera);
window.__lab = { people, scene, camera, renderer, THREE, render: () => renderer.render(scene, camera) };
