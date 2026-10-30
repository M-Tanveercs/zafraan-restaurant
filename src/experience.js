import * as THREE from 'three';
import gsap from 'gsap';
import { createMenuBook, createTray, TABLE_H, halo } from './scene/props.js';
import { PASS } from './scene/interior.js';
import { buildDish } from './scene/dishes.js';
import { dishById } from './data/menu.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const yawOf = (v) => Math.atan2(v.x, v.z);

// States: story → walking → waiting → menu-ready → menu ⇄ dish → serving → served
export class Experience {
  constructor({ stage, interior, guest, waiter, ui, reduce }) {
    this.stage = stage;
    this.scene = stage.scene;
    this.cam = stage.cam;
    this.tables = interior.tables;
    this.guest = guest;
    this.waiter = waiter;
    this.ui = ui;
    this.T = reduce ? 0.3 : 1;
    this.walkSpeed = reduce ? 3.2 : 1.3;
    this.state = 'story';
    this.gen = 0;
    this.tweens = new Set();
    this.served = [];
    this.order = [];
    this.hoverId = null;
    this.spin = { v: 0, dragging: false, lastX: 0 };
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();

    this.book = createMenuBook();
    this.book.rotation.order = 'YXZ';
    this.book.visible = false;
    this.scene.add(this.book);

    this.tray = createTray();
    this.tray.position.set(0.27, 1.31, 0.42);
    this.tray.visible = false;
    waiter.root.add(this.tray);

    this.preview = new THREE.Group();
    this.preview.visible = false;
    this.scene.add(this.preview);
    this.previewSpot = new THREE.Mesh(
      new THREE.CircleGeometry(0.22, 40),
      new THREE.MeshBasicMaterial({ color: 0xf0b14a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, map: halo().material.map }),
    );
    this.previewSpot.rotation.x = -Math.PI / 2;
    this.scene.add(this.previewSpot);

    this.resetWaiter();
  }

  // ---------- small async helpers (all cancelled by reset) ----------
  tw(target, vars) {
    return new Promise((res) => {
      const t = gsap.to(target, { ease: 'power2.inOut', ...vars, duration: (vars.duration ?? 0.6) * this.T, onComplete: res });
      this.tweens.add(t);
    });
  }
  wait(s) {
    return new Promise((res) => this.tweens.add(gsap.delayedCall(s * this.T, res)));
  }
  walk(c, pts) {
    return c.walkTo(pts, this.walkSpeed);
  }
  alive(g) {
    return g === this.gen;
  }
  setState(s, ctx = {}) {
    this.state = s;
    this.ui.setState(s, { table: this.table, ...ctx });
  }

  shot(name, duration = 1.4) {
    const t = this.table;
    const C = t.center;
    const d = t.d;
    const s = t.side;
    const at = (a, b, h) => C.clone().addScaledVector(d, a).addScaledVector(s, b).setY(h);
    const shots = {
      arrive: [at(-1.6, 2.3, 2.3), at(0.2, 0, 0.55), 52],
      seated: [at(1.35, 1.55, 1.75), at(-0.25, -0.2, 0.85), 48],
      menu: [at(1.0, 1.0, 1.55), at(0.4, 0.08, 1.0), 40],
      dish: [at(0.3, 1.0, 1.32), at(-0.04, 0, 0.92), 40],
      serve: [at(-0.15, 2.05, 1.55), at(0.25, -0.2, 0.85), 48],
    };
    // phones only show the strip above the sheet: look down over the guest's shoulder instead
    if (innerWidth <= 760) shots.menu = [at(1.3, 0.55, 2.1), at(0.4, -0.1, 0.95), 36];
    const [pos, tgt, fov] = shots[name];
    const ease = 'power2.inOut';
    this.tw(this.cam.pos, { x: pos.x, y: pos.y, z: pos.z, duration, ease });
    this.tw(this.cam.target, { x: tgt.x, y: tgt.y, z: tgt.z, duration, ease });
    return this.tw(this.cam, { fov, duration, ease });
  }

  spot(a, b, h = 0) {
    return this.table.center.clone().addScaledVector(this.table.d, a).addScaledVector(this.table.side, b).setY(h);
  }

