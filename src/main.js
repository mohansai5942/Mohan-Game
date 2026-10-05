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
scene.background = new THREE.Color(0x86a9bf);
scene.fog = new THREE.Fog(0x86a9bf, 220, 720);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const camera = new THREE.PerspectiveCamera(67, innerWidth / innerHeight, 0.1, 1200);
camera.position.set(0, 5, 9);

const hemi = new THREE.HemisphereLight(0xd9edff, 0x314529, 1.7);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.8);
sun.position.set(180, 240, 100);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -280;
sun.shadow.camera.right = 280;
sun.shadow.camera.top = 280;
sun.shadow.camera.bottom = -280;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 650;
scene.add(sun);

const world = new THREE.Group();
scene.add(world);

const buildings = [];
const buildingMeshes = [];
const trees = [];
const traffic = [];
const pedestrians = [];
const bullets = [];
const particles = [];
const parkedCars = [];
const policeCars = [];
const trafficLights = [];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];

function material(color, roughness = .8, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
const M = {
  grass: material(0x4e7045),
  road: material(0x292d33, .95),
  sidewalk: material(0x858780, .9),
  line: material(0xf3df78, .7),
  white: material(0xe8e8e8, .75),
  trunk: material(0x5a3923),
  leaf: [0x2d6b3a, 0x3d7e43, 0x4c8b48, 0x275c37].map(c => material(c)),
  building: [0x68727b,0x7d776c,0x59636d,0x8a8275,0x5e6674].map(c=>material(c)),
  glass: material(0x5f93a8,.25,.25),
  skin: material(0xb37a5b),
  shirt: [0x263d5b,0x6a4038,0x3d674d,0x6a547e,0x9a733f].map(c=>material(c)),
  pants: material(0x20242a),
  wheel: material(0x101113,.72,.05),
  cars: [0xc83d32,0x276bb8,0xd4ad31,0xe6e6e6,0x22252a,0x2d985f,0x8c3f8f].map(c=>material(c,.45,.25)),
  police: material(0x1d2d52,.4,.2),
  bullet: material(0xffd36b,.25,.8),
  lamp: material(0x22252a,.5,.1),
  light: material(0xffe9a3,.3,0)
};

function box(x,y,z,w,h,d,mat,parent=world,shadow=true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
  m.position.set(x,y,z);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  parent.add(m);
  return m;
}

function cylinder(x,y,z,r,h,mat,parent=world,segments=10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,segments),mat);
  m.position.set(x,y,z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function addTree(x,z,scale=1) {
  const g = new THREE.Group();
  g.position.set(x,0,z);
  g.scale.setScalar(scale);
  cylinder(0,1.6,0,.22,3.2,M.trunk,g,8);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(1.35,10,8),pick(M.leaf));
  crown.position.y=3.35;
  crown.scale.set(1,.9,1);
  crown.castShadow=true;
  g.add(crown);
  world.add(g);
  trees.push(g);
}

function addLamp(x,z,rot=0) {
  const g = new THREE.Group();
  g.position.set(x,0,z);
  g.rotation.y=rot;
  cylinder(0,2.5,0,.07,5,M.lamp,g,8);
  const arm=box(.55,4.8,0,1.1,.08,.08,M.lamp,g,false);
  arm.position.x=.45;
  const glow=new THREE.Mesh(new THREE.SphereGeometry(.16,8,8),M.light);
  glow.position.set(.92,4.7,0);
  g.add(glow);
  world.add(g);
}

function addBuilding(x,z,w,d,h) {
  const body=box(x,h/2,z,w,h,d,pick(M.building));
  const collider=new THREE.Box3(
    new THREE.Vector3(x-w/2-.35,0,z-d/2-.35),
    new THREE.Vector3(x+w/2+.35,h,z+d/2+.35)
  );
  buildings.push(collider);
  buildingMeshes.push(body);

  const rows=Math.max(2,Math.floor(h/4));
  const cols=Math.max(2,Math.floor(w/4));
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      const wx=x-w*.38+c*(w*.76/Math.max(1,cols-1));
      const wy=2.2+r*(Math.max(3,h-4)/Math.max(1,rows-1));
      const win=box(wx,wy,z-d/2-.035,.75,1.25,.05,M.glass,world,false);
      win.material.opacity=.72;
      win.material.transparent=true;
    }
  }
  const roof=box(x,h+.12,z,w+.12,.24,d+.12,M.building[0],world,false);
  roof.castShadow=true;
}

