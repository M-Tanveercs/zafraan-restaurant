import * as THREE from 'three';
import { OPENINGS, wallWithHoles, archShape } from './exterior.js';
import { MATERIALS as M, TABLE_H, createTable, createChair, createSetting, createCandle, createPendant, createPlant, halo } from './props.js';
import { blobShadow } from './characters.js';

export const ROOM = { x: 5.9, back: -12, h: 3.8 };
export const PASS = new THREE.Vector3(0.7, 0, -10.75); // where the waiter waits for plates

const TABLE_DEFS = [
  { id: 1, x: -3.6, z: -3.2, label: 'Window, left', occupied: true },
  { id: 2, x: 3.6, z: -3.2, label: 'Window seat' },
  { id: 3, x: -3.6, z: -6.4, label: 'Under the mirror' },
  { id: 4, x: 3.6, z: -6.4, label: 'Poster wall', occupied: true },
  { id: 5, x: -3.6, z: -9.4, label: 'Beside the palms' },
  { id: 6, x: 3.6, z: -9.4, label: 'Kitchen view' },
];

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

// Encaustic cement tiles: terracotta rings, teal diamonds on cream.
function tileTexture() {
  const t = canvasTex(512, 512, (g) => {
    for (let ty = 0; ty < 2; ty++) {
      for (let tx = 0; tx < 2; tx++) {
        const ox = tx * 256;
        const oy = ty * 256;
        g.save();
        g.translate(ox, oy);
        g.beginPath();
        g.rect(0, 0, 256, 256);
        g.clip();
        g.fillStyle = '#e8dcc2';
        g.fillRect(0, 0, 256, 256);
        for (const [cx, cy] of [[0, 0], [256, 0], [0, 256], [256, 256]]) {
          g.fillStyle = '#a5532f';
          g.beginPath();
          g.arc(cx, cy, 78, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#e8dcc2';
          g.beginPath();
          g.arc(cx, cy, 56, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#c98b45';
          g.beginPath();
          g.arc(cx, cy, 24, 0, Math.PI * 2);
          g.fill();
        }
        g.translate(128, 128);
        g.rotate(Math.PI / 4);
        g.fillStyle = '#24504c';
        g.fillRect(-46, -46, 92, 92);
        g.fillStyle = '#e8dcc2';
        g.fillRect(-20, -20, 40, 40);
        g.restore();
        g.strokeStyle = 'rgba(60,40,30,0.35)';
        g.lineWidth = 2;
        g.strokeRect(ox + 1, oy + 1, 254, 254);
      }
    }
    // a little wear
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = `rgba(80,60,40,${Math.random() * 0.05})`;
      g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function posterTexture(kind) {
  return canvasTex(300, 420, (g, w, h) => {
    if (kind === 'chai') {
      g.fillStyle = '#d9962f';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#7a2a1c';
      g.beginPath();
      g.moveTo(95, 150); g.lineTo(205, 150); g.lineTo(188, 280); g.lineTo(112, 280); g.closePath();
      g.fill();
      g.fillStyle = '#f3e3c4';
      g.fillRect(95, 150, 110, 14);
      g.strokeStyle = '#f3e3c4';
      g.lineWidth = 5;
      for (const x of [130, 150, 170]) {
        g.beginPath();
        g.moveTo(x, 135); g.bezierCurveTo(x - 14, 115, x + 14, 95, x, 70);
        g.stroke();
      }
      g.fillStyle = '#1e2a2a';
      g.textAlign = 'center';
      g.font = 'italic 600 40px Fraunces, Georgia, serif';
      g.fillText('Doodh patti,', w / 2, 340);
      g.fillText('any hour.', w / 2, 384);
    } else {
      g.fillStyle = '#24504c';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#e8dcc2';
      g.beginPath();
      g.moveTo(70, 360); g.lineTo(70, 180); g.quadraticCurveTo(70, 90, 150, 60); g.quadraticCurveTo(230, 90, 230, 180); g.lineTo(230, 360); g.closePath();
      g.fill();
      g.strokeStyle = '#2f5a35';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(150, 350); g.quadraticCurveTo(140, 240, 150, 130);
      g.stroke();
      g.fillStyle = '#4a7a3c';
      for (let i = 0; i < 7; i++) {
        const y = 150 + i * 28;
        for (const s of [-1, 1]) {
          g.save();
          g.translate(148, y);
          g.rotate(s * (0.9 - i * 0.04));
          g.beginPath();
          g.ellipse(0, -30, 9, 32, 0, 0, Math.PI * 2);
          g.fill();
          g.restore();
        }
      }
      g.fillStyle = '#c47f16';
      g.beginPath();
      g.arc(150, 112, 16, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function buildRoom(group) {
  const plaster = new THREE.MeshStandardMaterial({ color: 0xe0c49a, roughness: 0.95 });
  const plasterDS = plaster.clone();
  plasterDS.side = THREE.DoubleSide;
  const teal = new THREE.MeshStandardMaterial({ color: 0x24504c, roughness: 0.7 });
  const ceilingWood = new THREE.MeshStandardMaterial({ color: 0x3a281c, roughness: 0.8 });

  const tiles = tileTexture();
  tiles.repeat.set(ROOM.x * 2 / 0.8, -ROOM.back / 0.8);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.x * 2, -ROOM.back), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.55 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.003, ROOM.back / 2);
  group.add(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.x * 2, -ROOM.back), ceilingWood);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, ROOM.h, ROOM.back / 2);
  group.add(ceil);
  for (let z = -1.2; z > ROOM.back; z -= 2.2) group.add(box(ROOM.x * 2, 0.2, 0.18, M.wood, 0, ROOM.h - 0.1, z));

  // Side walls
  for (const s of [-1, 1]) {
    group.add(box(0.3, ROOM.h, -ROOM.back, plaster, s * (ROOM.x + 0.15), ROOM.h / 2, ROOM.back / 2));
    group.add(box(0.04, 1.1, -ROOM.back, teal, s * (ROOM.x - 0.02), 0.55, ROOM.back / 2));
    group.add(box(0.06, 0.05, -ROOM.back, M.brass, s * (ROOM.x - 0.03), 1.12, ROOM.back / 2));
    for (let z = -0.8; z > ROOM.back + 0.4; z -= 1.1) group.add(box(0.05, 0.75, 0.8, teal, s * (ROOM.x - 0.04), 0.55, z - 0.4));
  }

  // Inside face of the front wall (matches the facade openings)
  const front = new THREE.Mesh(new THREE.ShapeGeometry(wallWithHoles(-ROOM.x, ROOM.x, 0, ROOM.h, Object.values(OPENINGS)), 24), plasterDS);
  front.position.z = -0.302;
  group.add(front);

  // Back wall with the kitchen pass
  const passHole = [-2.2, 2.2, 1.1, 2.3, 0.35];
  const backShape = wallWithHoles(-ROOM.x, ROOM.x, 0, ROOM.h, [passHole]);
  const backWall = new THREE.Mesh(new THREE.ExtrudeGeometry(backShape, { depth: 0.3, bevelEnabled: false, curveSegments: 20 }), plaster);
  backWall.position.z = ROOM.back - 0.3;
  group.add(backWall);
  for (const x of [-4.05, 4.05]) group.add(box(3.7, 1.1, 0.04, teal, x, 0.55, ROOM.back + 0.02));
  const passFrame = archShape(passHole[0] - 0.08, passHole[1] + 0.08, passHole[2] - 0.02, passHole[3], passHole[4] + 0.08);
  passFrame.holes.push(archShape(...passHole));
  const pf = new THREE.Mesh(new THREE.ExtrudeGeometry(passFrame, { depth: 0.05, bevelEnabled: false, curveSegments: 20 }), M.brass);
  pf.position.z = ROOM.back;
  group.add(pf);

  // Pass counter
  group.add(box(4.8, 1.05, 0.6, teal, 0, 0.525, ROOM.back + 0.32));
  group.add(box(5.0, 0.05, 0.72, M.marble, 0, 1.075, ROOM.back + 0.3));
  group.add(box(4.8, 0.04, 0.04, M.brass, 0, 0.98, ROOM.back + 0.63));
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.brass);
  bell.position.set(1.6, 1.1, ROOM.back + 0.4);
  group.add(bell);

  // Kitchen behind the pass
  const kz = ROOM.back - 0.3;
  const subway = canvasTex(256, 256, (g) => {
    g.fillStyle = '#9aa29c';
    g.fillRect(0, 0, 256, 256);
    for (let r = 0; r < 8; r++) {
      for (let c = -1; c < 4; c++) {
        g.fillStyle = '#eef0ea';
        g.fillRect(c * 64 + (r % 2) * 32 + 2, r * 32 + 2, 60, 28);
      }
    }
  });
  subway.wrapS = subway.wrapT = THREE.RepeatWrapping;
  subway.repeat.set(5, 3);
  const kitchenWall = new THREE.MeshStandardMaterial({ map: subway, roughness: 0.4, emissive: 0x3a2a18, emissiveIntensity: 0.6 });
  group.add(box(6, ROOM.h, 0.1, kitchenWall, 0, ROOM.h / 2, kz - 2.3));
  for (const s of [-1, 1]) group.add(box(0.1, ROOM.h, 2.3, kitchenWall, s * 3, ROOM.h / 2, kz - 1.15));
  const kFloor = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.3), new THREE.MeshStandardMaterial({ color: 0x6d6a64, roughness: 0.6 }));
  kFloor.rotation.x = -Math.PI / 2;
  kFloor.position.set(0, 0.001, kz - 1.15);
  group.add(kFloor);
  group.add(box(6, 0.05, 2.3, ceilingWood, 0, ROOM.h, kz - 1.15));
  // range + shelf with copper pots
  group.add(box(4.4, 0.95, 0.7, M.steel, 0, 0.475, kz - 1.9));
  group.add(box(4.4, 0.04, 0.3, M.wood, 0, 2.35, kz - 2.1));
  const copper = new THREE.MeshStandardMaterial({ color: 0xb8673a, roughness: 0.3, metalness: 1 });
  for (let i = 0; i < 7; i++) {
    const r = 0.1 + (i % 3) * 0.035;
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, r * 1.4, 18), copper);
    pot.position.set(-1.9 + i * 0.63, 2.37 + r * 0.7, kz - 2.1);
    group.add(pot);
  }
  for (let i = 0; i < 5; i++) {
    const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.08, 18), copper);
    pan.position.set(-1.6 + i * 0.8, 1.6 + (i % 2) * 0.12, kz - 2.2);
    pan.rotation.x = Math.PI / 2;
    group.add(pan);
  }
  for (const x of [-1, 1]) {
    const lamp = createPendant(0.9);
    lamp.position.set(x, ROOM.h, kz - 0.5);
    group.add(lamp);
  }

  // Wall decor: arched mirrors (left), posters (right)
  const mirrorMat = new THREE.MeshStandardMaterial({ color: 0xbfb6a6, roughness: 0.08, metalness: 1 });
  for (const z of [-4.8, -7.9]) {
    const shape = archShape(-0.55, 0.55, 1.35, 2.55, 0.55);
    const mirror = new THREE.Mesh(new THREE.ShapeGeometry(shape, 20), mirrorMat);
    const fr = archShape(-0.63, 0.63, 1.27, 2.55, 0.63);
    fr.holes.push(archShape(-0.55, 0.55, 1.35, 2.55, 0.55));
    const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(fr, { depth: 0.04, bevelEnabled: false, curveSegments: 20 }), M.brass);
    const holder = new THREE.Group();
    holder.add(mirror, frame);
    mirror.position.z = 0.01;
    holder.rotation.y = Math.PI / 2;
    holder.position.set(-ROOM.x + 0.01, 0, z);
    group.add(holder);
  }
  [['chai', -4.8], ['botanical', -7.9]].forEach(([kind, z]) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.26), new THREE.MeshStandardMaterial({ map: posterTexture(kind), roughness: 0.8 }));
    const frame = box(0.04, 1.4, 1.04, M.wood, 0.0, 0, 0);
    const holder = new THREE.Group();
    p.rotation.y = -Math.PI / 2;
    p.position.x = -0.025;
    holder.add(frame, p);
    holder.position.set(ROOM.x - 0.03, 2.0, z);
    group.add(holder);
  });

  // Plants
  for (const [x, z, h, s] of [[-5.3, -11.3, 1.9, 2], [5.3, -11.3, 1.7, 5], [-5.35, -0.9, 1.2, 9], [5.35, -0.9, 1.3, 4], [-5.35, -9.4, 1.6, 6]]) {
    const p = createPlant(h, s);
    p.position.set(x, 0, z);
    group.add(p);
    const sh = blobShadow(0.9, 0.8);
    sh.position.set(x, 0.012, z);
    group.add(sh);
  }
}

