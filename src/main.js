import * as THREE from 'three';

const canvas = document.querySelector('#game');
const hud = {
  hp: document.querySelector('#hp'),
  armor: document.querySelector('#armor'),
  ammo: document.querySelector('#ammo'),
  wanted: document.querySelector('#wanted'),
  mission: document.querySelector('#mission'),
  prompt: document.querySelector('#prompt')
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fa9ba);
scene.fog = new THREE.Fog(0x8fa9ba, 220, 850);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 5, 10);

const hemi = new THREE.HemisphereLight(0xd9edff, 0x26351f, 1.65);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 2.6);
sun.position.set(120, 180, 90);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -180;
sun.shadow.camera.right = 180;
sun.shadow.camera.top = 180;
sun.shadow.camera.bottom = -180;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 500;
scene.add(sun);

const world = new THREE.Group();
scene.add(world);

const colliders = [];
const cars = [];
const npcs = [];
const bullets = [];
const particles = [];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

function material(color, roughness = 0.8, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

const mats = {
  road: material(0x303238),
  sidewalk: material(0x77786f),
  grass: material(0x486b40),
  building: [0x737b84, 0x59636e, 0x887c6e, 0x4f5962, 0x6c6a74].map(c => material(c)),
  window: material(0x75a7b9, 0.35, 0.15),
  skin: material(0xa97858),
  shirt: [0x263a57, 0x6b3d34, 0x3b5947, 0x5d496f].map(c => material(c)),
  pants: material(0x20242b),
  wheels: material(0x101114, 0.72, 0.05),
  cars: [0xc63c32, 0x1f63bf, 0xd6ad35, 0xe4e4e4, 0x1d1d1d, 0x2e9c67].map(c => material(c, 0.48, 0.25)),
  muzzle: material(0xffd88a, 0.25, 0.8)
};

function box(x, y, z, w, h, d, mat, group = world, shadows = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  group.add(mesh);
  return mesh;
}

function addRoad(x, z, w, d) {
  box(x, 0.02, z, w, 0.04, d, mats.road, world, false);
  box(x, 0.045, z - d * 0.5 + 2.2, w, 0.05, 0.35, mats.sidewalk, world, false);
  box(x, 0.045, z + d * 0.5 - 2.2, w, 0.05, 0.35, mats.sidewalk, world, false);
}

for (let i = -3; i <= 3; i++) {
  addRoad(0, i * 120, 900, 42);
  addRoad(i * 120, 0, 42, 900);
}

const ground = box(0, -0.13, 0, 950, 0.2, 950, mats.grass, world, false);
ground.receiveShadow = true;

function addBuilding(x, z, w, d, h, mat) {
  const building = box(x, h * 0.5, z, w, h, d, mat, world, true);
  colliders.push(new THREE.Box3().setFromObject(building));

  // One facade panel instead of hundreds of individual window meshes.
  if (h > 16) {
    const panel = box(x, h * 0.56, z - d * 0.5 - 0.035, w * 0.82, h * 0.55, 0.06, mats.window, world, false);
    panel.material.transparent = true;
    panel.material.opacity = 0.7;
  }
}

for (let gx = -3; gx <= 3; gx++) {
  for (let gz = -3; gz <= 3; gz++) {
    if (Math.abs(gx) + Math.abs(gz) > 5) continue;
    const cx = gx * 120;
    const cz = gz * 120;
    for (let i = 0; i < 4; i++) {
      const x = cx + (i - 1.5) * 23 + (Math.random() - 0.5) * 9;
      const z = cz + (Math.random() - 0.5) * 68;
      const w = 15 + Math.random() * 12;
      const d = 15 + Math.random() * 12;
      const h = 12 + Math.random() * 52;
      addBuilding(x, z, w, d, h, mats.building[Math.floor(Math.random() * mats.building.length)]);
    }
  }
}

function makePlayer() {
  const g = new THREE.Group();
  box(0, 1.45, 0, 1.05, 1.65, 0.58, mats.shirt[0], g);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.39, 16, 12), mats.skin);
  head.position.y = 2.5;
  head.castShadow = true;
  g.add(head);
  box(-0.27, 0.45, 0, 0.36, 1.45, 0.4, mats.pants, g);
  box(0.27, 0.45, 0, 0.36, 1.45, 0.4, mats.pants, g);
  g.position.set(0, 0, 22);
  g.userData = {
    health: 100,
    armor: 50,
    ammo: 12,
    reserve: 72,
    wanted: 0,
    inVehicle: null,
    velocityY: 0,
    grounded: true
  };
  world.add(g);
  return g;
}

