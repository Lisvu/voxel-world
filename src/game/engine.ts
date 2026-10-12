import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { createIcons, Box, Check, Sun, Moon, Maximize, Pause, Play, LoaderCircle, Layers3, Pickaxe, Plus, ArrowUp, X, MapPin, Save, Sprout } from 'lucide';
import type { Snapshot } from '../../shared/contracts';

let rapierReady: Promise<void> | undefined;
export async function startGame(initial: Snapshot, persist: (snapshot: Snapshot) => Promise<void>, leave: () => void, signal: AbortSignal) {
await (rapierReady ??= RAPIER.init());
if (signal.aborted) throw new DOMException('Game closed', 'AbortError');
const events = new AbortController();
type Events = WindowEventMap & DocumentEventMap & HTMLElementEventMap;
function listen<K extends keyof Events>(target: EventTarget, name: K, callback: (event: Events[K]) => void, options: AddEventListenerOptions = {}) {
  target.addEventListener(name, callback as EventListener, { ...options, signal: events.signal });
}
let disposed = false;
let animationId = 0;
let saveInterval: ReturnType<typeof setInterval>;

function $<T extends HTMLElement = HTMLElement>(id: string): T { return document.getElementById(id) as T; }
const icons = { Box, Check, Sun, Moon, Maximize, Pause, Play, LoaderCircle, Layers3, Pickaxe, Plus, ArrowUp, X, MapPin, Save, Sprout };
const refreshIcons = () => createIcons({ icons });
refreshIcons();
const touch = matchMedia('(pointer: coarse)').matches;
document.body.classList.toggle('touch', touch);
const SIZE = 28;
const blocks = new Map<string, number>();
const changes = new Map<string, number>();
const colliders = new Map<string, RAPIER.Collider>();
const directions = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const types = [
  { id: 1, name: '草方块', color: '#679348', side: '#826245' },
  { id: 2, name: '泥土', color: '#92704f' },
  { id: 3, name: '岩石', color: '#929c9c' },
  { id: 4, name: '橡木', color: '#947048' },
  { id: 5, name: '树叶', color: '#4d8050' },
  { id: 6, name: '细沙', color: '#dbc68c' },
  { id: 7, name: '木板', color: '#ba955e' },
];
const key = (x: number,y: number,z: number) => `${x},${y},${z}`;
let seed = initial.seed, selected = 1, meshes: THREE.InstancedMesh[] = [], active = false, started = false, ready = false;
let yaw = -1.05, pitch = -0.22, verticalVelocity = 0, grounded = false, night = false;
let physics: RAPIER.World, body: RAPIER.RigidBody, playerCollider: RAPIER.Collider, controller: RAPIER.KinematicCharacterController;
let target: { position: number[]; normal: THREE.Vector3; type: number } | null;
let saveTimer: ReturnType<typeof setTimeout>, toastTimer: ReturnType<typeof setTimeout>;
let mined = 0, placed = 0;
const keys = new Set<string>();
const joystick = { x: 0, y: 0 };
const saved = initial;
if (saved?.version === 1 && Number.isInteger(saved.seed)) seed = saved.seed;

function random(x: number,z: number,n=0) {
  const v = Math.sin(x*127.1+z*311.7+seed*0.071+n*63.9)*43758.5453;
  return v-Math.floor(v);
}
function height(x: number,z: number) {
  const river = Math.abs(x - (8 + Math.sin(z*.1)*3));
  const hills = Math.sin(x*.13+seed*.01)*1.6 + Math.cos(z*.15)*1.3 + Math.sin((x+z)*.18)*.6;
  return river < 3 ? 2 : river < 5 ? 3 : Math.max(4, Math.floor(5+hills));
}

function texture(type: typeof types[number], face='side') {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = type.id === 1 && face !== 'top' ? (type.side ?? type.color) : type.color;
  ctx.fillRect(0,0,16,16);
  for(let y=0;y<16;y++) for(let x=0;x<16;x++) {
    const n=random(x,y,type.id*3+(face==='top'?1:0));
    ctx.fillStyle=n>.5?`rgba(255,255,255,${(n-.5)*.27})`:`rgba(0,0,0,${(.5-n)*.3})`;
    ctx.fillRect(x,y,1,1);
  }
  if(type.id===1 && face==='side') {
    ctx.fillStyle='#649342'; ctx.fillRect(0,0,16,3);
    for(let x=0;x<16;x++){ ctx.fillStyle=x%2?'#739d4c':'#557c3e'; ctx.fillRect(x,2,1,2+Math.floor(random(x,4)*3)); }
  }
  if(type.id===4) {
    ctx.strokeStyle='#5d482e88'; ctx.lineWidth=1;
    if(face==='top') {for(let n=2;n<8;n+=2)ctx.strokeRect(n,n,16-n*2,16-n*2);}
    else {for(let x=1;x<16;x+=3){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+1,16);ctx.stroke();}}
  }
  if(type.id===7){ctx.fillStyle='#745b3988';for(let y=3;y<16;y+=4)ctx.fillRect(0,y,16,1);ctx.fillRect(5,0,1,3);ctx.fillRect(12,4,1,3);ctx.fillRect(8,8,1,3);}
  if(type.id===3){ctx.fillStyle='#4d575630';ctx.fillRect(2,4,4,2);ctx.fillRect(9,10,5,2);}
  const tex=new THREE.CanvasTexture(canvas);tex.magFilter=THREE.NearestFilter;tex.minFilter=THREE.NearestMipmapLinearFilter;tex.colorSpace=THREE.SRGBColorSpace;
  return { tex, url:canvas.toDataURL() };
}
const materials = new Map<number, THREE.MeshLambertMaterial[]>();
for(const type of types){
  const side=texture(type), top=texture(type,'top'), bottom=texture(type.id===1?types[1]:type,'bottom');
  const mat = (map: THREE.Texture)=>new THREE.MeshLambertMaterial({map});
  materials.set(type.id,[mat(side.tex),mat(side.tex),mat(top.tex),mat(bottom.tex),mat(side.tex),mat(side.tex)]);
  const button=document.createElement('button');button.className='slot'+(type.id===selected?' active':'');
  button.title=`${type.name} · ${type.id}`;button.setAttribute('aria-label',type.name);button.setAttribute('aria-pressed',String(type.id===selected));button.dataset.type=String(type.id);
  button.innerHTML=`<span class="number">${type.id}</span><img class="block-icon" src="${top.url}" alt="" /><span class="infinity">∞</span>`;
  button.onclick=()=>select(type.id);$('hotbar').append(button);
}
function select(id: number){selected=id;$('selected-name').textContent=types[id-1].name;document.querySelectorAll<HTMLElement>('.slot').forEach(b=>{b.classList.toggle('active',Number(b.dataset.type)===id);b.setAttribute('aria-pressed',String(Number(b.dataset.type)===id));});}