function roadSegment(x,z,w,d) {
  box(x,0,z,w,.08,d,M.road,world,false);
}
function laneMark(x,z,w,d) { box(x,.07,z,w,.035,d,M.line,world,false); }

box(0,-.12,0,980,.2,980,M.grass,world,false);

// Roads + sidewalks + lane markings.
const roadCenters=[];
for(let i=-4;i<=4;i++){
  const p=i*100;
  roadCenters.push(p);
  roadSegment(0,p,980,36);
  roadSegment(p,0,36,980);
  box(0,.035,p-22,980,.07,8,M.sidewalk,world,false);
  box(0,.035,p+22,980,.07,8,M.sidewalk,world,false);
  box(p-22,.035,0,8,.07,980,M.sidewalk,world,false);
  box(p+22,.035,0,8,.07,980,M.sidewalk,world,false);

  for(let k=-480;k<480;k+=14){
    laneMark(k,p,7,.22);
    laneMark(p,k,.22,7);
  }
}

// Buildings stay inside blocks, never on roads.
for(let gx=-4;gx<4;gx++){
  for(let gz=-4;gz<4;gz++){
    const cx=(gx+.5)*100, cz=(gz+.5)*100;
    const spots=[[-23,-23],[23,-23],[-23,23],[23,23]];
    for(const [ox,oz] of spots){
      const w=rand(18,27), d=rand(18,27), h=rand(12,52);
      addBuilding(cx+ox,cz+oz,w,d,h);
    }
  }
}

// Trees and street furniture in safe non-road areas.
for(let gx=-4;gx<4;gx++){
  for(let gz=-4;gz<4;gz++){
    const cx=(gx+.5)*100, cz=(gz+.5)*100;
    const pts=[[-38,-38],[-38,38],[38,-38],[38,38],[0,-37],[37,0],[-37,0],[0,37]];
    for(const [ox,oz] of pts) addTree(cx+ox,cz+oz,rand(.72,1.15));
  }
}
for(const p of roadCenters){
  for(let q=-450;q<=450;q+=50){
    if(Math.abs(q%100)>1) { addLamp(q,p-25,0); addLamp(p-25,q,Math.PI/2); }
  }
}

// Traffic lights at intersections.
for(const x of roadCenters){
  for(const z of roadCenters){
    if(Math.abs(x)>400||Math.abs(z)>400) continue;
    const g=new THREE.Group(); g.position.set(x-21,0,z-21);
    cylinder(0,3,0,.08,6,M.lamp,g,8);
    const head=box(0,5.5,0,.5,1.15,.35,M.lamp,g,false);
    const red=new THREE.Mesh(new THREE.SphereGeometry(.11,8,8),material(0xd52f2f,.4));
    red.position.set(0,5.82,.19); g.add(red);
    const yellow=new THREE.Mesh(new THREE.SphereGeometry(.11,8,8),material(0xe5b62d,.4));
    yellow.position.set(0,5.5,.19); g.add(yellow);
    const green=new THREE.Mesh(new THREE.SphereGeometry(.11,8,8),material(0x35a85a,.4));
    green.position.set(0,5.18,.19); g.add(green);
    g.userData={phase:Math.random()*20,red,yellow,green};
    trafficLights.push(g);
    world.add(g);
  }
}

function makeCharacter(scale=1) {
  const g=new THREE.Group();
  box(0,1.4,0,.72,1.4,.42,pick(M.shirt),g);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.28,12,10),M.skin);
  head.position.y=2.32; head.castShadow=true; g.add(head);
  box(-.17,.45,0,.24,1.18,.28,M.pants,g);
  box(.17,.45,0,.24,1.18,.28,M.pants,g);
  g.scale.setScalar(scale);
  return g;
}

