import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const lerp = (a, b, t) => a + (b - a) * t;

export function createStage(canvas) {
  const mobile = matchMedia('(max-width: 760px), (pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101a2c);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  scene.fog = new THREE.Fog(0x3a3540, 22, 75);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 200);

  // Night-time street light vs. warm dining-room light, blended by "insideness".
  const hemi = new THREE.HemisphereLight(0x8ea3c4, 0x2b2018, 0.55);
  const moon = new THREE.DirectionalLight(0xa9bfff, 0.7);
  moon.position.set(-6, 10, 8);
  const doorLight = new THREE.PointLight(0xffb35c, 9, 8, 1.6);
  doorLight.position.set(0, 2.9, 1.1);
  scene.add(hemi, moon, doorLight);

  const OUT = { sky: new THREE.Color(0x8ea3c4), ground: new THREE.Color(0x2b2018), hemi: 0.55, moon: 0.7, env: 0.45, exposure: 1.05 };
  const IN = { sky: new THREE.Color(0xffe0b5), ground: new THREE.Color(0x3a281c), hemi: 0.6, moon: 0.12, env: 0.35, exposure: 1.1 };

  const cam = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 45 };
  const inset = { left: 0, bottom: 0, l: 0, b: 0 };
  let width = 1;
  let height = 1;

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
  }
  resize();
  window.addEventListener('resize', resize);

  return {
    renderer,
    scene,
    camera,
    cam,
    mobile,
    get size() {
      return { width, height };
    },
    setInside(t) {
      hemi.color.lerpColors(OUT.sky, IN.sky, t);
      hemi.groundColor.lerpColors(OUT.ground, IN.ground, t);
      hemi.intensity = lerp(OUT.hemi, IN.hemi, t);
      moon.intensity = lerp(OUT.moon, IN.moon, t);
      scene.environmentIntensity = lerp(OUT.env, IN.env, t);
      renderer.toneMappingExposure = lerp(OUT.exposure, IN.exposure, t);
      scene.fog.near = lerp(22, 60, t);
      scene.fog.far = lerp(75, 160, t);
    },
    // Reserve screen space for UI panels so the 3D focus stays in the visible area.
    setInset(left, bottom) {
      inset.left = left;
      inset.bottom = bottom;
    },
    render(dt) {
      const k = 1 - Math.exp(-6 * dt);
      inset.l += (inset.left - inset.l) * k;
      inset.b += (inset.bottom - inset.b) * k;
      const aspect = width / height;
      // Portrait screens get a wider lens so the room still reads.
      camera.fov = cam.fov + Math.min(Math.max((1 - aspect) * 34, 0), 26);
      camera.setViewOffset(width, height, -inset.l / 2, inset.b / 2, width, height);
      camera.updateProjectionMatrix();
      camera.position.copy(cam.pos);
      camera.lookAt(cam.target);
      renderer.render(scene, camera);
    },
  };
}