const renderer=new THREE.WebGLRenderer({canvas:$<HTMLCanvasElement>('world'),antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene();scene.background=new THREE.Color('#a9d4e0');scene.fog=new THREE.Fog('#a9d4e0',34,85);
const camera=new THREE.PerspectiveCamera(68,innerWidth/innerHeight,.05,180);camera.rotation.order='YXZ';
const hemi=new THREE.HemisphereLight(0xe6f7ff,0x667249,2.4);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xfff0cf,2.8);sun.position.set(-20,42,18);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-38,right:38,top:38,bottom:-38,near:1,far:100});sun.shadow.normalBias=.04;sun.shadow.bias=-.0001;scene.add(sun);
const blockGeometry=new THREE.BoxGeometry(1,1,1);
const clouds=new THREE.Group();scene.add(clouds);
const cloudMaterial=new THREE.MeshLambertMaterial({color:0xffffff});
for(let i=0;i<20;i++){
  const cloud=new THREE.Mesh(new THREE.BoxGeometry(4+random(i,0)*7,.6+random(i,2),2+random(i,3)*3),cloudMaterial);
  cloud.position.set((random(i,4)-.5)*110,21+random(i,5)*7,(random(i,6)-.5)*100);clouds.add(cloud);
}
const sunCube=new THREE.Mesh(new THREE.BoxGeometry(5,5,1),new THREE.MeshBasicMaterial({color:0xfff3bf}));sunCube.position.set(-38,40,-65);scene.add(sunCube);
const water=new THREE.Mesh(new THREE.PlaneGeometry(SIZE*2+1,SIZE*2+1),new THREE.MeshPhongMaterial({color:0x4eafb9,transparent:true,opacity:.68,shininess:90,depthWrite:false}));
water.rotation.x=-Math.PI/2;water.position.y=3.17;scene.add(water);
const ocean=new THREE.Mesh(new THREE.PlaneGeometry(300,300),new THREE.MeshLambertMaterial({color:0x6eb3c3}));ocean.rotation.x=-Math.PI/2;ocean.position.y=-.65;scene.add(ocean);
const outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.009,1.009,1.009)),new THREE.LineBasicMaterial({color:0xe8ffc7,transparent:true,opacity:.9}));outline.visible=false;scene.add(outline);
const ray=new THREE.Raycaster();ray.far=6;
const dummy=new THREE.Object3D();
const particles: { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number }[]=[];
const particleGeometry=new THREE.BoxGeometry(.085,.085,.085);
const particleMaterials=types.map(t=>new THREE.MeshLambertMaterial({color:t.color}));