  resetWaiter() {
    const w = this.waiter;
    w.stop();
    w.root.position.copy(PASS);
    w.setYaw(Math.PI * 0.85);
    Object.assign(w.pose, { wait: 1, holdR: 0, carryL: 0, reachR: 0, bow: 0 });
    this.tray.visible = false;
  }

  // ---------- 1. Choose a table ----------
  async chooseTable(id) {
    const t = this.tables.find((x) => x.id === id && !x.occupied);
    if (!t || this.state !== 'story') return;
    const g = this.gen;
    this.table = t;
    this.hoverId = null;
    this.setState('walking');
    const guest = this.guest;
    guest.manual = false;
    guest.pose.headYaw = 0;
    const sx = Math.sign(t.center.x);

    this.shot('arrive', 2.0);
    await this.walk(guest, [V(sx * 1.4, 0, t.center.z + 0.95), this.spot(0.95, 0.75)]);
    if (!this.alive(g)) return;

    // pull the chair out, step in front of it, sit, shuffle in
    const chair = t.guestChair;
    const chairOut = this.spot(1.02, 0);
    this.tw(chair.position, { x: chairOut.x, z: chairOut.z, duration: 0.45 });
    await this.walk(guest, [this.spot(0.62, 0)]);
    if (!this.alive(g)) return;
    await guest.turnTo(yawOf(t.d.clone().negate()));
    if (!this.alive(g)) return;
    this.shot('seated', 1.8);
    const seat = this.spot(1.0, 0);
    this.tw(guest.root.position, { x: seat.x, z: seat.z, duration: 0.9 });
    await this.tw(guest.pose, { sit: 1, duration: 0.9 });
    if (!this.alive(g)) return;
    const tucked = this.spot(0.8, 0);
    this.tw(chair.position, { x: tucked.x, z: tucked.z, duration: 0.5 });
    await this.tw(guest.root.position, { x: tucked.x, z: tucked.z, duration: 0.5 });
    if (!this.alive(g)) return;

    this.bringMenu(g);
  }

  // ---------- 2. Waiter brings the menu ----------
  async bringMenu(g) {
    const t = this.table;
    const w = this.waiter;
    this.setState('waiting');
    const book = this.book;
    book.userData.setOpen(0);
    book.visible = true;
    w.root.add(book);
    book.position.set(-0.08, 1.33, 0.165);
    book.rotation.set(Math.PI / 2 - 0.12, 0, 0);
    w.pose.wait = 0;
    this.tw(w.pose, { holdR: 1, duration: 0.4 });

    const service = this.spot(-0.15, -0.85);
    await this.walk(w, [V(Math.sign(t.center.x) * 1.4, 0, service.z), service]);
    if (!this.alive(g)) return;
    await w.face(t.center.x, t.center.z);
    if (!this.alive(g)) return;

    // greet, then hand the menu over onto the table
    await this.tw(w.pose, { bow: 1, duration: 0.35 });
    this.tw(w.pose, { bow: 0, duration: 0.35 });
    this.tw(w.pose, { holdR: 0, reachR: 1, duration: 0.5 });
    await this.wait(0.35);
    if (!this.alive(g)) return;
    this.scene.attach(book);
    await this.moveBook(this.bookRest(), 0.7);
    if (!this.alive(g)) return;
    this.tw(w.pose, { reachR: 0, duration: 0.5 });
    // step back and wait politely
    const back = this.spot(-0.25, -1.15);
    await this.walk(w, [back]);
    if (!this.alive(g)) return;
    w.face(this.guest.root.position.x, this.guest.root.position.z);
    this.tw(w.pose, { wait: 1, duration: 0.5 });
    this.setState('menu-ready');
  }

  bookRest() {
    const t = this.table;
    return { pos: this.spot(0.32, 0, TABLE_H + 0.002), rot: [0, yawOf(t.d), 0] };
  }
  bookHeld() {
    return { pos: this.spot(0.43, 0, TABLE_H + 0.22), rot: [0.95, yawOf(this.table.d), 0] };
  }
  bookLowered() {
    return { pos: this.spot(0.3, 0, TABLE_H + 0.004), rot: [0.1, yawOf(this.table.d), 0] };
  }
  bookAside() {
    return { pos: this.spot(0.3, -0.3, TABLE_H + 0.014), rot: [0, yawOf(this.table.d) + 0.35, 0] };
  }

