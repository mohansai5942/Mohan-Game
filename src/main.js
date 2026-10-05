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
scene.background = new THREE.Color(0x8ea6b8);
scene.fog = new THREE.Fog(0x8ea6b8, 260, 900);

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

const camera = new THREE.PerspectiveCamera(67, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 5.2, 10);

const hemi = new THREE.HemisphereLight(0xd9edff, 0x25351f, 1.7);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 2.8);
sun.position.set(160, 220, 100);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -260;
sun.shadow.camera.right = 260;
sun.shadow.camera.top = 260;
sun.shadow.camera.bottom = -260;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 650;
scene.add(sun);

const world = new THREE.Group();
scene.add(world);

const buildings = [];
const cars = [];
const npcs = [];
const bullets = [];
const particles = [];

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function mat(color, roughness = 0.8, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

const mats = {
  road: mat(0x30343b),
  sidewalk: mat(0x777a74),
  grass: mat(0x4a6b42),
  building: [0x727b85, 0x5c6670, 0x877c70, 0x505a64, 0x6e6d76].map(c => mat(c)),
  glass: mat(0x6f9eae, 0.32, 0.2),
  skin: mat(0xa97858),
  shirt: [0x243954, 0x6b3d34, 0x3e604c, 0x5c4a70].map(c => mat(c)),
  pants: mat(0x20242b),
  wheel: mat(0x111214, 0.75, 0.05),
  car: [0xc83c32, 0x2368bd, 0xd7ae35, 0xe8e8e8, 0x202020, 0x2e9b68].map(c => mat(c, 0.46, 0.25)),
  bullet: mat(0xffd36b, 0.25, 0.8)
};

function box(x, y, z, w, h, d, material, parent = world, shadows = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  parent.add(mesh);
  return mesh;
}

// Ground and a clean road grid. Buildings are deliberately kept away from road lanes.
box(0, -0.12, 0, 980, 0.2, 980, mats.grass, world, false);

for (let i = -3; i <= 3; i++) {
  box(0, 0.02, i * 120, 980, 0.04, 44, mats.road, world, false);
  box(i * 120, 0.025, 0, 44, 0.05, 980, mats.road, world, false);
}

function addBuilding(x, z, w, d, h) {
  const mesh = box(x, h / 2, z, w, h, d, mats.building[Math.floor(Math.random() * mats.building.length)]);
  buildings.push(mesh);

  // Simple glass facade strips: much lighter than thousands of separate window meshes.
  const facade = box(x, h * 0.58, z - d / 2 - 0.04, w * 0.82, h * 0.55, 0.06, mats.glass, world, false);
  facade.material.transparent = true;
  facade.material.opacity = 0.65;
}

// Four safe quadrants per city block. Never place buildings inside the 44-unit roads.
for (let gx = -3; gx <= 3; gx++) {
  for (let gz = -3; gz <= 3; gz++) {
    const cx = gx * 120;
    const cz = gz * 120;
    if (Math.abs(gx) + Math.abs(gz) > 5) continue;

    const spots = [
      [-37, -37], [37, -37], [-37, 37], [37, 37]
    ];

    for (const [ox, oz] of spots) {
      const w = 25 + Math.random() * 10;
      const d = 25 + Math.random() * 10;
      const h = 14 + Math.random() * 48;
      addBuilding(cx + ox, cz + oz, w, d, h);
    }
  }
}

function makePlayer() {
  const player = new THREE.Group();

  box(0, 1.45, 0, 1.05, 1.65, 0.58, mats.shirt[0], player);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.39, 18, 14), mats.skin);
  head.position.y = 2.5;
  head.castShadow = true;
  player.add(head);
  box(-0.27, 0.45, 0, 0.36, 1.45, 0.4, mats.pants, player);
  box(0.27, 0.45, 0, 0.36, 1.45, 0.4, mats.pants, player);

  player.position.set(0, 0, 0);
  player.userData = {
    health: 100,
    armor: 50,
    ammo: 12,
    reserve: 72,
    wanted: 0,
    vehicle: null,
    verticalVelocity: 0,
    grounded: true
  };

  world.add(player);
  return player;
}

const player = makePlayer();

function makeCar(x, z, color, rotation = 0) {
  const car = new THREE.Group();

  box(0, 0.58, 0, 2.6, 0.72, 5.1, mats.car[color], car);
  box(0, 1.08, -0.1, 2.0, 0.66, 2.35, mats.car[3], car);

  for (const side of [-1, 1]) {
    for (const end of [-1.65, 1.65]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 0.3, 12),
        mats.wheel
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 1.38, 0.42, end);
      wheel.castShadow = true;
      car.add(wheel);
    }
  }

  car.position.set(x, 0, z);
  car.rotation.y = rotation;
  car.userData = { speed: 0, occupied: false };
  world.add(car);
  cars.push(car);
}