function generate(){
  blocks.clear();
  for(let x=-SIZE;x<=SIZE;x++)for(let z=-SIZE;z<=SIZE;z++){
    const h=height(x,z);
    for(let y=0;y<=h;y++)blocks.set(key(x,y,z),y===h?(h<=3?6:1):y<h-2?3:2);
  }
  for(let x=-SIZE+3;x<SIZE-3;x++)for(let z=-SIZE+3;z<SIZE-3;z++){
    if(height(x,z)<4||random(x,z,8)>.014||Math.hypot(x,z-12)<5)continue;
    const h=height(x,z),trunk=3+Math.floor(random(x,z,9)*2);
    for(let y=h+1;y<=h+trunk;y++)blocks.set(key(x,y,z),4);
    for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=0;dy<=2;dy++){
      if(Math.abs(dx)+Math.abs(dz)+(dy===2?1:0)>3)continue;
      const k=key(x+dx,h+trunk+dy,z+dz);if(!blocks.has(k))blocks.set(k,5);
    }
  }
  for(const [k,v] of changes){if(v)blocks.set(k,v);else blocks.delete(k);}
}
function exposed(x: number,y: number,z: number){return directions.some(([a,b,c])=>!blocks.has(key(x+a,y+b,z+c)));}
function rebuild(){
  for(const m of meshes){scene.remove(m);m.dispose();}meshes=[];
  const groups: number[][][]=Array.from({length:8},()=>[]),visible=new Set<string>();
  for(const [k,t] of blocks){const [x,y,z]=k.split(',').map(Number);if(!exposed(x,y,z))continue;visible.add(k);groups[t].push([x,y,z]);
    if(!colliders.has(k))colliders.set(k,physics.createCollider(RAPIER.ColliderDesc.cuboid(.5,.5,.5).setTranslation(x,y,z)));
  }
  for(const [k,c] of colliders)if(!visible.has(k)){physics.removeCollider(c,true);colliders.delete(k);}
  for(let t=1;t<=7;t++){
    const positions=groups[t];if(!positions.length)continue;
    const mesh=new THREE.InstancedMesh(blockGeometry,materials.get(t),positions.length);mesh.userData.positions=positions;mesh.userData.type=t;
    positions.forEach(([x,y,z],i)=>{dummy.position.set(x,y,z);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
    mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();scene.add(mesh);meshes.push(mesh);
  }
}
function spawn(){
  const x=0,z=12;let top=0;
  for(let y=0;y<=32;y++)if(blocks.has(key(x,y,z)))top=y;
  body.setTranslation({x,y:top+1.5,z},true);body.setNextKinematicTranslation({x,y:top+1.5,z});
  verticalVelocity=0;yaw=-1.05;pitch=-.22;physics.step();updateCamera();
}
function updateCamera(){const p=body.translation();camera.position.set(p.x,p.y+.6,p.z);camera.rotation.set(pitch,yaw,0);}
function toast(message: string){if(disposed)return;$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>{if(!disposed)$('toast').classList.remove('visible');},3000);}
function snapshot(): Snapshot { const p=body.translation();return {version:1,seed,changes:[...changes],position:{x:p.x,y:p.y,z:p.z},yaw,pitch,selected,night}; }
async function saveWorld(notify=false){
  if(disposed)return false;
  $('save-state').textContent='保存中';
  try{await persist(snapshot());if(!disposed){$('save-state').innerHTML='<i data-lucide="check"></i> 已保存';refreshIcons();if(notify)toast('世界已保存');}return true;}
  catch(error){if(!disposed){$('save-state').textContent='未同步';if(notify)toast(error instanceof Error ? error.message : '保存失败，请重试');}return false;}
}
function scheduleSave(){$('save-state').textContent='保存中';clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveWorld(),500);}