  moveBook({ pos, rot }, duration = 0.7) {
    const b = this.book;
    let ry = rot[1];
    while (ry - b.rotation.y > Math.PI) ry -= Math.PI * 2;
    while (b.rotation.y - ry > Math.PI) ry += Math.PI * 2;
    this.tw(b.rotation, { x: rot[0], y: ry, z: rot[2], duration });
    return this.tw(b.position, { x: pos.x, y: pos.y, z: pos.z, duration });
  }

  bookOpenTo(v, duration = 0.8) {
    const st = this.book.userData.state;
    return this.tw(st, { open: v, duration, ease: 'power2.inOut', onUpdate: () => this.book.userData.setOpen(st.open) });
  }

  // ---------- 3. Pick up and open the menu ----------
  async openMenu() {
    if (this.state !== 'menu-ready' && this.state !== 'served') return;
    const g = this.gen;
    this.setState('opening');
    const P = this.guest.pose;
    this.tw(P, { reachR: 0.8, reachL: 0.8, duration: 0.35 });
    await this.wait(0.3);
    if (!this.alive(g)) return;
    this.tw(P, { reachR: 0, reachL: 0, read: 1, duration: 0.6 });
    this.shot('menu', 1.3);
    await this.moveBook(this.bookHeld(), 0.75);
    if (!this.alive(g)) return;
    await this.bookOpenTo(1, 0.8);
    if (!this.alive(g)) return;
    this.setState('menu');
  }

