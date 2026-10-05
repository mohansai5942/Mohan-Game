import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas=document.querySelector('#game');
const scene=new THREE.Scene();
scene.fog=new THREE.FogExp2(0x9fb4c2,0.006);
scene.background=new THREE.Color(0x9fb4c2);
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.05;

const camera=new THREE.PerspectiveCamera(68,innerWidth/innerHeight,.1,1600);
camera.position.set(0,5,10);
const controls=new OrbitControls(camera,canvas);
controls.enableDamping=true;
controls.enablePan=false;
controls.minDistance=3;
controls.maxDistance=18;
controls.maxPolarAngle=Math.PI*.48;

const hemi=new THREE.HemisphereLight(0xcde3ff,0x26301e,1.8); scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffffff,3.2); sun.position.set(120,180,70); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048); scene.add(sun);

const world=new THREE.Group();scene.add(world);
const colliders=[];
const cars=[];
const npcs=[];
const bullets=[];
const particles=[];

function mat(color,rough=.8,metal=0){return new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal});}
const mats={road:mat(0x303238),side:mat(0x666b63),grass:mat(0x46633d),building:[0x80868e,0x626b76,0x8a7e72,0x4e5964].map(c=>mat(c)),window:mat(0x92b8c7,.25,.5),car:[0xc63c32,0x1f63bf,0xd6ad35,0xe4e4e4,0x1d1d1d].map(c=>mat(c,.45,.4)),skin:mat(0xa97858),shirt:mat(0x263a57),pants:mat(0x20242b)};

function box(x,y,z,w,h,d,m,group=world){const q=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);q.position.set(x,y,z);q.castShadow=q.receiveShadow=true;group.add(q);return q}
function road(x,z,w,d){box(x,.02,z,w,.04,d,mats.road)}
for(let i=-3;i<=3;i++){road(0,i*120,900,42);road(i*120,0,42,900)}
const ground=box(0,-.12,0,950,.2,950,mats.grass);ground.receiveShadow=true;

for(let gx=-3;gx<=3;gx++)for(let gz=-3;gz<=3;gz++){
  const cx=gx*120,cz=gz*120;
  if(Math.abs(gx)+Math.abs(gz)>5) continue;
  for(let i=0;i<5;i++){
    const x=cx+(i-2)*20+(Math.random()-.5)*8, z=cz+(Math.random()-.5)*66;
    const w=14+Math.random()*13,d=14+Math.random()*13,h=12+Math.random()*58;
    const b=box(x,h/2,z,w,h,d,mats.building[(i+gx+gz+8)%mats.building.length]);
    if(h>18) for(let yy=8;yy<h-4;yy+=8) for(let xx=-w/2+3;xx<w/2-2;xx+=5) box(x+xx,yy,z-d/2-.08,2.1,2.8,.1,mats.window);
    colliders.push(new THREE.Box3().setFromObject(b));
  }
}

function makePlayer(){
  const g=new THREE.Group();
  const torso=box(0,1.45,0,1.15,1.7,.6,mats.shirt,g);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.4,20,20),mats.skin);head.position.y=2.55;head.castShadow=true;g.add(head);
  const leg1=box(-.28,.45,0,.38,1.5,.42,mats.pants,g),leg2=box(.28,.45,0,.38,1.5,.42,mats.pants,g);
  g.userData={health:100,armor:50,ammo:12,reserve:72,inVehicle:null,onGround:true,velocity:new THREE.Vector3(),heading:0};
  g.position.set(0,0,20);world.add(g);return g;
}
const player=makePlayer();

function makeCar(pos, color=0){
  const g=new THREE.Group();
  box(0,.55,0,2.6,.7,5.2,mats.car[color],g);
  box(0,1.05,-.15,2.05,.7,2.45,mats.car[3],g);
  for(const x of[-1.38,1.38])for(const z of[-1.65,1.65]){const w=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,.28,16),mat(0x111111,.7,.1));w.rotation.z=Math.PI/2;w.position.set(x,.42,z);w.castShadow=true;g.add(w)}
  g.position.copy(pos);g.rotation.y=Math.random()*Math.PI*2;g.userData={speed:0,occupied:false};
  world.add(g);cars.push(g);return g;
}
makeCar(new THREE.Vector3(9,0,28),0);makeCar(new THREE.Vector3(-14,0,10),1);makeCar(new THREE.Vector3(18,0,-24),2);makeCar(new THREE.Vector3(-28,0,-18),4);