function updateTarget(){
  ray.setFromCamera(new THREE.Vector2(0,0),camera);
  const hit=ray.intersectObjects(meshes,false)[0];target=null;outline.visible=false;$('target-label').textContent='';
  if(!hit||!active)return;
  const p=hit.object.userData.positions[hit.instanceId!];target={position:p,normal:hit.face!.normal.clone(),type:hit.object.userData.type};
  outline.position.set(p[0],p[1],p[2]);outline.visible=true;$('target-label').textContent=types[target.type-1].name;
}
let audioContext: AudioContext | undefined;
function sound(place=false){
  try{audioContext??=new AudioContext();const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type='triangle';osc.frequency.setValueAtTime(place?240:130,audioContext.currentTime);osc.frequency.exponentialRampToValueAtTime(55,audioContext.currentTime+.08);gain.gain.setValueAtTime(.045,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.09);osc.connect(gain);gain.connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+.1);}catch{}
}
function edit(place: boolean){
  if(!active)return;updateTarget();if(!target)return;
  let [x,y,z]=target.position;
  if(place){
    x+=Math.round(target.normal.x);y+=Math.round(target.normal.y);z+=Math.round(target.normal.z);
    if(Math.abs(x)>SIZE||Math.abs(z)>SIZE||y<0||y>32){toast('已到达世界边界');return;}
    if(changes.size>=30000&&!changes.has(key(x,y,z))){toast('已达到此世界的修改上限');return;}
    const p=body.translation();if(Math.abs(x-p.x)<.82&&Math.abs(z-p.z)<.82&&Math.abs(y-p.y)<1.35)return;
    if(blocks.has(key(x,y,z)))return;blocks.set(key(x,y,z),selected);changes.set(key(x,y,z),selected);placed++;
  }else{
    if(y===0){toast('已到达基岩层');return;}
    if(changes.size>=30000&&!changes.has(key(x,y,z))){toast('已达到此世界的修改上限');return;}
    for(let i=0;i<9;i++){const mesh=new THREE.Mesh(particleGeometry,particleMaterials[target.type-1]);mesh.position.set(x,y,z);scene.add(mesh);particles.push({mesh,velocity:new THREE.Vector3((Math.random()-.5)*3,Math.random()*3,(Math.random()-.5)*3),life:.6});}
    blocks.delete(key(x,y,z));changes.set(key(x,y,z),0);mined++;
  }
  sound(place);rebuild();physics.step();scheduleSave();updateTarget();
}