const player = makePlayer();

function makeCar(position, colorIndex = 0) {
  const g = new THREE.Group();
  box(0, 0.58, 0, 2.6, 0.72, 5.1, mats.cars[colorIndex], g);
  box(0, 1.08, -0.15, 2.05, 0.68, 2.35, mats.cars[3], g);
  for (const x of [-1.38, 1.38]) {
    for (const z of [-1.65, 1.65]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 12), mats.wheels);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.42, z);
      wheel.castShadow = true;
      g.add(wheel);
    }
  }
  g.position.copy(position);
  g.rotation.y = Math.random() * Math.PI * 2;
  g.userData = { speed: 0, occupied: false };
  world.add(g);
  cars.push(g);
  return g;
}

[
  [new THREE.Vector3(9, 0, 28), 0],
  [new THREE.Vector3(-14, 0, 10), 1],
  [new THREE.Vector3(18, 0, -24), 2],
  [new THREE.Vector3(-28, 0, -18), 4],
  [new THREE.Vector3(48, 0, 121), 5],
  [new THREE.Vector3(-121, 0, -55), 0]
].forEach(([p, c]) => makeCar(p, c));

function makeNPC(position) {
  const g = new THREE.Group();
  box(0, 1.42, 0, 0.72, 1.4, 0.42, mats.shirt[Math.floor(Math.random() * mats.shirt.length)], g);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), mats.skin);
  head.position.y = 2.33;
  head.castShadow = true;
  g.add(head);
  box(-0.17, 0.45, 0, 0.24, 1.18, 0.28, mats.pants, g);
  box(0.17, 0.45, 0, 0.24, 1.18, 0.28, mats.pants, g);
  g.position.copy(position);
  g.userData = {
    alive: true,
    speed: 1.3 + Math.random() * 1.1,
    direction: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(),
    changeTimer: Math.random() * 3,
    panic: 0
  };
  world.add(g);
  npcs.push(g);
}

for (let i = 0; i < 32; i++) {
  const roadX = Math.round((Math.random() * 6 - 3)) * 120;
  const roadZ = (Math.random() - 0.5) * 720;
  makeNPC(new THREE.Vector3(roadX + (Math.random() - 0.5) * 12, 0, roadZ));
}

const keys = Object.create(null);
let mouseDown = false;
let locked = false;
let yaw = 0;
let pitch = 0.28;
let cameraDistance = 7.5;

window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyE') toggleVehicle();
  if (e.code === 'KeyR') reload();
  if (e.code === 'Escape') document.exitPointerLock?.();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

canvas.addEventListener('click', () => {
  if (!locked) canvas.requestPointerLock?.();
});

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
});

document.addEventListener('mousemove', e => {
  if (!locked) return;
  yaw -= e.movementX * 0.0024;
  pitch = clamp(pitch - e.movementY * 0.0018, -0.15, 0.72);
});

canvas.addEventListener('mousedown', e => {
  if (e.button === 0) {
    mouseDown = true;
    if (locked) shoot();
  }
});
window.addEventListener('mouseup', e => {
  if (e.button === 0) mouseDown = false;
});
canvas.addEventListener('wheel', e => {
  cameraDistance = clamp(cameraDistance + e.deltaY * 0.006, 4.5, 12);
  e.preventDefault();
}, { passive: false });

function reload() {
  const p = player.userData;
  if (p.ammo >= 12 || p.reserve <= 0) return;
  const amount = Math.min(12 - p.ammo, p.reserve);
  p.ammo += amount;
  p.reserve -= amount;
}

function nearestCar(maxDistance = 4.2) {
  let best = null;
  let bestDistance = maxDistance;
  for (const car of cars) {
    if (car.userData.occupied) continue;
    const d = car.position.distanceTo(player.position);
    if (d < bestDistance) {
      best = car;
      bestDistance = d;
    }
  }
  return best;
}

function toggleVehicle() {
  const p = player.userData;
  if (p.inVehicle) {
    const car = p.inVehicle;
    car.userData.occupied = false;
    p.inVehicle = null;
    player.visible = true;
    const side = new THREE.Vector3(Math.cos(car.rotation.y), 0, -Math.sin(car.rotation.y));
    player.position.copy(car.position).addScaledVector(side, 2.1);
    return;
  }

  const car = nearestCar();
  if (!car) return;
  p.inVehicle = car;
  car.userData.occupied = true;
  player.visible = false;
}

const raycaster = new THREE.Raycaster();