  // ---------- 4. Preview a dish in 3D ----------
  async previewDish(id) {
    const dish = dishById(id);
    if (!dish || (this.state !== 'menu' && this.state !== 'dish')) return;
    const g = this.gen;
    const first = this.state === 'menu';
    this.previewId = id;
    this.setState('dish', { dish });
    if (first) {
      this.tw(this.guest.pose, { read: 0, duration: 0.6 });
      this.moveBook(this.bookLowered(), 0.6);
      this.shot('dish', 1.0);
    }
    const old = this.preview.children[0];
    if (old) {
      await this.tw(old.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.18, ease: 'power2.in' });
      this.preview.remove(old);
    }
    if (!this.alive(g) || this.previewId !== id) return;
    const model = buildDish(id);
    model.scale.setScalar(0.001);
    this.preview.add(model);
    this.preview.position.copy(this.spot(-0.02, 0, TABLE_H + 0.16));
    this.preview.rotation.y = yawOf(this.table.d) - 0.5;
    this.preview.visible = true;
    this.previewSpot.position.copy(this.spot(-0.02, 0, TABLE_H + 0.003));
    this.tw(this.previewSpot.material, { opacity: 0.55, duration: 0.4 });
    await this.tw(model.scale, { x: 1.15, y: 1.15, z: 1.15, duration: 0.55, ease: 'back.out(1.6)' });
  }

  async backToMenu() {
    if (this.state !== 'dish') return;
    const g = this.gen;
    this.previewId = null;
    this.setState('menu');
    this.hidePreview();
    this.tw(this.guest.pose, { read: 1, duration: 0.6 });
    this.shot('menu', 0.9);
    await this.moveBook(this.bookHeld(), 0.6);
    if (!this.alive(g)) return;
  }

  hidePreview() {
    const m = this.preview.children[0];
    this.tw(this.previewSpot.material, { opacity: 0, duration: 0.3 });
    if (m) this.tw(m.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.25, ease: 'power2.in' }).then(() => this.preview.remove(m));
  }

  // ---------- 5. Order: the waiter fetches and serves it ----------
  async orderDish(id) {
    const dish = dishById(id);
    if (!dish || this.state !== 'dish') return;
    const g = this.gen;
    this.order.push(dish);
    this.setState('serving', { dish, step: 0 });
    this.previewId = null;
    this.hidePreview();
    this.tw(this.guest.pose, { read: 0, duration: 0.6 });
    this.bookOpenTo(0, 0.6).then(() => this.alive(g) && this.moveBook(this.bookAside(), 0.6));
    this.shot('serve', 1.6);

    const w = this.waiter;
    const t = this.table;
    const job = (this.waiterJob = (this.waiterJob ?? 0) + 1);
    // nod to confirm, then head to the kitchen pass
    w.pose.wait = 0;
    await this.tw(w.pose, { bow: 0.7, duration: 0.3 });
    if (!this.alive(g)) return;
    await this.tw(w.pose, { bow: 0, duration: 0.3 });
    if (!this.alive(g)) return;
    this.ui.setState('serving', { table: t, dish, step: 1 });
    const sx = Math.sign(t.center.x);
    const passDist = w.root.position.distanceTo(PASS);
    if (passDist > 0.2) await this.walk(w, [V(sx * 1.4, 0, w.root.position.z), V(sx * 1.2, 0, PASS.z + 0.6), PASS]);
    if (!this.alive(g)) return;
    await w.turnTo(Math.PI);
    if (!this.alive(g)) return;
    await this.wait(0.7);
    if (!this.alive(g)) return;

    // plate goes on the tray
    const plate = buildDish(id);
    plate.userData.dishId = id;
    plate.position.set(0, 0.012, 0);
    plate.scale.setScalar(0.001);
    this.tray.add(plate);
    this.tray.visible = true;
    this.tw(w.pose, { carryL: 1, duration: 0.4 });
    await this.tw(plate.scale, { x: 0.82, y: 0.82, z: 0.82, duration: 0.45, ease: 'back.out(1.4)' });
    if (!this.alive(g)) return;
    this.ui.setState('serving', { table: t, dish, step: 2 });

    const service = this.spot(-0.15, -0.85);
    await this.walk(w, [V(sx * 1.2, 0, PASS.z + 0.6), V(sx * 1.4, 0, service.z), service]);
    if (!this.alive(g)) return;
    await w.face(t.center.x, t.center.z);
    if (!this.alive(g)) return;

    // set the plate down in front of the guest
    const slots = [this.spot(0.1, 0, TABLE_H), this.spot(-0.14, 0.22, TABLE_H), this.spot(-0.14, -0.2, TABLE_H)];
    if (this.served.length >= slots.length) {
      const oldest = this.served.shift();
      this.tw(oldest.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.3 }).then(() => this.scene.remove(oldest));
    }
    const used = new Set(this.served.map((s) => s.userData.slot));
    const slot = [0, 1, 2].find((i) => !used.has(i));
    this.tw(w.pose, { reachR: 0.9, duration: 0.4 });
    this.scene.attach(plate);
    plate.userData.slot = slot;
    const to = slots[slot];
    const mid = plate.position.clone().lerp(to, 0.5);
    mid.y = Math.max(plate.position.y, to.y) + 0.1;
    await this.tw(plate.position, { x: mid.x, y: mid.y, z: mid.z, duration: 0.35, ease: 'power1.out' });
    if (!this.alive(g)) return;
    this.tw(plate.rotation, { y: yawOf(t.d) + (slot ? (slot === 1 ? 0.4 : -0.4) : 0), duration: 0.6 });
    await this.tw(plate.position, { x: to.x, y: to.y, z: to.z, duration: 0.45, ease: 'power2.out' });
    if (!this.alive(g)) return;
    this.served.push(plate);
    this.tw(w.pose, { carryL: 0, reachR: 0, duration: 0.5 });
    this.tray.visible = false;
    await this.tw(w.pose, { bow: 0.6, duration: 0.3 });
    this.tw(w.pose, { bow: 0, duration: 0.3 });
    this.setState('served', { dish, order: this.order });
    // Imran heads back to the pass and waits there
    await this.wait(0.6);
    if (!this.alive(g)) return;
    if (!this.alive(g) || job !== this.waiterJob) return;
    await this.walk(w, [V(sx * 1.4, 0, service.z), V(sx * 1.2, 0, PASS.z + 0.6), PASS]);
    if (!this.alive(g) || job !== this.waiterJob) return;
    w.turnTo(Math.PI * 0.85);
    this.tw(w.pose, { wait: 1, duration: 0.5 });
  }

  // ---------- Start over ----------
  reset() {
    this.gen++;
    for (const t of this.tweens) t.kill();
    this.tweens.clear();
    this.guest.stop();
    for (const p of this.served) this.scene.remove(p);
    this.served = [];
    this.order = [];
    this.preview.clear();
    this.preview.visible = false;
    this.previewSpot.material.opacity = 0;
    for (const c of this.tray.children.filter((c) => c.userData.dishId)) this.tray.remove(c);
    if (this.table) this.table.guestChair.position.copy(this.table.center).addScaledVector(this.table.d, 0.74);
    this.table = null;
    this.book.visible = false;
    this.scene.add(this.book);
    this.resetWaiter();
    Object.assign(this.guest.pose, { sit: 0, read: 0, reachR: 0, reachL: 0, walk: 0 });
    this.guest.manual = true;
    this.setState('story');
  }

  // ---------- per-frame ----------
  update(dt, time, p) {
    const choosing = this.state === 'story' && p > 0.94;
    const pulse = 0.5 + Math.sin(time * 3) * 0.2;
    for (const t of this.tables) {
      if (!t.ring) continue;
      const on = choosing ? (this.hoverId === t.id ? 1 : pulse) : 0;
      t.ring.material.opacity += (on - t.ring.material.opacity) * Math.min(1, dt * 8);
      t.glow.material.opacity = t.ring.material.opacity * (this.hoverId === t.id ? 0.35 : 0.12);
    }

    if (this.preview.visible) {
      if (!this.spin.dragging) {
        this.spin.v += (0.45 - this.spin.v) * Math.min(1, dt * 2);
      }
      this.preview.rotation.y += this.spin.v * dt * (this.T < 1 ? 0.3 : 1);
      const base = TABLE_H + 0.16;
      this.preview.position.y = base + (this.T < 1 ? 0 : Math.sin(time * 1.6) * 0.012);
    }

    // where to draw the HTML table tags
    const tags = [];
    if (choosing) {
      const { width, height } = this.stage.size;
      const v = V();
      for (const t of this.tables) {
        if (t.occupied) continue;
        v.copy(t.center).setY(1.25).project(this.stage.camera);
        tags.push({ id: t.id, x: (v.x * 0.5 + 0.5) * width, y: (-v.y * 0.5 + 0.5) * height, visible: v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05 });
      }
    }
    this.ui.placeTags(tags, choosing);
  }

  // ---------- pointer ----------
  pick(e, objects, deep = false) {
    const r = this.stage.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.stage.camera);
    return this.raycaster.intersectObjects(objects, deep)[0];
  }

  bindPointer(canvas, getP) {
    canvas.addEventListener('pointermove', (e) => {
      if (this.spin.dragging) {
        this.spin.v = (e.clientX - this.spin.lastX) * 0.25;
        this.preview.rotation.y += (e.clientX - this.spin.lastX) * 0.012;
        this.spin.lastX = e.clientX;
        return;
      }
      let cursor = '';
      this.hoverId = null;
      if (this.state === 'story' && getP() > 0.94) {
        const hit = this.pick(e, this.tables.filter((t) => t.hit).map((t) => t.hit));
        if (hit) {
          this.hoverId = hit.object.userData.tableId;
          cursor = 'pointer';
        }
      } else if (this.state === 'menu-ready' || this.state === 'served') {
        if (this.pick(e, [this.book.userData.hit])) cursor = 'pointer';
      } else if (this.state === 'dish') {
        if (this.pick(e, this.preview.children, true)) cursor = 'grab';
      }
      canvas.style.cursor = cursor;
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (this.state === 'dish' && this.pick(e, this.preview.children, true)) {
        this.spin.dragging = true;
        this.spin.lastX = e.clientX;
        canvas.setPointerCapture(e.pointerId);
        canvas.style.cursor = 'grabbing';
      }
    });
    const end = () => {
      this.spin.dragging = false;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('click', (e) => {
      if (this.state === 'story' && getP() > 0.94) {
        const hit = this.pick(e, this.tables.filter((t) => t.hit).map((t) => t.hit));
        if (hit) this.chooseTable(hit.object.userData.tableId);
      } else if ((this.state === 'menu-ready' || this.state === 'served') && this.pick(e, [this.book.userData.hit])) {
        this.openMenu();
      }
    });
  }
}