function toggleDay(value=!night){
  night=value;const sky=night?'#23344b':'#a9d4e0';scene.background=new THREE.Color(sky);scene.fog!.color.set(sky);
  hemi.intensity=night?.7:2.4;sun.intensity=night?.65:2.8;sun.color.set(night?0xb9d7ff:0xfff0cf);
  cloudMaterial.color.set(night?0x637185:0xffffff);sunCube.material.color.set(night?0xe3eef7:0xfff3bf);
  $('day-toggle').innerHTML=`<i data-lucide="${night?'moon':'sun'}"></i>`;refreshIcons();if(ready)scheduleSave();
}
function enter(){
  if(!ready)return;
  $<HTMLDialogElement>('menu').close();document.body.classList.remove('paused');
  if(touch){active=true;started=true;document.body.classList.add('playing');}
  else {$('world').requestPointerLock()?.catch(()=>toast('点击游戏画面继续'));}
}
function pause(){
  if(!started)return;active=false;keys.clear();joystick.x=joystick.y=0;$('stick').style.transform='';
  document.exitPointerLock?.();document.body.classList.add('paused');if(!$<HTMLDialogElement>('menu').open)$<HTMLDialogElement>('menu').showModal();void saveWorld();
}
listen(document,'pointerlockchange',()=>{
  if(document.pointerLockElement===$('world')){active=true;started=true;document.body.classList.add('playing');document.body.classList.remove('paused');}
  else if(started&&!$<HTMLDialogElement>('menu').open)pause();
});
listen(document,'mousemove',e=>{if(!active||touch)return;yaw-=e.movementX*.0023;pitch=THREE.MathUtils.clamp(pitch-e.movementY*.0023,-1.5,1.5);});
listen(document,'keydown',e=>{
  if(e.target instanceof HTMLInputElement)return;
  if(e.code==='Escape'&&active){e.preventDefault();pause();return;}
  if(!active)return;
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(e.code))e.preventDefault();
  keys.add(e.code);
  if(/^Digit[1-7]$/.test(e.code))select(+e.code.slice(-1));
  if(e.code==='Space'&&!e.repeat&&grounded)verticalVelocity=7.7;
});
listen(document,'keyup',e=>keys.delete(e.code));
listen(window,'blur',()=>{keys.clear();if(active)pause();});
listen(document,'visibilitychange',()=>{if(document.hidden&&active)pause();});
listen($('world'),'contextmenu',e=>e.preventDefault());
listen($('world'),'mousedown',e=>{if(touch)return;if(!active){if(started)enter();return;}if(e.button===0)edit(false);if(e.button===2)edit(true);});
listen($('world'),'wheel',e=>{if(!active)return;e.preventDefault();select((selected-1+(e.deltaY>0?1:6))%7+1);},{passive:false});
$('play').onclick=enter;$('resume').onclick=enter;$('close-menu').onclick=enter;$('pause').onclick=pause;
listen($('menu'),'cancel',e=>{e.preventDefault();enter();});
$('respawn').onclick=()=>{spawn();saveWorld();enter();};$('save').onclick=()=>saveWorld(true);
$('world-list').onclick=async()=>{if(await saveWorld())leave();else toast('存档尚未同步，请重试保存后返回');};
$('day-toggle').onclick=()=>toggleDay();
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('此浏览器不支持全屏');}};
$('break').onclick=()=>edit(false);$('place').onclick=()=>edit(true);$('jump').onpointerdown=e=>{e.preventDefault();if(active&&grounded)verticalVelocity=7.7;};
let lookPointer: { id: number; x: number; y: number } | null;
listen($('world'),'pointerdown',e=>{if(!touch||!active)return;lookPointer={id:e.pointerId,x:e.clientX,y:e.clientY};$('world').setPointerCapture(e.pointerId);});
listen($('world'),'pointermove',e=>{if(!lookPointer||e.pointerId!==lookPointer.id)return;yaw-=(e.clientX-lookPointer.x)*.005;pitch=THREE.MathUtils.clamp(pitch-(e.clientY-lookPointer.y)*.005,-1.5,1.5);lookPointer.x=e.clientX;lookPointer.y=e.clientY;});
const endLook=()=>{lookPointer=null;};listen($('world'),'pointerup',endLook);listen($('world'),'pointercancel',endLook);
let stickPointer: number | null;
function moveStick(e: PointerEvent){const r=$('joystick').getBoundingClientRect();let x=(e.clientX-r.left-r.width/2)/35,y=(e.clientY-r.top-r.height/2)/35;const len=Math.hypot(x,y);if(len>1){x/=len;y/=len;}joystick.x=x;joystick.y=y;$('stick').style.transform=`translate(${x*29}px,${y*29}px)`;}
$('joystick').onpointerdown=e=>{stickPointer=e.pointerId;$('joystick').setPointerCapture(e.pointerId);moveStick(e);};
$('joystick').onpointermove=e=>{if(e.pointerId===stickPointer)moveStick(e);};
const endStick=()=>{stickPointer=null;joystick.x=joystick.y=0;$('stick').style.transform='';};$('joystick').onpointerup=endStick;$('joystick').onpointercancel=endStick;
listen(window,'resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});

function step(dt: number){
  let x=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+joystick.x;
  let z=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)+joystick.y;
  const length=Math.hypot(x,z);if(length>1){x/=length;z/=length;}
  const speed=keys.has('ShiftLeft')||keys.has('ShiftRight')?7:4.4;
  verticalVelocity=Math.max(verticalVelocity-22*dt,-25);
  const desired={x:(x*Math.cos(yaw)+z*Math.sin(yaw))*speed*dt,y:verticalVelocity*dt,z:(-x*Math.sin(yaw)+z*Math.cos(yaw))*speed*dt};
  controller.computeColliderMovement(playerCollider,desired);
  const movement=controller.computedMovement(),p=body.translation();
  body.setNextKinematicTranslation({x:p.x+movement.x,y:p.y+movement.y,z:p.z+movement.z});
  grounded=controller.computedGrounded();if(grounded&&verticalVelocity<0)verticalVelocity=0;
  if(verticalVelocity>0&&movement.y<desired.y-.001)verticalVelocity=0;
  physics.timestep=dt;physics.step();if(body.translation().y<-8)spawn();updateCamera();
}
let last=0,accumulator=0,frames=0;
function animate(time: number){
  if(disposed)return;
  animationId=requestAnimationFrame(animate);const dt=Math.min((time-last)/1000,.05);last=time;
  if(active){accumulator+=dt;while(accumulator>=1/60){step(1/60);accumulator-=1/60;}}
  else accumulator=0;
  clouds.position.x=Math.sin(time*.000015)*4;
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.velocity.y-=9*dt;p.mesh.position.addScaledVector(p.velocity,dt);p.mesh.scale.setScalar(Math.max(0,p.life/.6));if(p.life<=0){scene.remove(p.mesh);particles.splice(i,1);}}
  camera.updateMatrixWorld();if(active&&frames%3===0)updateTarget();if(!active)outline.visible=false;
  if(ready&&frames%15===0){const p=body.translation();$('coordinates').textContent=`X ${Math.round(p.x)} / Y ${Math.round(p.y)} / Z ${Math.round(p.z)}`;const compass=['N','NW','W','SW','S','SE','E','NE'];$('compass').textContent=compass[((Math.round(yaw/(Math.PI/4))%8)+8)%8];}
  frames++;renderer.render(scene,camera);
}
async function init(){
  physics=new RAPIER.World({x:0,y:-22,z:0});
  if(saved?.version===1&&Array.isArray(saved.changes))for(const entry of saved.changes){if(Array.isArray(entry)&&/^-?\d+,-?\d+,-?\d+$/.test(entry[0])&&Number.isInteger(entry[1])&&entry[1]>=0&&entry[1]<=7){const [x,y,z]=entry[0].split(',').map(Number);if(Math.abs(x)<=SIZE&&Math.abs(z)<=SIZE&&y>0&&y<=32)changes.set(entry[0],entry[1]);}}
  generate();rebuild();
  body=physics.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());playerCollider=physics.createCollider(RAPIER.ColliderDesc.capsule(.5,.3),body);
  controller=physics.createCharacterController(.015);controller.enableSnapToGround(.2);controller.enableAutostep(.4,.2,false);spawn();
  if(saved.position&&Object.values(saved.position).every(Number.isFinite)&&Math.abs(saved.position.x)<=SIZE&&Math.abs(saved.position.z)<=SIZE&&saved.position.y>0&&saved.position.y<36){body.setTranslation(saved.position,true);body.setNextKinematicTranslation(saved.position);yaw=Number.isFinite(saved.yaw)?saved.yaw:yaw;pitch=THREE.MathUtils.clamp(Number.isFinite(saved.pitch)?saved.pitch:pitch,-1.5,1.5);physics.step();updateCamera();}
  if(saved?.selected>=1&&saved.selected<=7)select(saved.selected);if(saved?.night)toggleDay(true);
  ready=true;$('world-seed').textContent=`世界 ${String(seed).padStart(4,'0')}`;
  $<HTMLButtonElement>('play').disabled=false;$('play').innerHTML='<i data-lucide="play"></i><span>进入世界</span>';refreshIcons();
  if(saved)$('gate-meta').textContent='青木河谷 · 继续上次的世界';
  // Read-only diagnostics make browser smoke tests inspect the real simulation.
  window.__voxel={getState:()=>({ready,active,seed,selected,night,grounded,yaw,pitch,position:{...body.translation()},target:target?{position:[...target.position],normal:target.normal.toArray(),type:target.type}:null,changes:changes.size,mined,placed,blocks:blocks.size,drawCalls:renderer.info.render.calls})};
  animationId=requestAnimationFrame(animate);saveInterval=setInterval(()=>{if(active)void saveWorld();},15000);
}
await init();
return {
  snapshot, save: () => saveWorld(true),
  dispose() {
    disposed=true;active=false;events.abort();cancelAnimationFrame(animationId);clearInterval(saveInterval);clearTimeout(saveTimer);clearTimeout(toastTimer);
    document.exitPointerLock?.();document.body.classList.remove('playing','paused','touch');
    const geometries=new Set<THREE.BufferGeometry>(), mats=new Set<THREE.Material>(), textures=new Set<THREE.Texture>();
    scene.traverse(object=>{if(object instanceof THREE.Mesh||object instanceof THREE.LineSegments){geometries.add(object.geometry);for(const mat of (Array.isArray(object.material)?object.material:[object.material])){mats.add(mat);if('map' in mat&&mat.map instanceof THREE.Texture)textures.add(mat.map);}}});
    for(const materialList of materials.values())for(const mat of materialList){mats.add(mat);if(mat.map)textures.add(mat.map);}
    geometries.add(particleGeometry);particleMaterials.forEach(mat=>mats.add(mat));
    geometries.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
    meshes.forEach(m=>m.dispose());physics.free();renderer.dispose();renderer.forceContextLoss();void audioContext?.close();
    delete window.__voxel;
  },
};
}
export type GameHandle = Awaited<ReturnType<typeof startGame>>;
