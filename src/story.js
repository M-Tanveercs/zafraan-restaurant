import * as THREE from 'three';

// Scroll progress p (0..1) drives the whole arrival: the guest waits on the pavement,
// walks to Zafraan's door, pushes it open and steps into the dining room.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

// Camera keyframes: [p, position, look-at, fov]
const KEYS = [
  [0.0, V(-5.2, 1.7, 12.5), V(-0.6, 2.7, 0), 44],
  [0.12, V(-5.0, 1.5, 8.2), V(-2.8, 1.25, 2.8), 44],
  [0.28, V(-2.8, 1.6, 6.6), V(-0.9, 1.35, 1.6), 44],
  [0.4, V(0.9, 1.75, 4.8), V(0, 1.55, 0), 46],
  [0.52, V(0.5, 1.75, 3.6), V(0, 1.6, -1.5), 48],
  [0.64, V(0.35, 1.8, 2.3), V(0, 1.45, -4), 50],
  [0.76, V(0.3, 1.95, 0.5), V(-0.4, 1.15, -6), 52],
  [0.84, V(0, 2.5, -1.2), V(-0.6, 0.9, -7), 54],
  [0.92, V(-2.7, 2.55, -1.0), V(0.4, 0.45, -7.3), 56],
  [1.0, V(-5.1, 2.3, -0.8), V(1.1, 0.3, -7.5), 56],
];

const posCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => k[1]), false, 'centripetal');
const tgtCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => k[2]), false, 'centripetal');

function keyT(p) {
  // map p onto the curve parameter so each key lands exactly on its p
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i][0];
    const b = KEYS[i + 1][0];
    if (p <= b) {
      const f = (p - a) / (b - a);
      return { t: (i + f) / (KEYS.length - 1), i, f };
    }
  }
  return { t: 1, i: KEYS.length - 2, f: 1 };
}

export const GUEST_END = V(0, 0, -2.3);
const guestCurve = new THREE.CatmullRomCurve3([V(-3.4, 0, 3.2), V(-1.7, 0, 2.5), V(-0.15, 0, 1.55), V(0, 0, 0.2), V(0, 0, -1.3), GUEST_END], false, 'centripetal');
const GUEST_LEN = guestCurve.getLength();

// u where the guest stops in front of the door (z ≈ 1.2)
let PAUSE_U = 0.5;
for (let u = 0; u <= 1; u += 0.002) {
  if (guestCurve.getPointAt(u).z <= 1.2) {
    PAUSE_U = u;
    break;
  }
}

function guestU(p) {
  if (p < 0.12) return 0;
  if (p < 0.4) return lerp(0, PAUSE_U, (p - 0.12) / 0.28);
  if (p < 0.52) return PAUSE_U;
  if (p < 0.84) return lerp(PAUSE_U, 1, (p - 0.52) / 0.32);
  return 1;
}

const tmp = V(0, 0, 0);

export function createStory({ cam, guest, setDoor, setInside }) {
  let lastArc = 0;

  return {
    apply(p, dt) {
      const { t } = keyT(p);
      cam.pos.copy(posCurve.getPoint(t));
      cam.target.copy(tgtCurve.getPoint(t));
      const { i, f } = keyT(p);
      cam.fov = lerp(KEYS[i][3], KEYS[i + 1][3], f);

      // Guest
      const u = guestU(p);
      guestCurve.getPointAt(u, tmp);
      guest.root.position.set(tmp.x, 0, tmp.z);
      const tan = guestCurve.getTangentAt(Math.min(u, 0.999));
      let yaw = Math.atan2(tan.x, tan.z);
      // before setting off they face the restaurant; at the end they look into the room
      const faceShop = Math.PI * 0.92;
      yaw = lerpAngle(faceShop, yaw, smooth(0.05, 0.13, p));
      yaw = lerpAngle(yaw, Math.PI * 1.04, smooth(0.86, 0.96, p));
      guest.setYaw(yaw);

      const arc = u * GUEST_LEN;
      const speed = dt > 0 ? Math.abs(arc - lastArc) / dt : 0;
      lastArc = arc;
      guest.pose.phase = (arc / 1.4) * Math.PI * 2;
      const k = 1 - Math.exp(-10 * dt);
      guest.pose.walk += (Math.min(speed / 0.5, 1) - guest.pose.walk) * k;
      // push the door open, then glance around the room
      guest.pose.reachR = Math.max(0, smooth(0.4, 0.45, p) - smooth(0.5, 0.56, p));
      guest.pose.headYaw = Math.sin(smooth(0.86, 1, p) * Math.PI * 2) * 0.45;
      guest.pose.headPitch = -0.08 * smooth(0.0, 0.08, p) * (1 - smooth(0.1, 0.14, p));

      setDoor(smooth(0.42, 0.54, p));
      setInside(smooth(0.56, 0.76, p));
    },
  };
}

function lerpAngle(a, b, t) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}