function fan() {
  const g = new THREE.Group();
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 6), M.iron);
  rod.position.y = -0.22;
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.12, 16), M.brass);
  motor.position.y = -0.5;
  const blades = new THREE.Group();
  blades.position.y = -0.52;
  for (let i = 0; i < 4; i++) {
    const b = box(0.7, 0.012, 0.13, M.wood, 0.45, 0, 0);
    const arm = new THREE.Group();
    arm.rotation.y = (i * Math.PI) / 2;
    b.rotation.x = 0.12;
    arm.add(b);
    blades.add(arm);
  }
  g.add(rod, motor, blades);
  g.userData.blades = blades;
  return g;
}

export function buildInterior() {
  const group = new THREE.Group();
  buildRoom(group);

  const fans = [];
  for (const z of [-4.8, -8.0]) {
    const f = fan();
    f.position.set(0, ROOM.h, z);
    group.add(f);
    fans.push(f.userData.blades);
  }

  const ringMat = new THREE.MeshBasicMaterial({ color: 0xf0b14a, transparent: true, opacity: 0, depthWrite: false });
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });

  const tables = TABLE_DEFS.map((def) => {
    const center = new THREE.Vector3(def.x, 0, def.z);
    const d = new THREE.Vector3(Math.sign(def.x), 0, 0); // toward the wall: the guest's side
    const side = new THREE.Vector3(0, 0, 1);
    const t = { ...def, occupied: !!def.occupied, center, d, side };

    const table = createTable();
    table.position.copy(center);
    group.add(table);
    const sh = blobShadow(1.5, 0.75);
    sh.position.set(def.x, 0.011, def.z);
    group.add(sh);

    const mkChair = (dir) => {
      const c = createChair();
      c.position.copy(center).addScaledVector(dir, 0.74);
      c.rotation.y = Math.atan2(-dir.x, -dir.z);
      group.add(c);
      return c;
    };
    t.guestChair = mkChair(d);
    t.otherChair = mkChair(d.clone().negate());

    const candle = createCandle();
    candle.position.copy(center).addScaledVector(d, -0.34);
    candle.position.y = TABLE_H;
    group.add(candle);
    for (const dir of [d, d.clone().negate()]) {
      const s = createSetting();
      s.position.copy(center).addScaledVector(dir, 0.3);
      s.position.y = TABLE_H;
      s.getObjectByName('glass').position.set(dir.x * 0.02, 0, 0.24);
      s.getObjectByName('napkin').position.set(dir.x * 0.04, 0.006, -0.25);
      group.add(s);
    }

    const pendant = createPendant(1.35);
    pendant.position.set(def.x, ROOM.h, def.z);
    group.add(pendant);

    if (!t.occupied) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.07, 72), ringMat.clone());
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(def.x, 0.02, def.z);
      group.add(ring);
      const glow = halo(2.4, 0xf0b14a, 0);
      glow.position.set(def.x, 0.9, def.z);
      group.add(glow);
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 1.4, 16), hitMat);
      hit.position.set(def.x, 0.7, def.z);
      hit.userData.tableId = def.id;
      group.add(hit);
      t.ring = ring;
      t.glow = glow;
      t.hit = hit;
    }
    return t;
  });

  const lights = [
    [-3.6, -4.6],
    [3.6, -4.6],
    [0, -9.4],
  ].map(([x, z]) => {
    const l = new THREE.PointLight(0xffbd73, 14, 11, 1.4);
    l.position.set(x, 2.9, z);
    group.add(l);
    return l;
  });

  return {
    group,
    tables,
    lights,
    update(t, dt) {
      for (const b of fans) b.rotation.y += dt * 2.2;
    },
  };
}