makeCar(8, 12, 0, 0);
makeCar(-10, -12, 1, Math.PI);
makeCar(132, 18, 2, Math.PI / 2);
makeCar(-132, -20, 5, -Math.PI / 2);
makeCar(18, 132, 4, 0);
makeCar(-18, -132, 0, Math.PI);

function makeNPC(x, z) {
  const npc = new THREE.Group();
  box(0, 1.42, 0, 0.72, 1.4, 0.42, mats.shirt[Math.floor(Math.random() * mats.shirt.length)], npc);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), mats.skin);
  head.position.y = 2.33;
  head.castShadow = true;
  npc.add(head);
  box(-0.17, 0.45, 0, 0.24, 1.18, 0.28, mats.pants, npc);
  box(0.17, 0.45, 0, 0.24, 1.18, 0.28, mats.pants, npc);

  npc.position.set(x, 0, z);
  npc.userData = {
    alive: true,
    speed: 1.3 + Math.random() * 1.1,
    direction: new THREE.Vector3(1, 0, 0),
    timer: Math.random() * 3,
    panic: 0
  };
  world.add(npc);
  npcs.push(npc);
}

// Spawn pedestrians on roads, never inside buildings.
for (let i = 0; i < 36; i++) {
  if (i % 2 === 0) {
    const roadX = Math.round((Math.random() * 6 - 3)) * 120;
    const roadZ = (Math.random() - 0.5) * 720;
    makeNPC(roadX + (Math.random() - 0.5) * 12, roadZ);
  } else {
    const roadZ = Math.round((Math.random() * 6 - 3)) * 120;
    const roadX = (Math.random() - 0.5) * 720;
    makeNPC(roadX, roadZ + (Math.random() - 0.5) * 12);
  }
}

const keys = Object.create(null);
let mouseHeld = false;
let pointerLocked = false;
let yaw = 0;
let pitch = 0.28;
let cameraDistance = 7.5;

window.addEventListener('keydown', event => {
  keys[event.code] = true;
  if (event.code === 'KeyE') toggleVehicle();
  if (event.code === 'KeyR') reload();
  if (event.code === 'Escape') document.exitPointerLock?.();
});

window.addEventListener('keyup', event => {
  keys[event.code] = false;
});

canvas.addEventListener('click', () => {
  canvas.requestPointerLock?.();
});

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
});

document.addEventListener('mousemove', event => {
  if (!pointerLocked) return;
  yaw -= event.movementX * 0.0024;
  pitch = clamp(pitch - event.movementY * 0.0018, -0.2, 0.7);
});

canvas.addEventListener('mousedown', event => {
  if (event.button === 0) {
    mouseHeld = true;
    shoot();
  }
});

window.addEventListener('mouseup', event => {
  if (event.button === 0) mouseHeld = false;
});

canvas.addEventListener('wheel', event => {
  cameraDistance = clamp(cameraDistance + event.deltaY * 0.006, 4.5, 12);
  event.preventDefault();
}, { passive: false });

function reload() {
  const p = player.userData;
  if (p.ammo >= 12 || p.reserve <= 0) return;
  const amount = Math.min(12 - p.ammo, p.reserve);
  p.ammo += amount;
  p.reserve -= amount;
}

function nearestCar() {
  let selected = null;
  let distance = 4.5;

  for (const car of cars) {
    if (car.userData.occupied) continue;
    const d = car.position.distanceTo(player.position);
    if (d < distance) {
      selected = car;
      distance = d;
    }
  }
  return selected;
}

function toggleVehicle() {
  const p = player.userData;

  if (p.vehicle) {
    const car = p.vehicle;
    car.userData.occupied = false;
    p.vehicle = null;
    player.visible = true;

    const exit = new THREE.Vector3(
      Math.cos(car.rotation.y),
      0,
      -Math.sin(car.rotation.y)
    );
    player.position.copy(car.position).addScaledVector(exit, 2.3);
    return;
  }

  const car = nearestCar();
  if (!car) return;

  p.vehicle = car;
  car.userData.occupied = true;
  player.visible = false;
  player.position.copy(car.position);
}

