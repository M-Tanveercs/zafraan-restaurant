import * as THREE from 'three';
import { MATERIALS as M, halo, createPlant } from './props.js';

// Zafraan's street front. The facade sits on the plane z = 0 (wall from z = -0.3 to 0),
// the dining room lies behind it (z < 0) and the street in front (z > 0).

export const GROUND_TOP = 4.25;
export const FACADE_T = 0.3;

const C = {
  teal: 0x24504c,
  ochre: 0xc98b45,
  cream: 0xeadcc0,
  ink: 0x141c1f,
};

export function archShape(x0, x1, yb, ys, rise) {
  const s = new THREE.Shape();
  const cx = (x0 + x1) / 2;
  const rx = (x1 - x0) / 2;
  s.moveTo(x0, yb);
  s.lineTo(x1, yb);
  s.lineTo(x1, ys);
  s.absellipse(cx, ys, rx, rise, 0, Math.PI, false);
  s.lineTo(x0, yb);
  return s;
}

export const OPENINGS = {
  door: [-0.95, 0.95, 0, 2.5, 0.95],
  windowL: [-5.0, -1.9, 0.7, 2.5, 0.75],
  windowR: [1.9, 5.0, 0.7, 2.5, 0.75],
};

export function wallWithHoles(x0, x1, y0, y1, holes) {
  const s = new THREE.Shape();
  s.moveTo(x0, y0);
  s.lineTo(x1, y0);
  s.lineTo(x1, y1);
  s.lineTo(x0, y1);
  s.lineTo(x0, y0);
  for (const h of holes) s.holes.push(archShape(...h));
  return s;
}

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

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

function sky() {
  const geo = new THREE.SphereGeometry(90, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x101a2c) },
      mid: { value: new THREE.Color(0x2f3f5c) },
      horizon: { value: new THREE.Color(0xb7785a) },
    },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; varying vec3 vP;
      void main(){ float h = clamp(vP.y, -0.1, 1.0);
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.22, h));
        c = mix(c, top, smoothstep(0.22, 0.75, h));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(geo, mat);
  dome.renderOrder = -1;

  const n = 260;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const y = 0.3 + Math.random() * 0.7;
    const r = Math.sqrt(1 - y * y);
    pos.set([Math.cos(a) * r * 85, y * 85, Math.sin(a) * r * 85], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xf3ead8, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.55, fog: false, depthWrite: false }));

  const moon = halo(9, 0xf4ead6, 0.9);
  moon.position.set(-30, 46, -60);
  const g = new THREE.Group();
  g.add(dome, stars, moon);
  return g;
}

