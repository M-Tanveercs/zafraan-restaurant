import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// Realistic people generated in Blender with MPFB2 (MakeHuman, CC0 assets) on a Mixamo-style
// skeleton: see tools/build_people.py. They ship without animation clips; every pose (walk, sit,
// reach, carry, bow, read) is solved procedurally on the bones each frame.

const STAND_Y = 0.95;
const STRIDE = 1.4; // metres per full walk cycle
const SEAT_HIP = 0.535; // hip-joint height when sitting on a 0.46 m chair seat

const mats = new Map();
function mat(hex, roughness = 0.8, extra = {}) {
  const key = `${hex}-${roughness}-${JSON.stringify(extra)}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color: hex, roughness, ...extra }));
  return mats.get(key);
}

let shadowTex;
export function blobShadowTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)');
  grd.addColorStop(0.55, 'rgba(0,0,0,0.25)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}

export function blobShadow(size = 0.8, opacity = 1) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false, opacity }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.012;
  m.renderOrder = 1;
  return m;
}

// ---------- model library ----------
let library = null;

export async function loadPeople(url = '/models/people.glb') {
  if (library) return library;
  const draco = new DRACOLoader(); // three bundles its own glTF decoder
  const gltf = await new GLTFLoader().setDRACOLoader(draco).loadAsync(url);
  draco.dispose();
  library = {};
  for (const node of gltf.scene.children) library[node.name] = node;
  return library;
}

// glTF materials come in as plain MeshStandardMaterials; tune them by what they are
function dressMaterial(m, part, o) {
  m = m.clone();
  if (part === 'skin') {
    m.color.set(o.skin ?? 0xffffff);
    m.roughness = 0.62;
  } else if (part === 'hair' || part === 'eyebrows' || part === 'eyelashes') {
    if (o.hair != null) m.color.set(o.hair);
    m.transparent = part !== 'hair';
    m.alphaTest = part === 'hair' ? 0.42 : 0.08;
    m.depthWrite = part === 'hair';
    m.side = THREE.DoubleSide;
    m.roughness = 0.7;
  } else if (part === 'eyes') {
    m.roughness = 0.25;
  } else {
    if (o.hue && part === 'cloth') hueShift(m, o.hue);
    m.roughness = 0.88;
  }
  return m;
}

// rotate the hue of a texture in the shader, so two people can share one outfit
function hueShift(m, deg) {
  const a = (deg * Math.PI) / 180;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uHue = { value: a };
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', `uniform float uHue;
vec3 hueShift(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}
void main() {`)
      .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb = max(hueShift(diffuseColor.rgb, uHue), 0.0);');
  };
  m.customProgramCacheKey = () => `hue${deg}`;
}

const BONE = {
  hips: 'Hips', spine0: 'Spine', spine1: 'Spine1', spine2: 'Spine2', neck: 'Neck', head: 'Head',
  armL: 'LeftArm', foreL: 'LeftForeArm', handL: 'LeftHand',
  armR: 'RightArm', foreR: 'RightForeArm', handR: 'RightHand',
  thighL: 'LeftUpLeg', shinL: 'LeftLeg', footL: 'LeftFoot',
  thighR: 'RightUpLeg', shinR: 'RightLeg', footR: 'RightFoot',
};

const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
function dampAngle(a, b, k, dt) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-k * dt));
}
const angleDiff = (a, b) => Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const ID = new THREE.Quaternion();
const qe = (x, y, z, out = new THREE.Quaternion()) => out.setFromEuler(_e.set(x, y, z));

export class Character {
  constructor(o) {
    const root = (this.root = new THREE.Group());
    root.name = o.name ?? 'person';

    const src = library?.[o.model];
    if (!src) throw new Error(`people model "${o.model}" is not loaded`);
    const model = (this.model = cloneSkinned(src));
    model.position.set(0, 0, 0);
    root.add(model);

    const bones = {};
    model.traverse((n) => {
      // "mixamorig:LeftArm" arrives as "mixamorigLeftArm_3" (sanitised + de-duplicated)
      if (n.isBone) bones[n.name.replace(/^mixamorig:?/, '').replace(/_\d+$/, '')] = n;
      if (n.isMesh) {
        // material names survive the glTF round trip as "<person>.<part>"
        const part = n.material.name.split('.')[1] ?? 'cloth';
        n.material = dressMaterial(n.material, part, o);
        n.frustumCulled = false;
        if (part === 'eyebrows' || part === 'eyelashes') n.renderOrder = 2;
      }
    });
    this.bones = bones;

    // rest pose, measured in the character's own space (root at the origin, unrotated)
    model.updateMatrixWorld(true);
    this.rest = new Map();
    const order = [];
    model.traverse((n) => {
      if (!n.isBone) return;
      order.push(n);
      this.rest.set(n, { q0: n.quaternion.clone(), w0: n.getWorldQuaternion(new THREE.Quaternion()), p0: n.position.clone() });
    });
    this.order = order;
    this.worldQ = new Map(order.map((b) => [b, new THREE.Quaternion()]));
    this.modelQ = model.quaternion.clone();

    const j = (this.j = {});
    for (const [k, name] of Object.entries(BONE)) j[k] = bones[name];
    const pos = (b) => b.getWorldPosition(new THREE.Vector3());

    // arms hang from an A-pose: find the rotations that let them fall naturally at the sides
    this.neutral = new Map();
    for (const [s, L] of [[1, 'L'], [-1, 'R']]) {
      const arm = j['arm' + L], fore = j['fore' + L], hand = j['hand' + L];
      const dA = pos(fore).sub(pos(arm)).normalize();
      const dF = pos(hand).sub(pos(fore)).normalize();
      const nA = new THREE.Quaternion().setFromUnitVectors(dA, new THREE.Vector3(s * 0.1, -1, -0.02).normalize());
      const nF = new THREE.Quaternion()
        .setFromUnitVectors(dF.clone().applyQuaternion(nA), new THREE.Vector3(s * 0.05, -1, 0.09).normalize())
        .multiply(nA);
      this.neutral.set(arm, nA);
      this.neutral.set(fore, nF);
      this.neutral.set(hand, nF);
    }

    // per-character pelvis offset: world up/forward expressed in the hips' parent space
    const hips = j.hips;
    const parent = hips.parent;
    const p0w = pos(hips);
    const toLocal = (v) => parent.worldToLocal(p0w.clone().add(v)).sub(parent.worldToLocal(p0w.clone()));
    this.hipUp = toLocal(new THREE.Vector3(0, 1, 0));
    this.hipFwd = toLocal(new THREE.Vector3(0, 0, 1));
    this.hipH = p0w.y;
    // drop just enough to land the pelvis on a 0.46 m seat, whatever this person's height
    this.sitDrop = Math.max(0.2, this.hipH - SEAT_HIP);
    this.fingers = new Set(order.filter((b) => /Hand(Index|Middle|Ring|Pinky)/.test(b.name)));

    // optional extras that ride on bones
    if (o.apron) {
      const g = new THREE.CylinderGeometry(0.2, 0.27, 0.62, 18, 1, true, -1.05, 2.1);
      g.translate(0, -0.3, 0);
      const apron = new THREE.Mesh(g, mat(o.apron, 0.9, { side: THREE.DoubleSide }));
      this.attach('hips', apron, [0, 0.08, 0.005]);
      this.apron = apron;
    }
    if (o.chefHat) {
      const hat = new THREE.Group();
      const white = mat(0xf4f1ea, 0.9);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.07, 24), white);
      const puff = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.16, 24), white);
      puff.position.y = 0.11;
      hat.add(band, puff);
      this.attach('head', hat, [0, 0.165, -0.015], [-0.12, 0, 0]);
    }

    this.shadow = blobShadow(0.85);
    root.add(this.shadow);

    this.pose = { walk: 0, phase: 0, sit: 0, reachR: 0, reachL: 0, carryL: 0, holdR: 0, read: 0, wait: 0, bow: 0, headYaw: 0, headPitch: 0, talk: 0 };
    this.seed = o.seed ?? Math.random() * 10;
    this.yaw = 0;
    this.yawTarget = 0;
    this.path = null;
    this.speed = 1.25;
    this.manual = false; // when true, position/phase are driven externally (scroll story)
    this.idleLook = o.idleLook ?? 0;
    this.knees = o.knees ?? 0.03; // thigh splay when seated (negative = knees together)
    this.applyPose(0);
  }

  // Parent a rigid prop to a bone, positioned in character space (metres, +z forward).
  attach(boneKey, obj, offset = [0, 0, 0], rot = [0, 0, 0]) {
    const bone = this.j[boneKey];
    const r = this.rest.get(bone);
    const holder = new THREE.Group();
    // undo the bone's rest orientation so the prop's axes match the character's
    holder.quaternion.copy(r.w0).invert();
    const s = new THREE.Vector3();
    bone.getWorldScale(s);
    holder.scale.set(1 / s.x, 1 / s.y, 1 / s.z);
    obj.position.fromArray(offset);
    obj.rotation.fromArray(rot);
    holder.add(obj);
    bone.add(holder);
    return holder;
  }

  setYaw(y) {
    this.yaw = this.yawTarget = y;
    this.root.rotation.y = y;
  }

  walkTo(points, speed = 1.25) {
    this.stop();
    this.path = points.map((p) => new THREE.Vector3(p.x, 0, p.z));
    this.speed = speed;
    return new Promise((res) => (this._arrive = res));
  }

  turnTo(yaw) {
    this.yawTarget = yaw;
    return new Promise((res) => (this._turned = res));
  }

  face(x, z) {
    return this.turnTo(Math.atan2(x - this.root.position.x, z - this.root.position.z));
  }

  stop() {
    this.path = null;
    const a = this._arrive;
    const t = this._turned;
    this._arrive = this._turned = null;
    a?.();
    t?.();
  }

  update(dt, time) {
    const P = this.pose;
    const pos = this.root.position;

    if (!this.manual) {
      let moving = false;
      if (this.path?.length) {
        const tgt = this.path[0];
        const dx = tgt.x - pos.x;
        const dz = tgt.z - pos.z;
        const dist = Math.hypot(dx, dz);
        const step = this.speed * dt;
        if (dist > 1e-4) this.yawTarget = Math.atan2(dx, dz);
        if (dist <= step) {
          pos.x = tgt.x;
          pos.z = tgt.z;
          this.path.shift();
        } else {
          pos.x += (dx / dist) * step;
          pos.z += (dz / dist) * step;
        }
        P.phase += (Math.min(step, dist) / STRIDE) * Math.PI * 2;
        moving = true;
        if (!this.path.length) {
          this.path = null;
          const a = this._arrive;
          this._arrive = null;
          a?.();
        }
      }
      P.walk = damp(P.walk, moving ? 1 : 0, moving ? 8 : 6, dt);
      this.yaw = dampAngle(this.yaw, this.yawTarget, 7, dt);
      this.root.rotation.y = this.yaw;
      if (this._turned && angleDiff(this.yaw, this.yawTarget) < 0.06) {
        const t = this._turned;
        this._turned = null;
        t();
      }
    }

    this.applyPose(time);
  }

  applyPose(time) {
    const P = this.pose;
    const j = this.j;
    const s = Math.sin(P.phase);
    const c = Math.cos(P.phase);
    const w = P.walk * (1 - P.sit);
    const breathe = Math.sin(time * 1.7 + this.seed) * 0.012;

    // pelvis height (same curve as before, relative to this person's own hip height)
    const dy = -this.sitDrop * P.sit - 0.018 * w + 0.022 * w * Math.cos(P.phase * 2);
    j.hips.position.copy(this.rest.get(j.hips).p0).addScaledVector(this.hipUp, dy).addScaledVector(this.hipFwd, -0.04 * P.sit);

    // world-space deltas per joint, composed like a plain joint hierarchy
    const D = this._D ?? (this._D = {});
    const q = (k) => D[k] ?? (D[k] = new THREE.Quaternion());
    q('hips').copy(qe(0, s * 0.06 * w, 0, _q));
    const spineX = 0.04 * w + breathe + P.bow * 0.45 + P.sit * 0.06 + P.read * 0.12;
    const spine = qe(spineX, -s * 0.1 * w, 0);
    q('spine0').copy(D.hips).multiply(_q.copy(ID).slerp(spine, 0.35));
    q('spine1').copy(D.hips).multiply(_q.copy(ID).slerp(spine, 0.7));
    q('spine2').copy(D.hips).multiply(spine);

    // legs
    const hipL = -s * 0.5 * w - 1.5 * P.sit;
    const hipR = s * 0.5 * w - 1.5 * P.sit;
    const kneeL = w * (0.1 + 0.75 * Math.max(0, c)) + 1.5 * P.sit;
    const kneeR = w * (0.1 + 0.75 * Math.max(0, -c)) + 1.5 * P.sit;
    q('thighL').copy(D.hips).multiply(qe(hipL, 0, this.knees * P.sit, _q));
    q('thighR').copy(D.hips).multiply(qe(hipR, 0, -this.knees * P.sit, _q));
    q('shinL').copy(D.thighL).multiply(qe(kneeL, 0, 0, _q));
    q('shinR').copy(D.thighR).multiply(qe(kneeR, 0, 0, _q));
    q('footL').copy(D.shinL).multiply(qe(-(hipL + kneeL) * 0.7, 0, 0, _q));
    q('footR').copy(D.shinR).multiply(qe(-(hipR + kneeR) * 0.7, 0, 0, _q));
    if (this.apron) this.apron.rotation.x = Math.min(hipL, hipR, 0) * 0.4;

    // arms: base swing, then blended overrides
    const talk = P.talk * Math.sin(time * 2.3 + this.seed) * 0.25;
    let lx = s * 0.42 * w - 0.45 * P.sit;
    let rx = -s * 0.42 * w - 0.45 * P.sit + talk;
    let le = -0.2 - 0.18 * w - 1.1 * P.sit;
    let re = -0.2 - 0.18 * w - 1.1 * P.sit + talk;
    let lz = 0.0;
    let rz = -0.0;
    // forearm twist: palms turn down when resting on the table
    let lt = -1.2 * P.sit;
    // upper-arm inward roll, swings a bent forearm across the body
    let ly = 0;
    let ry = 0;
    let rt = 1.2 * P.sit;

    const blend = (t, a, b) => (t > 0 ? lerp(a, b, t) : a);
    // hands clasped behind the back
    lx = blend(P.wait, lx, 0.55); rx = blend(P.wait, rx, 0.55);
    le = blend(P.wait, le, -0.85); re = blend(P.wait, re, -0.85);
    lz = blend(P.wait, lz, 0.1); rz = blend(P.wait, rz, -0.1);
    ly = blend(P.wait, ly, 1.75); ry = blend(P.wait, ry, 1.75);
    lt = blend(P.wait, lt, -1.3); rt = blend(P.wait, rt, 1.3);
    // reading: both hands up in front of the chest
    lx = blend(P.read, lx, -0.95); rx = blend(P.read, rx, -0.95);
    le = blend(P.read, le, -1.45); re = blend(P.read, re, -1.45);
    lz = blend(P.read, lz, 0.1); rz = blend(P.read, rz, -0.1);
    lt = blend(P.read, lt, -0.9); rt = blend(P.read, rt, 0.9);
    // tray on the left hand
    lx = blend(P.carryL, lx, -0.32); le = blend(P.carryL, le, -1.55); lz = blend(P.carryL, lz, 0.18); lt = blend(P.carryL, lt, 1.4);
    // menu held against the chest
    rx = blend(P.holdR, rx, -0.25); re = blend(P.holdR, re, -1.6); rz = blend(P.holdR, rz, 0.1); ry = blend(P.holdR, ry, 0.9); rt = blend(P.holdR, rt, -1.2);
    // reaching forward
    rt = blend(P.reachR, rt, 0.6);
    rx = blend(P.reachR, rx, -1.25); re = blend(P.reachR, re, -0.25); rz = blend(P.reachR, rz, 0.05);
    lx = blend(P.reachL, lx, -1.25); le = blend(P.reachL, le, -0.25); lz = blend(P.reachL, lz, -0.05);

    q('armL').copy(D.spine2).multiply(qe(lx, -ly, lz, _q));
    q('armR').copy(D.spine2).multiply(qe(rx, ry, rz, _q));
    q('foreL').copy(D.armL).multiply(qe(le, 0, 0, _q)).multiply(qe(0, lt, 0, _q));
    q('foreR').copy(D.armR).multiply(qe(re, 0, 0, _q)).multiply(qe(0, rt, 0, _q));
    q('handL').copy(D.foreL);
    q('handR').copy(D.foreR);
    // fingers close around whatever the hand is holding
    this.curlL = (0.18 + 0.6 * Math.max(P.read, P.wait)) * (1 - P.carryL); // flat palm under the tray
    this.curlR = 0.18 + 0.6 * Math.max(P.read, P.wait, P.holdR);

    const look = this.idleLook ? Math.sin(time * 0.37 + this.seed) * 0.5 * this.idleLook : 0;
    const neck = qe(P.bow * 0.25 + P.headPitch + P.read * 0.25, P.headYaw + look, 0);
    q('neck').copy(D.spine2).multiply(_q.copy(ID).slerp(neck, 0.45));
    q('head').copy(D.spine2).multiply(neck);

    this.solve();
  }

  // turn the per-joint deltas into local bone rotations
  solve() {
    const D = this._D;
    const W = this.worldQ;
    const keyOf = this._keyOf ?? (this._keyOf = new Map(Object.entries(this.j).map(([k, b]) => [b, k])));
    for (const b of this.order) {
      const r = this.rest.get(b);
      const k = keyOf.get(b);
      const parentW = b.parent.isBone ? W.get(b.parent) : this.modelQ;
      const out = W.get(b);
      if (k && D[k]) {
        out.copy(D[k]);
        const n = this.neutral.get(b);
        if (n) out.multiply(n);
        out.multiply(r.w0);
        b.quaternion.copy(parentW).invert().multiply(out);
      } else {
        b.quaternion.copy(r.q0);
        if (this.fingers.has(b)) {
          const curl = b.name.includes('Left') ? this.curlL : this.curlR;
          b.quaternion.multiply(qe(curl ?? 0.18, 0, 0, _q));
        }
        out.copy(parentW).multiply(b.quaternion);
      }
    }
  }
}

// skin: multiplied over a light MakeHuman skin texture; hair tints the hair, brows and lashes
export const PEOPLE = {
  guest: { name: 'guest', model: 'guest', skin: 0xc79a7c, seed: 1.2 },
  waiter: { name: 'waiter', model: 'waiter', skin: 0xb07d5c, apron: 0x6e2130, seed: 2.7 },
  chef: { name: 'chef', model: 'chef', skin: 0xb78462, apron: 0xf1ede4, chefHat: true, idleLook: 0.6, seed: 4.1 },
  dinerA: { name: 'diner', model: 'dinerA', skin: 0xd4a588, knees: -0.06, idleLook: 0.3, seed: 5.5 },
  dinerB: { name: 'diner', model: 'dinerB', skin: 0xb98a68, idleLook: 0.25, seed: 7.9 },
  dinerC: { name: 'diner', model: 'dinerC', skin: 0xc08f6c, hue: 165, knees: -0.06, idleLook: 0.3, seed: 3.3 },
  dinerD: { name: 'diner', model: 'dinerD', skin: 0xcf9f80, idleLook: 0.2, seed: 9.1 },
};