function shoot() {
  const p = player.userData;
  if (p.vehicle || p.ammo <= 0) return;

  p.ammo--;
  p.wanted = clamp(p.wanted + 0.4, 0, 5);

  const direction = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(camera.quaternion)
    .normalize();

  const bullet = new THREE.Mesh(
    new THREE.SphereGeometry(0.065, 6, 6),
    mats.bullet
  );

  bullet.position.copy(camera.position).addScaledVector(direction, 1.0);
  bullet.userData = {
    velocity: direction.multiplyScalar(105),
    life: 1.4
  };

  world.add(bullet);
  bullets.push(bullet);
}

function particleBurst(position) {
  for (let i = 0; i < 6; i++) {
    const particle = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 5, 5),
      mats.bullet
    );
    particle.position.copy(position);
    particle.userData = {
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        Math.random() * 5,
        (Math.random() - 0.5) * 6
      ),
      life: 0.4
    };
    world.add(particle);
    particles.push(particle);
  }
}

function circleBuildingCollision(position, radius) {
  const yMin = 0;
  const yMax = 3.0;

  for (const building of buildings) {
    const box3 = new THREE.Box3().setFromObject(building);

    if (box3.max.y < yMin || box3.min.y > yMax) continue;

    const closestX = clamp(position.x, box3.min.x, box3.max.x);
    const closestZ = clamp(position.z, box3.min.z, box3.max.z);
    const dx = position.x - closestX;
    const dz = position.z - closestZ;

    if (dx * dx + dz * dz < radius * radius) return true;
  }

  return false;
}

function moveObject(object, delta, radius) {
  const oldX = object.position.x;
  object.position.x += delta.x;
  if (circleBuildingCollision(object.position, radius)) object.position.x = oldX;

  const oldZ = object.position.z;
  object.position.z += delta.z;
  if (circleBuildingCollision(object.position, radius)) object.position.z = oldZ;

  object.position.x = clamp(object.position.x, -470, 470);
  object.position.z = clamp(object.position.z, -470, 470);
}

function updatePlayer(dt) {
  const p = player.userData;

  if (p.vehicle) {
    const car = p.vehicle;
    const throttle = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    const steering = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);

    car.userData.speed += throttle * 34 * dt;
    car.userData.speed *= Math.pow(0.2, dt);
    car.userData.speed = clamp(car.userData.speed, -14, 34);

    const steer = clamp(Math.abs(car.userData.speed) / 8, 0, 1);
    car.rotation.y -= steering * 1.75 * steer * dt;

    const forward = new THREE.Vector3(
      Math.sin(car.rotation.y),
      0,
      Math.cos(car.rotation.y)
    );

    moveObject(car, forward.multiplyScalar(car.userData.speed * dt), 1.35);
    player.position.copy(car.position);
    return;
  }

  const inputX = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const inputZ = (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0);

  if (inputX || inputZ) {
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

    const move = forward.multiplyScalar(-inputZ)
      .add(right.multiplyScalar(inputX));

    move.normalize();

    const speed = (keys.ShiftLeft || keys.ShiftRight) ? 10 : 6;
    moveObject(player, move.multiplyScalar(speed * dt), 0.58);

    const desiredAngle = Math.atan2(move.x, move.z);
    let difference = desiredAngle - player.rotation.y;
    difference = Math.atan2(Math.sin(difference), Math.cos(difference));
    player.rotation.y += difference * Math.min(1, dt * 10);
  }

  if (keys.Space && p.grounded) {
    p.verticalVelocity = 7.2;
    p.grounded = false;
  }

  p.verticalVelocity -= 18 * dt;
  player.position.y += p.verticalVelocity * dt;

  if (player.position.y <= 0) {
    player.position.y = 0;
    p.verticalVelocity = 0;
    p.grounded = true;
  }
}