function makeNPC(pos){
  const g=new THREE.Group();
  box(0,1.45,0,.75,1.45,.45,Math.random()>.5?mats.shirt:mat(0x6b3d34),g);
  const h=new THREE.Mesh(new THREE.SphereGeometry(.29,14,14),mats.skin);h.position.y=2.35;g.add(h);
  box(-.18,.45,0,.25,1.2,mats.pants,g);box(.18,.45,0,.25,1.2,mats.pants,g);
  g.position.copy(pos);g.userData={speed:1.1+Math.random()*1.2,alive:true,panic:0};world.add(g);npcs.push(g);
}
for(let i=0;i<40;i++)makeNPC(new THREE.Vector3((Math.random()-.5)*700,0,(Math.random()-.5)*700));

const keys={};addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='KeyR')reload();if(e.code==='KeyE')toggleVehicle();});addEventListener('keyup',e=>keys[e.code]=false);
let mouseDown=false;canvas.addEventListener('mousedown',e=>{if(e.button===0){mouseDown=true;shoot()}});addEventListener('mouseup',()=>mouseDown=false);

function reload(){if(player.userData.ammo>=12||player.userData.reserve<=0)return;const n=Math.min(12-player.userData.ammo,player.userData.reserve);player.userData.ammo+=n;player.userData.reserve-=n}
function toggleVehicle(){
  const v=nearestCar();
  if(player.userData.inVehicle){const c=player.userData.inVehicle;c.userData.occupied=false;player.userData.inVehicle=null;player.position.copy(c.position).add(new THREE.Vector3(2,0,0));return}
  if(v){player.userData.inVehicle=v;v.userData.occupied=true;}
}
function nearestCar(){let best=null,bd=5;for(const c of cars){const d=c.position.distanceTo(player.position);if(d<bd&&!c.userData.occupied){best=c;bd=d}}return best}

const raycaster=new THREE.Raycaster();
function shoot(){
  if(player.userData.inVehicle||player.userData.ammo<=0)return;
  player.userData.ammo--;
  const dir=new THREE.Vector3();camera.getWorldDirection(dir);
  const b=new THREE.Mesh(new THREE.SphereGeometry(.075,8,8),mat(0xffe1a1,.2,1));
  b.position.copy(camera.position).add(dir.clone().multiplyScalar(1.5));b.userData={vel:dir.multiplyScalar(95),life:1.7};world.add(b);bullets.push(b);
  player.userData.wanted=Math.min(5,(player.userData.wanted||0)+.35);
}
function burst(p){
  for(let i=0;i<6;i++){const q=new THREE.Mesh(new THREE.SphereGeometry(.04,6,6),mat(0xffc267,.3,0));q.position.copy(p);q.userData={vel:new THREE.Vector3((Math.random()-.5)*5,Math.random()*5,(Math.random()-.5)*5),life:.45};world.add(q);particles.push(q)}
}