function makePlayer(){
  const p=makeCharacter(1.12);
  p.position.set(0,0,0);
  p.userData={health:100,armor:50,ammo:12,reserve:72,wanted:0,vehicle:null,vy:0,grounded:true};
  world.add(p);
  return p;
}
const player=makePlayer();

function makeCar(x,z,color,rotation=0,kind='parked'){
  const g=new THREE.Group();
  box(0,.58,0,2.6,.72,5.1,M.cars[color],g);
  box(0,1.08,-.15,2.0,.62,2.35,M.cars[3],g);
  for(const side of [-1,1]) for(const end of [-1.65,1.65]){
    const w=new THREE.Mesh(new THREE.CylinderGeometry(.4,.4,.3,12),M.wheel);
    w.rotation.z=Math.PI/2; w.position.set(side*1.38,.42,end); w.castShadow=true; g.add(w);
  }
  box(0,.78,2.55,1.8,.12,.08,M.light,g,false);
  g.position.set(x,0,z); g.rotation.y=rotation;
  g.userData={speed:0,occupied:false,kind,axis:Math.abs(Math.sin(rotation))>.7?'x':'z'};
  world.add(g);
  if(kind==='traffic') traffic.push(g); else parkedCars.push(g);
  return g;
}

// Parked player-accessible vehicles.
makeCar(7,10,0,0);
makeCar(-8,-10,1,Math.PI);
makeCar(10,210,2,0);
makeCar(-210,-10,5,Math.PI/2);
makeCar(110,12,4,Math.PI/2);

// Moving traffic on both road directions.
const trafficSpawns=[
  [-420,-100,0,1],[140,-420,0,1],[-320,100,Math.PI,1],[300,200,Math.PI,1],
  [100,-260,Math.PI/2,0],[-100,330,-Math.PI/2,0],[400,0,Math.PI/2,0],[-400,200,-Math.PI/2,0],
  [220,-200,Math.PI,1],[-250,300,0,1],[200,400,Math.PI/2,0],[-300,-400,-Math.PI/2,0]
];
for(const [x,z,r,c] of trafficSpawns) makeCar(x,z,c,r,'traffic');

function makePoliceCar(x,z,rotation=0){
  const c=makeCar(x,z,4,rotation,'parked');
  parkedCars.pop();
  policeCars.push(c);
  if(c.children[0]) c.children[0].material=M.police;
  const bar=new THREE.Group();
  const red=new THREE.Mesh(new THREE.BoxGeometry(.34,.12,.28),material(0xff3030,.3,.2));
  const blue=new THREE.Mesh(new THREE.BoxGeometry(.34,.12,.28),material(0x3f7dff,.3,.2));
  red.position.x=-.22; blue.position.x=.22; bar.add(red,blue);
  bar.position.y=1.5; c.add(bar);
  c.userData.police=true;
  return c;
}
makePoliceCar(-40,-18,0);
makePoliceCar(40,18,Math.PI);
makePoliceCar(18,40,Math.PI/2);

function makePedestrian(x,z,axis){
  const g=makeCharacter(rand(.85,1.02));
  g.position.set(x,0,z);
  g.userData={alive:true,speed:rand(1.1,1.8),axis,direction:Math.random()<.5?-1:1,timer:rand(2,5),panic:0};
  world.add(g); pedestrians.push(g);
}
for(let i=0;i<48;i++){
  const road=pick(roadCenters);
  if(i%2===0) makePedestrian(rand(-430,430),road+pick([-12,-8,8,12]),'x');
  else makePedestrian(road+pick([-12,-8,8,12]),rand(-430,430),'z');
}