function shoot() {
  const p = player.userData;
  if (p.inVehicle || p.ammo <= 0) return;

  p.ammo--;

  const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
  const bullet = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 6, 6),
    mats.muzzle
  );
  bullet.position.copy(camera.position).addScaledVector(direction, 1.2);
  bullet.userData = { velocity: direction.multiplyScalar(110), life: 1.5 };
  world.add(bullet);
  bullets.push(bullet);

  p.wanted = clamp(p.wanted + 0.45, 0, 5);
}

function burst(position) {
  for (let i = 0; i < 8; i++) {
    const particle = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 5, 5),
      mats.muzzle
    );
    particle.position.copy(position);
    particle.userData = {
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 7,
        Math.random() * 6,
        (Math.random() - 0.5) * 7
      ),
      life: 0.35 + Math.random() * 0.2
    };
    world.add(particle);
    particles.push(particle);
  }
}

function blocked(position, radius = 0.55) {
  const test = new THREE.Box3(
    new THREE.Vector3(position.x - radius, 0, position.z - radius),
    new THREE.Vector3(position.x + radius, 3.0, position.z + radius)
  );
  return colliders.some(c => c.intersectsBox(test));
}

function moveWithCollision(object, delta, radius = 0.55) {
  const oldX = object.position.x;
  const oldZ = object.position.z;

  object.position.x += delta.x;
  if (blocked(object.position, radius)) object.position.x = oldX;

  object.position.z += delta.z;
  if (blocked(object.position, radius)) object.position.z = oldZ;

  object.position.x = clamp(object.position.x, -455, 455);
  object.position.z = clamp(object.position.z, -455, 455);
}

function updatePlayer(dt) {
  const p = player.userData;

  if (p.inVehicle) {
    const car = p.inVehicle;
    const throttle = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    const steering = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);

    car.userData.speed += throttle * 30 * dt;
    car.userData.speed *= Math.pow(0.18, dt);
    car.userData.speed = clamp(car.userData.speed, -12, 30);

    const steerPower = clamp(Math.abs(car.userData.speed) / 8, 0, 1);
    car.rotation.y -= steering * 1.7 * steerPower * dt;

    const forward = new THREE.Vector3(Math.sin(car.rotation.y), 0, Math.cos(car.rotation.y));
    const old = car.position.clone();
    moveWithCollision(car, forward.multiplyScalar(car.userData.speed * dt), 1.35);
    if (car.position.distanceToSquared(old) < 0.000001) car.userData.speed *= 0.35;

    player.position.copy(car.position);
    player.position.y = 0;
    return;
  }

  const input = new THREE.Vector3(
    (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0),
    0,
    (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0)
  );

  if (input.lengthSq() > 0) {
    input.normalize();
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const move = forward.multiplyScalar(-input.z).add(right.multiplyScalar(input.x));
    const speed = keys.ShiftLeft || keys.ShiftRight ? 10 : 6;
    move.normalize().multiplyScalar(speed * dt);
    moveWithCollision(player, move, 0.55);
    player.rotation.y = lerpAngle(player.rotation.y, Math.atan2(move.x, move.z), 1 - Math.pow(0.001, dt));
  }

  if (keys.Space && p.grounded) {
    p.velocityY = 7.2;
    p.grounded = false;
  }

  p.velocityY -= 18 * dt;
  player.position.y += p.velocityY * dt;
  if (player.position.y <= 0) {
    player.position.y = 0;
    p.velocityY = 0;
    p.grounded = true;
  }
}

function lerpAngle(a, b, t) {
  let diff = (b - a + Math.PI) % (Math.PI * 2) - Math.PI;
  return a + diff * clamp(t, 0, 1);
}