function updateNPCs(dt) {
  for (const npc of npcs) {
    if (!npc.userData.alive) continue;

    const d = npc.position.distanceTo(player.position);
    const data = npc.userData;
    data.timer -= dt;

    if (data.timer <= 0) {
      data.timer = 2 + Math.random() * 3;
      const a = Math.random() * Math.PI * 2;
      data.direction.set(Math.cos(a), 0, Math.sin(a));
    }

    if (player.userData.wanted > 0.25 && d < 55) {
      data.panic = clamp(data.panic + dt * 2, 0, 1);
      data.direction.copy(npc.position).sub(player.position).setY(0);
      if (data.direction.lengthSq() > 0.001) data.direction.normalize();
    } else {
      data.panic = Math.max(0, data.panic - dt);
    }

    moveObject(
      npc,
      data.direction.clone().multiplyScalar(data.speed * (data.panic > 0.2 ? 1.8 : 0.65) * dt),
      0.35
    );
  }
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    bullet.position.addScaledVector(bullet.userData.velocity, dt);
    bullet.userData.life -= dt;

    let hit = false;

    for (const npc of npcs) {
      if (!npc.userData.alive) continue;
      if (npc.position.distanceTo(bullet.position) < 0.75) {
        npc.userData.alive = false;
        npc.visible = false;
        particleBurst(bullet.position);
        hit = true;
        break;
      }
    }

    if (hit || bullet.userData.life <= 0 || Math.abs(bullet.position.x) > 600 || Math.abs(bullet.position.z) > 600) {
      world.remove(bullet);
      bullets.splice(i, 1);
    }
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.position.addScaledVector(p.userData.velocity, dt);
    p.userData.velocity.y -= 10 * dt;
    p.userData.life -= dt;

    if (p.userData.life <= 0) {
      world.remove(p);
      particles.splice(i, 1);
    }
  }
}

const cameraPosition = new THREE.Vector3();
const cameraLook = new THREE.Vector3();
const cameraRay = new THREE.Raycaster();

function updateCamera(dt) {
  const target = player.userData.vehicle || player;

  const horizontal = Math.cos(pitch) * cameraDistance;
  cameraPosition.set(
    target.position.x + Math.sin(yaw) * horizontal,
    target.position.y + 1.7 + Math.sin(pitch) * cameraDistance,
    target.position.z + Math.cos(yaw) * horizontal
  );

  // Prevent the camera from entering a building.
  const from = target.position.clone().add(new THREE.Vector3(0, 1.3, 0));
  const direction = cameraPosition.clone().sub(from);
  const distance = direction.length();
  direction.normalize();

  cameraRay.set(from, direction);
  const hits = cameraRay.intersectObjects(buildings, false);

  if (hits.length && hits[0].distance < distance) {
    cameraPosition.copy(from).addScaledVector(direction, Math.max(1.5, hits[0].distance - 0.45));
  }

  const smoothing = 1 - Math.pow(0.0001, dt);
  camera.position.lerp(cameraPosition, smoothing);

  cameraLook.copy(target.position);
  cameraLook.y += 1.25;
  camera.lookAt(cameraLook);
}

function updateUI() {
  const p = player.userData;

  hud.hp.textContent = Math.round(p.health);
  hud.armor.textContent = Math.round(p.armor);
  hud.ammo.textContent = p.ammo + ' / ' + p.reserve;

  const stars = clamp(Math.ceil(p.wanted), 0, 5);
  hud.wanted.textContent = '★ '.repeat(stars) + '☆ '.repeat(5 - stars);

  if (p.vehicle) {
    hud.prompt.textContent = 'E — Exit vehicle · W/S Drive · A/D Steer';
  } else {
    const car = nearestCar();
    hud.prompt.textContent = car
      ? 'E — Enter vehicle'
      : (pointerLocked ? 'WASD Move · Mouse Look · LMB Fire' : 'WASD works now · Click for Mouse Look');
  }

  hud.mission.textContent = p.wanted > 0.25
    ? 'POLICE ALERT — Lose the heat'
    : 'MISSION: Explore the city';
}

let previousTime = performance.now();
let elapsed = 0;

function animate(now) {
  const dt = Math.min(0.033, Math.max(0.001, (now - previousTime) / 1000));
  previousTime = now;
  elapsed += dt;

  const daylight = (Math.sin(elapsed * 0.035) + 1) * 0.5;
  sun.intensity = 2.0 + daylight * 1.2;
  hemi.intensity = 1.3 + daylight * 0.5;

  const sky = new THREE.Color().setHSL(0.57, 0.18, 0.49 + daylight * 0.1);
  scene.background.copy(sky);
  scene.fog.color.copy(sky);

  updatePlayer(dt);
  updateNPCs(dt);
  updateBullets(dt);
  updateCamera(dt);

  if (mouseHeld && pointerLocked) shoot();

  if (player.userData.wanted > 0) {
    player.userData.wanted = Math.max(0, player.userData.wanted - dt * 0.02);
  }

  updateUI();
  renderer.render(scene, camera);

  if (!window.__MOHAN_GAME_READY__) {
    window.__MOHAN_GAME_READY__ = true;
    const boot = document.querySelector('#boot');
    if (boot) boot.remove();
    console.info('MOHAN GAME READY');
  }
}

renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
});

console.info('MOHAN GAME: stable gameplay build loaded');