const keys=Object.create(null);
let mouseHeld=false,pointerLocked=false,yaw=.7,pitch=.34,cameraDistance=11;
addEventListener('keydown',e=>{
  keys[e.code]=true;
  if(e.code==='KeyE') toggleVehicle();
  if(e.code==='KeyR') reload();
  if(e.code==='Escape') document.exitPointerLock?.();
});
addEventListener('keyup',e=>keys[e.code]=false);
canvas.addEventListener('click',()=>canvas.requestPointerLock?.());
document.addEventListener('pointerlockchange',()=>pointerLocked=document.pointerLockElement===canvas);
document.addEventListener('mousemove',e=>{
  if(!pointerLocked)return;
  yaw-=e.movementX*.0025;
  pitch=clamp(pitch-e.movementY*.0018,-.25,.72);
});
canvas.addEventListener('mousedown',e=>{if(e.button===0){mouseHeld=true;shoot();}});
addEventListener('mouseup',e=>{if(e.button===0)mouseHeld=false;});
canvas.addEventListener('wheel',e=>{
  cameraDistance=clamp(cameraDistance+e.deltaY*.006,4.5,12);
  e.preventDefault();
},{passive:false});

function circleBuildingCollision(pos,r){
  for(const b of buildings){
    const cx=clamp(pos.x,b.min.x,b.max.x), cz=clamp(pos.z,b.min.z,b.max.z);
    const dx=pos.x-cx,dz=pos.z-cz;
    if(dx*dx+dz*dz<r*r)return true;
  }
  return false;
}
function moveObject(o,delta,r){
  const ox=o.position.x; o.position.x+=delta.x;
  if(circleBuildingCollision(o.position,r))o.position.x=ox;
  const oz=o.position.z; o.position.z+=delta.z;
  if(circleBuildingCollision(o.position,r))o.position.z=oz;
  o.position.x=clamp(o.position.x,-470,470);
  o.position.z=clamp(o.position.z,-470,470);
}

function nearestCar(){
  let best=null,d0=4.8;
  for(const c of parkedCars) if(!c.userData.occupied){
    const d=c.position.distanceTo(player.position);
    if(d<d0){best=c;d0=d;}
  }
  return best;
}
function toggleVehicle(){
  const p=player.userData;
  if(p.vehicle){
    const c=p.vehicle;c.userData.occupied=false;p.vehicle=null;player.visible=true;
    player.position.copy(c.position).add(new THREE.Vector3(Math.cos(c.rotation.y),0,-Math.sin(c.rotation.y)).multiplyScalar(2.4));
    return;
  }
  const c=nearestCar();
  if(!c)return;
  p.vehicle=c;c.userData.occupied=true;player.visible=false;player.position.copy(c.position);
}
function reload(){
  const p=player.userData;
  const n=Math.min(12-p.ammo,p.reserve);
  if(n>0){p.ammo+=n;p.reserve-=n;}
}

function shoot(){
  const p=player.userData;
  if(p.vehicle||p.ammo<=0)return;
  p.ammo--;p.wanted=clamp(p.wanted+.35,0,5);
  const dir=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).normalize();
  const b=new THREE.Mesh(new THREE.SphereGeometry(.065,6,6),M.bullet);
  b.position.copy(camera.position).addScaledVector(dir,1);
  b.userData={velocity:dir.multiplyScalar(110),life:1.4};
  world.add(b);bullets.push(b);
}
function burst(pos){
  for(let i=0;i<6;i++){
    const p=new THREE.Mesh(new THREE.SphereGeometry(.045,5,5),M.bullet);
    p.position.copy(pos);p.userData={velocity:new THREE.Vector3(rand(-4,4),rand(1,5),rand(-4,4)),life:.45};
    world.add(p);particles.push(p);
  }
}

function updatePlayer(dt){
  const p=player.userData;
  if(p.vehicle){
    const c=p.vehicle;
    const throttle=(keys.KeyW?1:0)-(keys.KeyS?1:0);
    const steer=(keys.KeyD?1:0)-(keys.KeyA?1:0);
    c.userData.speed+=throttle*30*dt;
    c.userData.speed*=Math.pow(.25,dt);
    c.userData.speed=clamp(c.userData.speed,-12,30);
    c.rotation.y-=steer*1.8*clamp(Math.abs(c.userData.speed)/8,0,1)*dt;
    const f=new THREE.Vector3(Math.sin(c.rotation.y),0,Math.cos(c.rotation.y));
    moveObject(c,f.multiplyScalar(c.userData.speed*dt),1.35);
    player.position.copy(c.position);
    return;
  }
  const ix=(keys.KeyD?1:0)-(keys.KeyA?1:0);
  const iz=(keys.KeyS?1:0)-(keys.KeyW?1:0);
  if(ix||iz){
    const f=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
    const r=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
    const m=f.multiplyScalar(-iz).add(r.multiplyScalar(ix)).normalize();
    const speed=(keys.ShiftLeft||keys.ShiftRight)?10:6;
    moveObject(player,m.multiplyScalar(speed*dt),.58);
    let a=Math.atan2(m.x,m.z),d=Math.atan2(Math.sin(a-player.rotation.y),Math.cos(a-player.rotation.y));
    player.rotation.y+=d*Math.min(1,dt*10);
  }
  if(keys.Space&&p.grounded){p.vy=7.2;p.grounded=false;}
  p.vy-=18*dt;player.position.y+=p.vy*dt;
  if(player.position.y<=0){player.position.y=0;p.vy=0;p.grounded=true;}
}