let time=0;
function updatePlayer(dt){
  const p=player.userData;
  if(p.inVehicle){
    const c=p.inVehicle;
    const fwd=(keys.KeyW?1:0)-(keys.KeyS?1:0), steer=(keys.KeyD?1:0)-(keys.KeyA?1:0);
    c.userData.speed += fwd*32*dt;
    c.userData.speed *= Math.pow(.28,dt);
    c.rotation.y -= steer*c.userData.speed*.06*dt;
    c.position.x += Math.sin(c.rotation.y)*c.userData.speed*dt;
    c.position.z += Math.cos(c.rotation.y)*c.userData.speed*dt;
    player.position.copy(c.position);player.position.y=0;
  } else {
    const v=new THREE.Vector3((keys.KeyD?1:0)-(keys.KeyA?1:0),0,(keys.KeyS?1:0)-(keys.KeyW?1:0));
    if(v.lengthSq())v.normalize().multiplyScalar((keys.ShiftLeft?10:6));
    player.position.addScaledVector(v,dt);
    if(v.lengthSq())player.rotation.y=Math.atan2(v.x,v.z);
  }
  if(keys.Space&&p.onGround){p.velocity.y=7;p.onGround=false}
  p.velocity.y-=18*dt;player.position.y+=p.velocity.y*dt;if(player.position.y<=0){player.position.y=0;p.velocity.y=0;p.onGround=true}
}
function updateNPCs(dt){
  for(const n of npcs){if(!n.userData.alive)continue;const d=n.position.distanceTo(player.position);
    if((player.userData.wanted||0)>0.5&&d<60)n.userData.panic=Math.min(5,n.userData.panic+dt);
    const dir=player.position.clone().sub(n.position);dir.y=0;
    if(n.userData.panic>0.2){dir.normalize().negate();n.position.addScaledVector(dir,dt*n.userData.speed)}
    else if(Math.random()<.008){n.rotation.y+=(Math.random()-.5)*2}
  }
}
function updateBullets(dt){
  for(let i=bullets.length-1;i>=0;i--){const b=bullets[i];b.position.addScaledVector(b.userData.vel,dt);b.userData.life-=dt;
    let hit=false;for(const n of npcs)if(n.userData.alive&&n.position.distanceTo(b.position)<.65){n.userData.alive=false;n.visible=false;burst(b.position);hit=true;break}
    if(hit||b.userData.life<0){world.remove(b);bullets.splice(i,1)}
  }
  for(let i=particles.length-1;i>=0;i--){const q=particles[i];q.position.addScaledVector(q.userData.vel,dt);q.userData.vel.y-=9*dt;q.userData.life-=dt;if(q.userData.life<0){world.remove(q);particles.splice(i,1)}}
}
function updateCamera(dt){
  const target=player.userData.inVehicle?player.userData.inVehicle:player;
  const behind=new THREE.Vector3(Math.sin(target.rotation.y)*-7,4.2,Math.cos(target.rotation.y)*-7);
  const desired=target.position.clone().add(behind);
  camera.position.lerp(desired,1-Math.pow(.001,dt));
  controls.target.lerp(target.position.clone().add(new THREE.Vector3(0,1.4,0)),1-Math.pow(.001,dt));
  controls.update();
}
function updateUI(){
  const p=player.userData;
  document.querySelector('#hp').textContent=Math.max(0,Math.round(p.health));
  document.querySelector('#armor').textContent=Math.max(0,Math.round(p.armor));
  document.querySelector('#ammo').textContent=p.ammo+' / '+p.reserve;
  const stars=Math.max(0,Math.min(5,Math.ceil(p.wanted||0)));
  document.querySelector('#wanted').textContent='★ '.repeat(stars)+'☆ '.repeat(5-stars);
  const c=p.inVehicle?'E — Exit vehicle':'E — Enter vehicle';
  document.querySelector('#prompt').textContent=nearestCar()?'Press '+c:'';
  document.querySelector('#mission').textContent=(p.wanted||0)>0.1?'POLICE ALERT — Lose the heat':'MISSION: Explore the city';
}
let last=performance.now();
function loop(now){const dt=Math.min(.033,(now-last)/1000);last=now;time+=dt;
  const phase=(Math.sin(time*.02)+1)*.5; sun.intensity=2.2+phase*1.5;scene.background.setHSL(.57,.18,.55+phase*.1);
  updatePlayer(dt);updateNPCs(dt);updateBullets(dt);updateCamera(dt);
  if(mouseDown)shoot();if((player.userData.wanted||0)>0){player.userData.wanted=Math.max(0,player.userData.wanted-dt*.018)}
  updateUI();renderer.render(scene,camera);requestAnimationFrame(loop)}
requestAnimationFrame(loop);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