function updateNPCs(dt) {
  for (const npc of npcs) {
    if (!npc.userData.alive) continue;

    const data = npc.userData;
    const distance = npc.position.distanceTo(player.position);
    data.changeTimer -= dt;

    if (data.changeTimer <= 0) {
      data.changeTimer = 2 + Math.random() * 3;
      const angle = Math.random() * Math.PI * 2;
      data.direction.set(Math.cos(angle), 0, Math.sin(angle));
    }

    if (player.userData.wanted > 0.2 && distance < 55) {
      data.panic = clamp(data.panic + dt * 2, 0, 1);
      data.direction.copy(npc.position).sub(player.position).setY(0);
      if (data.direction.lengthSq() > 0.001) data.direction.normalize();
    } else {
      data.panic = Math.max(0, data.panic - dt);
    }

    const step = data.direction.clone().multiplyScalar(data.speed * (data.panic > 0.2 ? 1.8 : 0.65) * dt);
    const old = npc.position.clone();
    moveWithCollision(npc, step, 0.35);
    if (npc.position.distanceToSquared(old) < 0.0001) data.direction.negate();
    npc.rotation.y = lerpAngle(npc.rotation.y, Math.atan2(data.direction.x, data.direction.z), 0.12);
  }
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    const previous = bullet.position.clone();
    bullet.position.addScaledVector(bullet.userData.velocity, dt);
    bullet.userData.life -= dt;

    raycaster.set(previous, bullet.userData.velocity.clone().normalize());
    const distance = previous.distanceTo(bullet.position);
    const buildingHit = raycaster.intersectObjects(world.children, true).find(hit => {
      return hit.object !== bullet && hit.distance <= distance && hit.object.userData !== player.userData;
    });

    let hit = false;

    for (const npc of npcs) {
      if (!npc.userData.alive) continue;
      if (npc.position.distanceTo(bullet.position) < 0.75) {
        npc.userData.alive = false;
        npc.visible = false;
        burst(bullet.position);
        hit = true;
        break;
      }
    }

    if (buildingHit || hit || bullet.userData.life <= 0 || bullet.position.y < 0 || bullet.position.length() > 600) {
      world.remove(bullet);
      bullets.splice(i, 1);
    }
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const particle = particles[i];
    particle.position.addScaledVector(particle.userData.velocity, dt);
    particle.userData.velocity.y -= 12 * dt;
    particle.userData.life -= dt;
    if (particle.userData.life <= 0) {
      world.remove(particle);
      particles.splice(i, 1);
    }
  }
}

const desiredCamera = new THREE.Vector3();
const targetCamera = new THREE.Vector3();
const lookTarget = new THREE.Vector3();

function updateCamera(dt) {
  const target = player.userData.inVehicle || player;
  const horizontal = Math.cos(pitch) * cameraDistance;
  desiredCamera.set(
    target.position.x + Math.sin(yaw) * horizontal,
    target.position.y + 1.7 + Math.sin(pitch) * cameraDistance,
    target.position.z + Math.cos(yaw) * horizontal
  );

  targetCamera.copy(desiredCamera);
  const smoothing = 1 - Math.pow(0.0001, dt);
  camera.position.lerp(targetCamera, smoothing);

  lookTarget.copy(target.position);
  lookTarget.y += 1.25;
  const lookSmoothing = 1 - Math.pow(0.00005, dt);
  const currentLook = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld).lerp(lookTarget, lookSmoothing);
  camera.lookAt(currentLook);
}

function updateUI() {
  const p = player.userData;
  hud.hp.textContent = Math.max(0, Math.round(p.health));
  hud.armor.textContent = Math.max(0, Math.round(p.armor));
  hud.ammo.textContent = p.ammo + ' / ' + p.reserve;

  const stars = clamp(Math.ceil(p.wanted), 0, 5);
  hud.wanted.textContent = '★ '.repeat(stars) + '☆ '.repeat(5 - stars);

  if (p.inVehicle) {
    hud.prompt.textContent = 'E — Exit vehicle  ·  W/S Drive  ·  A/D Steer';
  } else {
    const car = nearestCar();
    hud.prompt.textContent = car ? 'E — Enter vehicle' : (locked ? 'WASD Move · Mouse Look · LMB Fire' : 'Click the game to capture mouse');
  }

  hud.mission.textContent = p.wanted > 0.2
    ? 'POLICE ALERT — Lose the heat'
    : 'MISSION: Explore the city';
}

let elapsed = 0;
let lastTime = performance.now();

function animate(now) {
  const dt = Math.min(0.033, Math.max(0.001, (now - lastTime) / 1000));
  lastTime = now;
  elapsed += dt;

  const day = (Math.sin(elapsed * 0.035) + 1) * 0.5;
  sun.intensity = 2.0 + day * 1.3;
  hemi.intensity = 1.25 + day * 0.55;
  const sky = new THREE.Color().setHSL(0.57, 0.2, 0.48 + day * 0.12);
  scene.background.copy(sky);
  scene.fog.color.copy(sky);

  updatePlayer(dt);
  updateNPCs(dt);
  updateBullets(dt);

  if (mouseDown && locked) shoot();
  if (player.userData.wanted > 0) {
    player.userData.wanted = Math.max(0, player.userData.wanted - dt * 0.02);
  }

  updateCamera(dt);
  updateUI();
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
});

console.info('Mohan Game initialized — optimized third-person build');