function updateTraffic(dt){
  for(const c of traffic){
    const speed=9+Math.sin(c.position.x*.01+c.position.z*.02)*2;
    const forward=new THREE.Vector3(Math.sin(c.rotation.y),0,Math.cos(c.rotation.y));
    moveObject(c,forward.multiplyScalar(speed*dt),1.25);
    if(c.userData.axis==='x'){
      if(c.position.x>475)c.position.x=-475;
      if(c.position.x<-475)c.position.x=475;
    }else{
      if(c.position.z>475)c.position.z=-475;
      if(c.position.z<-475)c.position.z=475;
    }
  }
}

function updateTrafficLights(dt){
  for(const g of trafficLights){
    g.userData.phase=(g.userData.phase+dt)%18;
    const t=g.userData.phase;
    const red=g.userData.red, yellow=g.userData.yellow, green=g.userData.green;
    red.scale.setScalar(t<8?1.25:.65);
    yellow.scale.setScalar(t>=8&&t<10?1.25:.65);
    green.scale.setScalar(t>=10?1.25:.65);
  }
}

function updatePolice(dt){
  const wanted=player.userData.wanted;
  for(const c of policeCars){
    if(wanted<.6) continue;
    const target=player.userData.vehicle||player;
    const dx=target.position.x-c.position.x;
    const dz=target.position.z-c.position.z;
    const dist=Math.hypot(dx,dz);
    if(dist<4){
      player.userData.health=Math.max(0,player.userData.health-dt*5);
      continue;
    }
    const desired=Math.atan2(dx,dz);
    let diff=Math.atan2(Math.sin(desired-c.rotation.y),Math.cos(desired-c.rotation.y));
    c.rotation.y+=clamp(diff,-1.5*dt,1.5*dt);
    const speed=dist>35?15:8;
    const forward=new THREE.Vector3(Math.sin(c.rotation.y),0,Math.cos(c.rotation.y));
    moveObject(c,forward.multiplyScalar(speed*dt),1.35);
    if(dist>120){
      c.position.lerp(target.position,.015);
    }
  }
  if(player.userData.health<=0){
    player.userData.health=100;
    player.userData.wanted=0;
    player.position.set(0,0,0);
    if(player.userData.vehicle){player.userData.vehicle.userData.occupied=false;player.userData.vehicle=null;player.visible=true;}
  }
}

function updatePedestrians(dt){
  for(const p of pedestrians){
    if(!p.userData.alive)continue;
    const d=p.position.distanceTo(player.position);
    if(player.userData.wanted>.2&&d<45){
      p.userData.panic=1;
      const away=p.position.clone().sub(player.position).setY(0).normalize();
      moveObject(p,away.multiplyScalar(p.userData.speed*2*dt),.35);
      continue;
    }
    p.userData.timer-=dt;
    if(p.userData.timer<=0){p.userData.timer=rand(2,5);p.userData.direction*=-1;}
    const s=p.userData.speed*.55*p.userData.direction;
    if(p.userData.axis==='x')moveObject(p,new THREE.Vector3(s*dt,0,0),.35);
    else moveObject(p,new THREE.Vector3(0,0,s*dt),.35);
  }
}