function street() {
  const g = new THREE.Group();
  const paving = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#7b756b';
    x.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      x.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.06})`;
      x.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    }
    x.strokeStyle = 'rgba(40,36,32,0.55)';
    x.lineWidth = 3;
    x.strokeRect(0, 0, w, h);
  });
  paving.wrapS = paving.wrapT = THREE.RepeatWrapping;
  paving.repeat.set(80 / 0.8, 3.9 / 0.8);
  const walk = new THREE.Mesh(new THREE.PlaneGeometry(80, 3.9), new THREE.MeshStandardMaterial({ map: paving, roughness: 0.92 }));
  walk.rotation.x = -Math.PI / 2;
  walk.position.set(0, 0, 1.95);
  g.add(walk);
  g.add(box(80, 0.16, 0.22, new THREE.MeshStandardMaterial({ color: 0x9a958c, roughness: 0.85 }), 0, -0.07, 3.95));

  const road = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), new THREE.MeshStandardMaterial({ color: 0x26272b, roughness: 0.78 }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, -0.14, 24);
  g.add(road);
  const dash = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.7 });
  for (let x = -38; x < 40; x += 4) g.add(box(2, 0.01, 0.14, dash, x, -0.13, 9.2));
  return g;
}

function facade() {
  const g = new THREE.Group();
  const teal = new THREE.MeshStandardMaterial({ color: C.teal, roughness: 0.8 });
  const ochre = new THREE.MeshStandardMaterial({ color: C.ochre, roughness: 0.92 });
  const cream = new THREE.MeshStandardMaterial({ color: C.cream, roughness: 0.85 });
  const extrude = (shape, mat) => {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: FACADE_T, bevelEnabled: false, curveSegments: 24 });
    geo.translate(0, 0, -FACADE_T);
    return new THREE.Mesh(geo, mat);
  };

  g.add(extrude(wallWithHoles(-6, 6, 0, GROUND_TOP, Object.values(OPENINGS)), teal));
  const up = [-3.6, 0, 3.6].map((cx) => [cx - 0.6, cx + 0.6, 4.95, 6.3, 0.6]);
  g.add(extrude(wallWithHoles(-6, 6, GROUND_TOP, 7.8, up), ochre));

  // Mouldings
  g.add(box(12.4, 0.22, 0.42, cream, 0, GROUND_TOP, 0.06));
  g.add(box(12.6, 0.3, 0.5, cream, 0, 7.85, 0.08));
  g.add(box(12.3, 0.12, 0.36, cream, 0, 7.6, 0.04));
  for (const x of [-6.05, 6.05]) g.add(box(0.36, 7.8, 0.4, cream, x, 3.9, 0.02));
  g.add(box(12.2, 0.18, 0.36, cream, 0, 0.09, 0.04));

  // Arch frames (brass) + glass for the shop windows and the door transom
  const frameMat = M.brass;
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x8fb1ad, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.4 });
  for (const key of ['windowL', 'windowR', 'door']) {
    const [x0, x1, yb, ys, rise] = OPENINGS[key];
    const outer = archShape(x0 - 0.06, x1 + 0.06, yb - (key === 'door' ? 0 : 0.06), ys, rise + 0.06);
    outer.holes.push(archShape(x0, x1, yb, ys, rise));
    const fg = new THREE.ExtrudeGeometry(outer, { depth: 0.08, bevelEnabled: false, curveSegments: 24 });
    const frame = new THREE.Mesh(fg, frameMat);
    frame.position.z = 0.0;
    g.add(frame);
    if (key !== 'door') {
      const pane = new THREE.Mesh(new THREE.ShapeGeometry(archShape(x0, x1, yb, ys, rise), 24), glass);
      pane.position.z = -0.12;
      g.add(pane);
      const cx = (x0 + x1) / 2;
      for (const dx of [-(x1 - x0) / 6, (x1 - x0) / 6]) g.add(box(0.04, ys + rise * 0.8 - yb, 0.05, frameMat, cx + dx, (yb + ys + rise * 0.8) / 2, -0.12));
      g.add(box(x1 - x0, 0.04, 0.05, frameMat, cx, ys, -0.12));
      g.add(box(x1 - x0 + 0.3, 0.07, 0.3, cream, cx, yb - 0.05, 0.08));
    } else {
      const transom = new THREE.Mesh(new THREE.CircleGeometry(0.95, 32, 0, Math.PI), glass);
      transom.position.set(0, ys, -0.12);
      g.add(transom);
      g.add(box(1.9, 0.06, 0.12, frameMat, 0, ys + 0.02, -0.1));
      for (let i = 1; i < 6; i++) {
        const a = (i / 6) * Math.PI;
        const bar = box(0.025, 0.95, 0.03, frameMat, Math.cos(a) * 0.475, ys + Math.sin(a) * 0.475, -0.12);
        bar.rotation.z = a - Math.PI / 2;
        g.add(bar);
      }
    }
  }

  // Upper floor: lit rooms behind curtains
  const roomTex = canvasTex(128, 192, (x, w, h) => {
    const grd = x.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#ffcf8f');
    grd.addColorStop(1, '#e79a4c');
    x.fillStyle = grd;
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#7a2a2c';
    x.beginPath();
    x.moveTo(0, 0); x.lineTo(44, 0); x.quadraticCurveTo(30, 110, 10, h); x.lineTo(0, h); x.fill();
    x.beginPath();
    x.moveTo(w, 0); x.lineTo(w - 44, 0); x.quadraticCurveTo(w - 30, 110, w - 10, h); x.lineTo(w, h); x.fill();
  });
  const roomMat = new THREE.MeshBasicMaterial({ map: roomTex, color: 0xb7b7b7 });
  const darkRoom = new THREE.MeshBasicMaterial({ color: 0x1c2328 });
  up.forEach((h, i) => {
    const pane = new THREE.Mesh(new THREE.ShapeGeometry(archShape(...h), 20), i === 1 ? darkRoom : roomMat);
    pane.position.z = -0.2;
    g.add(pane);
    const fr = archShape(h[0] - 0.07, h[1] + 0.07, h[2] - 0.07, h[3], h[4] + 0.07);
    fr.holes.push(archShape(...h));
    g.add(new THREE.Mesh(new THREE.ExtrudeGeometry(fr, { depth: 0.06, bevelEnabled: false, curveSegments: 20 }), cream));
    g.add(box(1.5, 0.08, 0.34, cream, (h[0] + h[1]) / 2, h[2] - 0.08, 0.1));
    // little balcony rail
    g.add(box(1.5, 0.05, 0.05, M.iron, (h[0] + h[1]) / 2, h[2] + 0.45, 0.26));
    for (let k = 0; k < 9; k++) g.add(box(0.02, 0.45, 0.02, M.iron, h[0] - 0.12 + k * 0.18, h[2] + 0.22, 0.26));
  });

  // Signboard
  const signTex = canvasTex(1024, 120, (x, w, h) => {
    x.fillStyle = '#141c1f';
    x.fillRect(0, 0, w, h);
    x.strokeStyle = '#d1a24c';
    x.lineWidth = 3;
    x.strokeRect(8, 8, w - 16, h - 16);
    x.fillStyle = '#e5b55a';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = '600 76px Fraunces, Georgia, serif';
    x.fillText('Zafraan', w / 2, h / 2 + 4);
    x.font = '600 19px Inter, system-ui, sans-serif';
    x.letterSpacing = '5px';
    x.fillText('LAHORI KITCHEN', 200, h / 2 + 2);
    x.fillText('CHAI KHANA', w - 200, h / 2 + 2);
  });
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(5.4, 0.62, 0.08),
    [M.iron, M.iron, M.iron, M.iron, new THREE.MeshStandardMaterial({ map: signTex, emissiveMap: signTex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.5 }), M.iron],
  );
  sign.position.set(0, 3.82, 0.06);
  g.add(sign);

  // Wall lanterns beside the door
  for (const x of [-1.45, 1.45]) {
    const lan = new THREE.Group();
    lan.add(box(0.05, 0.05, 0.22, M.brass, 0, 0.08, 0.11));
    lan.add(box(0.17, 0.28, 0.17, new THREE.MeshBasicMaterial({ color: 0xffd08a }), 0, 0, 0.26));
    lan.add(box(0.21, 0.04, 0.21, M.brass, 0, 0.16, 0.26));
    lan.add(box(0.21, 0.04, 0.21, M.brass, 0, -0.16, 0.26));
    const h = halo(1.1, 0xffb35c, 0.55);
    h.position.set(0, 0, 0.3);
    lan.add(h);
    lan.position.set(x, 2.55, 0);
    g.add(lan);
  }

  // Motia (jasmine) and red-rose garland around the door arch
  const [, , , ys, r] = OPENINGS.door;
  const pts = [];
  for (let y = 1.9; y < ys; y += 0.075) pts.push([-r - 0.02, y]);
  for (let i = 0; i <= 44; i++) {
    const a = Math.PI - (i / 44) * Math.PI;
    pts.push([Math.cos(a) * (r + 0.02), ys + Math.sin(a) * (r + 0.02)]);
  }
  for (let y = ys; y > 1.9; y -= 0.075) pts.push([r + 0.02, y]);
  const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.042, 1), new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), pts.length);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  pts.forEach(([x, y], i) => {
    m4.makeTranslation(x, y, 0.1);
    flowers.setMatrixAt(i, m4);
    flowers.setColorAt(i, col.set(i % 4 === 0 ? 0xb3122a : 0xf4efe2));
  });
  g.add(flowers);

  // Planters
  for (const x of [-1.75, 1.75]) {
    const p = createPlant(1.5, x > 0 ? 3 : 7);
    p.position.set(x, 0, 0.55);
    p.scale.setScalar(0.95);
    g.add(p);
  }
  return g;
}

function door() {
  const teal = new THREE.MeshStandardMaterial({ color: 0x1b3e3b, roughness: 0.6 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x9cbcb6, roughness: 0.08, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  const leaf = (dir) => {
    const hinge = new THREE.Group();
    const w = 0.95;
    const L = new THREE.Group();
    L.position.x = (dir * w) / 2;
    L.add(box(0.1, 2.5, 0.06, teal, -w / 2 + 0.05, 1.25, 0));
    L.add(box(0.1, 2.5, 0.06, teal, w / 2 - 0.05, 1.25, 0));
    L.add(box(w, 0.12, 0.06, teal, 0, 2.44, 0));
    L.add(box(w, 0.5, 0.06, teal, 0, 0.25, 0));
    L.add(box(w, 0.08, 0.06, teal, 0, 1.0, 0));
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.2, 1.3), glass);
    pane.position.set(0, 1.72, 0);
    L.add(pane);
    const kick = box(w - 0.2, 0.06, 0.07, M.brass, 0, 0.12, 0);
    L.add(kick);
    const handle = box(0.03, 0.42, 0.03, M.brass, dir * (w / 2 - 0.14), 1.15, 0.06);
    L.add(handle);
    hinge.add(L);
    return hinge;
  };
  const left = leaf(1);
  left.position.set(-0.95, 0, -0.15);
  const right = leaf(-1);
  right.position.set(0.95, 0, -0.15);
  const g = new THREE.Group();
  g.add(left, right);
  return {
    group: g,
    set(v) {
      const a = v * 1.45;
      left.rotation.y = a;
      right.rotation.y = -a;
    },
  };
}

function neighbours() {
  const g = new THREE.Group();
  const lit = new THREE.MeshBasicMaterial({ color: 0xf1b56a });
  const unlit = new THREE.MeshStandardMaterial({ color: 0x1d2328, roughness: 0.3 });
  const make = (x0, x1, h, color, rows, cols, seed) => {
    const w = x1 - x0;
    const b = box(w, h, 12, new THREE.MeshStandardMaterial({ color, roughness: 0.92 }), (x0 + x1) / 2, h / 2, -6);
    g.add(b);
    g.add(box(w + 0.2, 0.25, 0.3, new THREE.MeshStandardMaterial({ color: 0xd8ccb4, roughness: 0.9 }), (x0 + x1) / 2, h, 0.05));
    let s = seed;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        s = (s * 9301 + 49297) % 233280;
        const on = s / 233280 > 0.55;
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.5), on ? lit : unlit);
        win.position.set(x0 + (w / cols) * (c + 0.5), 4.7 + r * 2.4, 0.01);
        g.add(win);
        g.add(box(1.15, 0.08, 0.16, M.iron, win.position.x, win.position.y - 0.8, 0.06));
      }
    }
    return b;
  };
  make(-15, -6.25, 9.6, 0xa89580, 2, 4, 11);
  make(6.25, 14, 7.1, 0x6f7f84, 1, 3, 23);
  // shop shutter + small lit kiosk for the neighbours' ground floors
  const shutter = canvasTex(256, 128, (x, w, h) => {
    x.fillStyle = '#5d6264';
    x.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 6) {
      x.fillStyle = 'rgba(0,0,0,0.25)';
      x.fillRect(0, y, w, 2);
    }
  });
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 2.8), new THREE.MeshStandardMaterial({ map: shutter, roughness: 0.6, metalness: 0.3 }));
  sh.position.set(10.1, 1.4, 0.01);
  g.add(sh);
  const kiosk = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.4), new THREE.MeshBasicMaterial({ color: 0x3d4a4c }));
  kiosk.position.set(-10.6, 1.4, 0.01);
  g.add(kiosk);
  const kioskLight = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.12), lit);
  kioskLight.position.set(-10.6, 2.65, 0.02);
  g.add(kioskLight);
  return g;
}

function streetLamp(x) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 4.6, 10), M.iron);
  pole.position.y = 2.3;
  const arm = box(0.05, 0.05, 0.7, M.iron, 0, 4.55, -0.3);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 0.22, 12), M.iron);
  head.position.set(0, 4.45, -0.6);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), M.bulb);
  bulb.position.set(0, 4.32, -0.6);
  const h = halo(2.2, 0xffc47a, 0.5);
  h.position.set(0, 4.3, -0.6);
  g.add(pole, arm, head, bulb, h);
  g.position.set(x, 0, 3.6);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32), new THREE.MeshBasicMaterial({ color: 0xffb468, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.02, -0.6);
  g.add(pool);
  return g;
}

function tree(x, z) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 3.2, 8), new THREE.MeshStandardMaterial({ color: 0x3b2c22, roughness: 0.9 }));
  trunk.position.y = 1.6;
  g.add(trunk);
  const mat = new THREE.MeshStandardMaterial({ color: 0x1f3b2b, roughness: 0.9, flatShading: true });
  for (const [dx, dy, dz, r] of [[0, 3.6, 0, 1.3], [0.8, 3.2, 0.2, 0.9], [-0.7, 3.3, -0.2, 1.0], [0.1, 4.3, 0.1, 0.9]]) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat);
    b.position.set(dx, dy, dz);
    g.add(b);
  }
  g.position.set(x, 0, z);
  return g;
}

export function buildExterior() {
  const group = new THREE.Group();
  group.add(sky(), street(), facade(), neighbours(), streetLamp(-7.2), streetLamp(7.4), tree(-9.6, 2.6), tree(12.5, 2.4));
  const d = door();
  group.add(d.group);
  return { group, setDoor: d.set };
}