function updateBullets(dt){
  for(let i=bullets.length-1;i>=0;i--){
    const b=bullets[i];b.position.addScaledVector(b.userData.velocity,dt);b.userData.life-=dt;
    let hit=false;
    for(const p of pedestrians)if(p.userData.alive&&p.position.distanceTo(b.position)<.72){
      p.userData.alive=false;p.visible=false;burst(b.position);hit=true;break;
    }
    if(hit||b.userData.life<=0||Math.abs(b.position.x)>600||Math.abs(b.position.z)>600){
      world.remove(b);bullets.splice(i,1);
    }
  }
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i];p.position.addScaledVector(p.userData.velocity,dt);p.userData.velocity.y-=10*dt;p.userData.life-=dt;
    if(p.userData.life<=0){world.remove(p);particles.splice(i,1);}
  }
}

const cameraPosition=new THREE.Vector3(),cameraLook=new THREE.Vector3();
const cameraRay=new THREE.Raycaster();
function updateCamera(dt){
  const target=player.userData.vehicle||player;
  const h=Math.cos(pitch)*cameraDistance;
  cameraPosition.set(
    target.position.x+Math.sin(yaw)*h,
    target.position.y+1.7+Math.sin(pitch)*cameraDistance,
    target.position.z+Math.cos(yaw)*h
  );
  const from=target.position.clone().add(new THREE.Vector3(0,1.3,0));
  const dir=cameraPosition.clone().sub(from);const dist=dir.length();dir.normalize();
  cameraRay.set(from,dir);
  const hits=cameraRay.intersectObjects(buildingMeshes,false);
  if(hits.length&&hits[0].distance<dist)cameraPosition.copy(from).addScaledVector(dir,Math.max(1.5,hits[0].distance-.45));
  camera.position.lerp(cameraPosition,1-Math.pow(.0001,dt));
  cameraLook.copy(target.position);cameraLook.y+=1.25;camera.lookAt(cameraLook);
}

function updateUI(){
  const p=player.userData;
  hud.hp.textContent=Math.round(p.health);
  hud.armor.textContent=Math.round(p.armor);
  hud.ammo.textContent=p.ammo+' / '+p.reserve;
  const stars=clamp(Math.ceil(p.wanted),0,5);
  hud.wanted.textContent='★ '.repeat(stars)+'☆ '.repeat(5-stars);
  if(p.vehicle)hud.prompt.textContent='E — Exit · W/S Drive · A/D Steer';
  else {const c=nearestCar();hud.prompt.textContent=c?'E — Enter vehicle':(pointerLocked?'WASD Move · Mouse Look · LMB Fire':'WASD Move · Click for Mouse Look');}
  hud.mission.textContent=p.wanted>=1?'POLICE CHASE — Escape the pursuit':p.wanted>.2?'POLICE ALERT — Lose the heat':'MISSION: Explore the city';
}

let previous=performance.now(),elapsed=0;
function animate(now){
  const dt=Math.min(.033,Math.max(.001,(now-previous)/1000));previous=now;elapsed+=dt;
  const daylight=(Math.sin(elapsed*.035)+1)*.5;
  sun.intensity=2+daylight*1.2;hemi.intensity=1.3+daylight*.5;
  const sky=new THREE.Color().setHSL(.57,.18,.49+daylight*.1);
  scene.background.copy(sky);scene.fog.color.copy(sky);
  updatePlayer(dt);updateTraffic(dt);updateTrafficLights(dt);updatePolice(dt);updatePedestrians(dt);updateBullets(dt);updateCamera(dt);
  if(mouseHeld&&pointerLocked)shoot();
  player.userData.wanted=Math.max(0,player.userData.wanted-dt*.02);
  updateUI();
  renderer.render(scene,camera);
  if(!window.__MOHAN_GAME_READY__){
    window.__MOHAN_GAME_READY__=true;
    document.querySelector('#boot')?.remove();
    console.info('MOHAN GAME READY — city, roads, trees, traffic, vehicles and pedestrians active');
  }
}
renderer.setAnimationLoop(animate);

addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
  renderer.setSize(innerWidth,innerHeight,false);
});
console.info('MOHAN GAME v2: roads + buildings + trees + traffic + pedestrians + police + traffic lights + vehicles loaded');
