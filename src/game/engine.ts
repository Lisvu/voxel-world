import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { createIcons, Box, Check, Sun, Moon, Maximize, Pause, Play, LoaderCircle, Layers3, Pickaxe, Plus, ArrowUp, X, MapPin, Save, Sprout } from 'lucide';
import { blockTypes, defaults, readSettings, placementError, type Settings } from './features';
import { VoxelWorld, WORLD_LIMIT, HEIGHT, biomeNames } from './world';
import { ChunkRenderer } from './ChunkRenderer';
import { Creatures, creatureTypes } from './Creatures';
import { applyDamage, fallDamage, addItem, consumeItem, deathInventory, type Mode, type Inventory } from './rules';
import { Weather, weatherNames, type WeatherChoice } from './Weather';
import type { WorldDrop } from '../../shared/contracts';
import { advanceTime, clockState } from './clock';
import type { Species } from '../../shared/contracts';
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
const SIZE = WORLD_LIMIT;
const worldData = new VoxelWorld(initial.seed, initial.generatorVersion ?? 1, initial.changes);
const changes = worldData.changes;
let timeSeconds = initial.timeSeconds ?? (initial.night ? 450 : 150);
let egg: Species | null = null;
let gameMode:Mode=initial.gameMode ?? 'creative', health=gameMode==='creative'?20:(initial.health ?? 20), keepInventory=initial.keepInventory ?? false;
let inventory:Inventory={...(initial.inventory ?? {})},drops:WorldDrop[]=structuredClone(initial.drops ?? []);
let weatherChoice:WeatherChoice=initial.weather ?? 'auto';
let hazardTimer=0,underwaterTime=0,fallPeak=0,dead=false;
const colliders = new Map<string, RAPIER.Collider>();
const directions = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const types = blockTypes;
let settings = readSettings();
const key = (x: number,y: number,z: number) => `${x},${y},${z}`;
let seed = initial.seed, selected = 1, active = false, started = false, ready = false;
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
  button.onclick=()=>select(type.id);if(type.id<=7)$('hotbar').append(button);
  const card = document.createElement('button'); card.className='material-card'; card.dataset.type=String(type.id); card.setAttribute('aria-pressed', 'false');
  card.innerHTML=`<img src="${top.url}" alt="" /><strong>${type.name}</strong><span>${type.description}</span><small>${type.id<=7?'快捷键 '+type.id:'图鉴选取'} · 无限供应</small>`;
  card.onclick=()=>{select(type.id);if(gameMode==='creative'){addItem(inventory,type.id,64);updateInventory();}toast(gameMode==='creative'?`已添加 64 个${type.name}，创造模式可无限放置`:`已选择${type.name}`);};$('material-grid').append(card);
}
function select(id: number){egg=null;selected=id;document.querySelectorAll('.egg-card').forEach(b=>b.setAttribute('aria-pressed','false'));$('selected-name').textContent=types[id-1].name;document.querySelectorAll<HTMLElement>('.slot, .material-card').forEach(b=>{b.classList.toggle('active',Number(b.dataset.type)===id);b.setAttribute('aria-pressed',String(Number(b.dataset.type)===id));});if(ready)scheduleSave();}

const renderer=new THREE.WebGLRenderer({canvas:$<HTMLCanvasElement>('world'),antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene();scene.background=new THREE.Color('#a9d4e0');scene.fog=new THREE.Fog('#a9d4e0',24,48);
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
const chunkRenderer=new ChunkRenderer(worldData,scene,materials);
const creatures=new Creatures(worldData,scene,initial.creatures ?? []);
const weatherSystem=new Weather(scene,seed,worldData);
const dropMeshes=new Map<string,THREE.Mesh>();
const dropGeometry=new THREE.BoxGeometry(.4,.4,.4),dropMaterial=new THREE.MeshLambertMaterial({color:0xd1ac68});
const outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.009,1.009,1.009)),new THREE.LineBasicMaterial({color:0xe8ffc7,transparent:true,opacity:.9}));outline.visible=false;scene.add(outline);
const preview = new THREE.Mesh(new THREE.BoxGeometry(1.015,1.015,1.015), new THREE.MeshBasicMaterial({color:0x83df9d, transparent:true, opacity:.38, depthWrite:false}));
preview.visible=false;scene.add(preview);
const ray=new THREE.Raycaster();ray.far=6;
const mapCanvas=$<HTMLCanvasElement>('minimap-canvas'), mapContext=mapCanvas.getContext('2d')!;
const terrain=document.createElement('canvas');terrain.width=terrain.height=113;
const terrainContext=terrain.getContext('2d')!;
let mapX=Infinity,mapZ=Infinity;
function rebuildMap(){
  if(!body)return;const p=body.translation();mapX=Math.round(p.x/8)*8;mapZ=Math.round(p.z/8)*8;
  for(let x=0;x<113;x++)for(let z=0;z<113;z++){
    const wx=mapX+x-56,wz=mapZ+z-56,h=worldData.top(wx,wz),type=worldData.get(wx,h,wz);
    terrainContext.fillStyle=h<worldData.waterLevel(wx,wz)?'#4eafb9':types[type-1]?.color??'#4eafb9';terrainContext.fillRect(x,z,1,1);
  }
}
function drawMap(){
  if($('minimap').classList.contains('collapsed'))return;
  const p=body.translation();if(Math.abs(p.x-mapX)>8||Math.abs(p.z-mapZ)>8)rebuildMap();
  const ctx=mapContext, scale=mapCanvas.width/113;ctx.imageSmoothingEnabled=false;ctx.drawImage(terrain,0,0,mapCanvas.width,mapCanvas.height);
  const sx=(56-mapX)*scale,sz=(56+12-mapZ)*scale;
  if(sx>=0&&sx<mapCanvas.width&&sz>=0&&sz<mapCanvas.height){ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.strokeRect(sx-3,sz-3,6,6);}
  ctx.save();ctx.translate((56+p.x-mapX)*scale,(56+p.z-mapZ)*scale);ctx.rotate(-yaw);ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(5,5);ctx.lineTo(0,3);ctx.lineTo(-5,5);ctx.closePath();ctx.fillStyle='#fff';ctx.strokeStyle='#182d22';ctx.fill();ctx.stroke();ctx.restore();
}
function applySettings(){
  camera.fov=settings.fov;camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio,{low:1,medium:1.5,high:2}[settings.quality]));
  renderer.shadowMap.enabled=settings.shadows;scene.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])m.needsUpdate=true;});
}
function displaySettings(){
  for(const name of ['sensitivity','touchSensitivity','fov','volume'] as const){$<HTMLInputElement>(`setting-${name}`).value=String(settings[name]);$(`value-${name}`).textContent=String(settings[name]);}
  $<HTMLSelectElement>('setting-quality').value=settings.quality;$<HTMLInputElement>('setting-shadows').checked=settings.shadows;
}
function openPanel(id:string){
  active=false;keys.clear();joystick.x=joystick.y=0;$('stick').style.transform='';
  $<HTMLDialogElement>('menu').close();$<HTMLDialogElement>(id).showModal();document.exitPointerLock?.();document.body.classList.add('paused');void saveWorld();
}
function closePanel(id:string){$<HTMLDialogElement>(id).close();pause();}
$('open-settings').onclick=()=>openPanel('settings-panel');$('open-materials').onclick=()=>openPanel('materials-panel');
$('menu-settings').onclick=()=>openPanel('settings-panel');$('menu-materials').onclick=()=>openPanel('materials-panel');
for(const id of ['settings-panel','materials-panel']){ $(`${id}-close`).onclick=()=>closePanel(id);listen($(id),'cancel',e=>{e.preventDefault();closePanel(id);}); }
for(const name of ['sensitivity','touchSensitivity','fov','volume','quality','shadows'] as const){listen($(`setting-${name}`),'input',()=>{
  const input=$<HTMLInputElement>(`setting-${name}`);
  settings={...settings,[name]:name==='shadows'?input.checked:name==='quality'?input.value:Number(input.value)} as Settings;
  displaySettings();applySettings();try{localStorage.setItem('voxel-settings-v1',JSON.stringify(settings));}catch{toast('浏览器无法保存设置，本次游戏仍然生效');}
});}
$('reset-settings').onclick=()=>{settings={...defaults};displaySettings();applySettings();try{localStorage.setItem('voxel-settings-v1',JSON.stringify(settings));}catch{toast('设置仅在本次游戏生效');}};
$('minimap-toggle').onclick=()=>{const collapsed=$('minimap').classList.toggle('collapsed');$('minimap-toggle').setAttribute('aria-expanded',String(!collapsed));$('minimap-toggle').textContent=collapsed?'展开地图':'收起地图';};
$('minimap-expand').onclick=()=>{const large=$('minimap').classList.toggle('large');$('minimap-expand').textContent=large?'缩小':'放大';};
displaySettings();applySettings();
for(const type of creatureTypes){
  const button=document.createElement('button');button.className='material-card egg-card';button.dataset.species=type.id;button.setAttribute('aria-pressed','false');
  button.innerHTML=`<span class="egg-icon" style="background:${type.color}"></span><strong>${type.name}生物蛋</strong><span>${type.habitat}</span><small>选中后右键／放置生成</small>`;
  button.onclick=()=>{if(gameMode!=='creative'){toast('生物蛋仅在创造模式中可自由领取');return;}egg=type.id;document.querySelectorAll<HTMLElement>('.slot,.material-card').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false');});button.classList.add('active');button.setAttribute('aria-pressed','true');$('selected-name').textContent=type.name+'生物蛋';toast('关闭图鉴后，对准地面或水底放置');};$('creature-grid').append(button);
}

const particles: { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number }[]=[];
const particleGeometry=new THREE.BoxGeometry(.085,.085,.085);
const particleMaterials=types.map(t=>new THREE.MeshLambertMaterial({color:t.color}));

let colliderX=Infinity,colliderY=Infinity,colliderZ=Infinity,centerX=Infinity,centerZ=Infinity;
function updateColliders(force=false){
  const p=body.translation(),px=Math.round(p.x),py=Math.round(p.y),pz=Math.round(p.z);
  if(!force&&Math.abs(px-colliderX)<2&&Math.abs(py-colliderY)<2&&Math.abs(pz-colliderZ)<2)return;
  colliderX=px;colliderY=py;colliderZ=pz;const wanted=new Set<string>();
  for(let x=px-9;x<=px+9;x++)for(let z=pz-9;z<=pz+9;z++)for(let y=Math.max(0,py-5);y<=Math.min(HEIGHT-1,py+5);y++){
    if(!worldData.get(x,y,z)||!directions.some(([a,b,c])=>!worldData.get(x+a,y+b,z+c)))continue;
    const k=key(x,y,z);wanted.add(k);if(!colliders.has(k))colliders.set(k,physics.createCollider(RAPIER.ColliderDesc.cuboid(.5,.5,.5).setTranslation(x,y,z)));
  }
  for(const [k,c] of colliders)if(!wanted.has(k)){physics.removeCollider(c,true);colliders.delete(k);}
}
function stream(){
  const p=body.translation(),cx=Math.floor(p.x/16),cz=Math.floor(p.z/16);
  if(cx!==centerX||cz!==centerZ){centerX=cx;centerZ=cz;chunkRenderer.updateCenter(p.x,p.z,2);creatures.stream(p.x,p.z);}
  chunkRenderer.tick();
}
function updateInventory(){
  $('mode-label').textContent=gameMode==='creative'?'创造模式':'生存模式';$('menu-mode').textContent=gameMode==='creative'?'创造模式':'生存模式';
  $('health-hud').hidden=gameMode==='creative';$('health-value').textContent=`生命 ${Math.ceil(health)} / 20`;
  $('health-fill').style.width=`${health/20*100}%`;
  $('inventory-description').textContent=gameMode==='creative'?'点击材料添加 64 个；创造模式无限供应，不会阵亡。':'挖掘获得材料，放置消耗一个。死亡时可返回掉落地点拾取物品。';
  for(const button of document.querySelectorAll<HTMLElement>('.slot')){const id=Number(button.dataset.type);button.querySelector('.infinity')!.textContent=gameMode==='creative'?'∞':String(inventory[id]??0);}
  for(const button of document.querySelectorAll<HTMLElement>('#material-grid .material-card')){const id=Number(button.dataset.type);button.querySelector('small')!.textContent=gameMode==='creative'?`添加 64 个 · 已领取 ${inventory[id]??0}`:`背包数量 ${inventory[id]??0}`;}
  for(const button of document.querySelectorAll<HTMLButtonElement>('.egg-card'))button.disabled=gameMode!=='creative';
  $<HTMLSelectElement>('game-mode').value=gameMode;$<HTMLInputElement>('keep-inventory').checked=keepInventory;
  $<HTMLSelectElement>('weather-choice').value=weatherChoice;
}
function updateDrops(){
  const p=body.translation();
  for(const drop of [...drops]){
    const distance=Math.hypot(drop.position.x-p.x,drop.position.y-p.y,drop.position.z-p.z);
    if(distance<2&&active&&gameMode==='survival'){
      for(const [id,count] of Object.entries(drop.items)){const amount=Math.min(count,9999-(inventory[id]??0));addItem(inventory,Number(id),amount);drop.items[id]-=amount;}
      if(Object.values(drop.items).every(n=>n===0))drops=drops.filter(d=>d.id!==drop.id);
      updateInventory();scheduleSave();
    }
    if(distance<60&&!dropMeshes.has(drop.id)){const mesh=new THREE.Mesh(dropGeometry,dropMaterial);mesh.position.set(drop.position.x,drop.position.y,drop.position.z);scene.add(mesh);dropMeshes.set(drop.id,mesh);}
  }
  for(const [id,mesh] of dropMeshes){const drop=drops.find(d=>d.id===id);if(!drop||Math.hypot(mesh.position.x-p.x,mesh.position.z-p.z)>64){scene.remove(mesh);dropMeshes.delete(id);}else mesh.rotation.y=timeSeconds;}
}
function damage(amount:number,reason:string){
  if(dead||gameMode==='creative')return;health=applyDamage(gameMode,health,amount);updateInventory();
  if(health<=0){
    dead=true;active=false;keys.clear();document.exitPointerLock?.();document.body.classList.add('paused');
    const p=body.translation(),retained=keepInventory||drops.length>=64,result=deathInventory(inventory,retained);
    if(Object.values(result.dropped).some(n=>n>0)){
      // At the bounded drop limit retain this inventory instead of silently deleting it.
      if(drops.length<64){drops.push({id:crypto.randomUUID(),position:{x:p.x,y:Math.max(.8,Math.min(95,p.y)),z:p.z},items:result.dropped});inventory=result.inventory;}
    }else inventory=result.inventory;
    $('death-reason').textContent=reason+'。'+(retained?'物品已保留。':'物品留在死亡地点，靠近即可拾取。');
    $<HTMLDialogElement>('death-panel').showModal();
  }else toast(`${reason} · 生命 -${amount}`);
  scheduleSave();
}
$('respawn-death').onclick=()=>{dead=false;health=20;underwaterTime=0;$<HTMLDialogElement>('death-panel').close();spawn();updateInventory();scheduleSave();enter();};
listen($('death-panel'),'cancel',e=>e.preventDefault());
listen($('keep-inventory'),'change',()=>{keepInventory=$<HTMLInputElement>('keep-inventory').checked;updateInventory();scheduleSave();});
listen($('game-mode'),'change',()=>{gameMode=$<HTMLSelectElement>('game-mode').value as Mode;health=20;egg=null;underwaterTime=0;fallPeak=body.translation().y;updateInventory();scheduleSave();});
listen($('weather-choice'),'change',()=>{weatherChoice=$<HTMLSelectElement>('weather-choice').value as WeatherChoice;updateDay();scheduleSave();});
function spawn(){
  const x=0,z=12,top=worldData.top(x,z);
  body.setTranslation({x,y:top+1.5,z},true);body.setNextKinematicTranslation({x,y:top+1.5,z});
  verticalVelocity=0;fallPeak=top+1.5;yaw=-1.05;pitch=-.22;updateColliders(true);physics.step();updateCamera();
}
function updateCamera(){const p=body.translation();camera.position.set(p.x,p.y+.6,p.z);camera.rotation.set(pitch,yaw,0);}
function toast(message: string){if(disposed)return;$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>{if(!disposed)$('toast').classList.remove('visible');},3000);}
function snapshot(): Snapshot { const p=body.translation();return {version:1,seed,changes:[...changes],position:{x:p.x,y:p.y,z:p.z},yaw,pitch,selected,night,generatorVersion:worldData.generatorVersion as 1|2,timeSeconds,creatures:creatures.snapshot(),gameMode,health,keepInventory,inventory:{...inventory},drops:structuredClone(drops),weather:weatherChoice}; }
async function saveWorld(notify=false){
  if(disposed)return false;
  $('save-state').textContent='保存中';
  try{await persist(snapshot());if(!disposed){$('save-state').innerHTML='<i data-lucide="check"></i> 已保存';refreshIcons();if(notify)toast('世界已保存');}return true;}
  catch(error){if(!disposed){$('save-state').textContent='未同步';if(notify)toast(error instanceof Error ? error.message : '保存失败，请重试');}return false;}
}
function scheduleSave(){$('save-state').textContent='保存中';clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveWorld(),500);}

function updateTarget(){
  ray.setFromCamera(new THREE.Vector2(0,0),camera);
  const hit=ray.intersectObjects(egg==='fish'?[...chunkRenderer.meshes,...chunkRenderer.liquids]:chunkRenderer.meshes,false)[0];target=null;outline.visible=false;preview.visible=false;$('target-label').textContent='';
  if(!active)return;if(!hit){$('target-label').textContent='请对准 6 格内的方块';return;}
  const normal=hit.face!.normal.clone(),p=[Math.floor(hit.point.x+.5-normal.x*.01),Math.floor(hit.point.y+.5-normal.y*.01),Math.floor(hit.point.z+.5-normal.z*.01)];target={position:p,normal,type:hit.object.userData.water?6:worldData.get(p[0],p[1],p[2])};
  outline.position.set(p[0],p[1],p[2]);outline.visible=true;const [x,y,z]=placement();const reason=egg?'':canPlace(x,y,z);preview.position.set(x,y,z);preview.material.color.set(reason?0xf16d68:0x83df9d);preview.visible=true;
  $('target-label').textContent=`${types[target.type-1].name} · ${egg?'生成'+creatureTypes.find(c=>c.id===egg)!.name:reason||'可放置 '+types[selected-1].name}`;
}
function placement(){const p=target!.position,n=target!.normal;return [p[0]+Math.round(n.x),p[1]+Math.round(n.y),p[2]+Math.round(n.z)];}
function canPlace(x:number,y:number,z:number){if(gameMode==='survival'&&(inventory[selected]??0)===0)return '背包里没有这种材料，先挖掘收集';return placementError(x,y,z,body.translation(),!!worldData.get(x,y,z),changes.size>=30000&&!changes.has(key(x,y,z)));}
function pickMaterial(){if(!active)return;updateTarget();if(target){select(target.type);toast(`已选择${types[target.type-1].name}`);}else toast('请对准 6 格内的方块');}
let audioContext: AudioContext | undefined;
function sound(place=false){
  if(settings.volume===0)return;
  try{audioContext??=new AudioContext();const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type='triangle';osc.frequency.setValueAtTime(place?240:130,audioContext.currentTime);osc.frequency.exponentialRampToValueAtTime(55,audioContext.currentTime+.08);gain.gain.setValueAtTime(.045*settings.volume/100,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.09);osc.connect(gain);gain.connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+.1);}catch{}
}
function edit(place: boolean){
  if(!active)return;updateTarget();if(!target)return;
  let [x,y,z]=target.position;
  if(place){
    x+=Math.round(target.normal.x);y+=Math.round(target.normal.y);z+=Math.round(target.normal.z);
    if(egg){if(gameMode!=='creative')return;const player=body.translation();if(egg!=='fish'&&Math.hypot(x-player.x,z-player.z)<1.5){toast('请在离你稍远的地方生成生物');return;}const ySpawn=egg==='fish'?Math.min(worldData.waterLevel(x,z)-1,y):y-.5;const error=creatures.spawn(egg,x,ySpawn,z);toast(error||'生物已生成');if(!error)scheduleSave();return;}
    const reason=canPlace(x,y,z);if(reason){toast(reason);return;}
    if(!consumeItem(gameMode,inventory,selected)){toast('材料不足');return;}
    worldData.set(x,y,z,selected);placed++;
  }else{
    if(y===0){toast('已到达基岩层');return;}
    if(changes.size>=30000&&!changes.has(key(x,y,z))){toast('已达到此世界的修改上限');return;}
    for(let i=0;i<9;i++){const mesh=new THREE.Mesh(particleGeometry,particleMaterials[target.type-1]);mesh.position.set(x,y,z);scene.add(mesh);particles.push({mesh,velocity:new THREE.Vector3((Math.random()-.5)*3,Math.random()*3,(Math.random()-.5)*3),life:.6});}
    if(gameMode==='survival')addItem(inventory,target.type);
    worldData.set(x,y,z,0);mined++;
  }
  updateInventory();sound(place);chunkRenderer.rebuild(x,z);updateColliders(true);rebuildMap();physics.step();scheduleSave();updateTarget();
}

let clockLabel='';
function updateDay(){
  const state=clockState(timeSeconds),p=body.translation(),twilight=worldData.biome(Math.round(p.x),Math.round(p.z))==='twilight';night=state.night;
  const biome=worldData.biome(Math.round(p.x),Math.round(p.z));
  const thunder=weatherSystem.update(timeSeconds,new THREE.Vector3(p.x,p.y,p.z),state.daylight,biome,weatherChoice);
  if(thunder&&settings.volume>0)sound(false);
  $('weather-label').textContent=weatherNames[weatherSystem.kind];
  const overcast=weatherSystem.kind==='clear'?1:weatherSystem.kind==='cloudy'?.75:.5;
  const daylight=(twilight?state.daylight*.55:state.daylight)*overcast;
  const sky=new THREE.Color('#18243e').lerp(new THREE.Color(twilight?'#827095':'#a9d4e0'),daylight);scene.background=sky;scene.fog!.color.copy(sky);
  hemi.intensity=.55+daylight*1.85;sun.intensity=.25+state.daylight*2.55;
  const angle=(state.hour-6)/24*Math.PI*2;sun.position.set(p.x+Math.cos(angle)*35,p.y+Math.max(12,Math.sin(angle)*45),p.z+18);sun.target.position.set(p.x,p.y,p.z);sun.target.updateMatrixWorld();
  sunCube.position.set(p.x+Math.cos(angle)*65,p.y+Math.sin(angle)*65,p.z-65);sunCube.material.color.set(night?0xdce8ff:0xffe4ae);
  clouds.position.x=p.x+Math.sin(timeSeconds*.01)*4;clouds.position.z=p.z;clouds.position.y=65;clouds.scale.setScalar(weatherSystem.kind==='clear'?1:1.6);cloudMaterial.color.set(weatherSystem.kind==='thunder'?0x586171:night?0x637185:0xffffff);
  if(clockLabel!==state.label){clockLabel=state.label;$('world-clock').textContent=state.label;$('day-toggle').title='跳至'+(night?'清晨':'夜晚');$('day-toggle').setAttribute('aria-label',$('day-toggle').title);}
}
function toggleDay(){const state=clockState(timeSeconds);timeSeconds=Math.floor(timeSeconds/600)*600+(state.night?150:450);updateDay();scheduleSave();}
let dragControls=false, entering=false;
function activate(){
  if(disposed||dead)return;
  last=performance.now();active=true;started=true;
  $('world').focus({preventScroll:true});
  document.body.classList.add('playing');document.body.classList.remove('paused');
}
function useDragControls(){
  if(!entering||disposed)return;
  entering=false;dragControls=true;activate();
  $('control-hint').hidden=false;
  toast('已进入世界：按住鼠标拖动转向，WASD 移动');
}
function enter(){
  if(!ready||dead||entering)return;
  $<HTMLDialogElement>('menu').close();document.body.classList.remove('paused');
  if(touch||dragControls){activate();return;}
  entering=true;
  try {
    if(typeof $('world').requestPointerLock!=='function'){useDragControls();return;}
    $('world').requestPointerLock()?.catch(useDragControls);
  } catch {useDragControls();}
}
listen(document,'pointerlockerror',useDragControls);
function pause(){
  entering=false;lookPointer=null;if(!started)return;active=false;keys.clear();joystick.x=joystick.y=0;$('stick').style.transform='';
  document.exitPointerLock?.();document.body.classList.add('paused');if(!$<HTMLDialogElement>('menu').open)$<HTMLDialogElement>('menu').showModal();void saveWorld();
}
listen(document,'pointerlockchange',()=>{
  if(document.pointerLockElement===$('world')){entering=false;dragControls=false;$('control-hint').hidden=true;activate();}
  else if(started&&!document.querySelector('dialog[open]'))pause();
});
listen(document,'mousemove',e=>{if(!active||touch||document.pointerLockElement!==$('world'))return;yaw-=e.movementX*.0023*settings.sensitivity;pitch=THREE.MathUtils.clamp(pitch-e.movementY*.0023*settings.sensitivity,-1.5,1.5);});
listen(document,'keydown',e=>{
  if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement||document.querySelector('#settings-panel[open], #materials-panel[open]'))return;
  if(e.code==='Escape'&&active){e.preventDefault();pause();return;}
  if(!active)return;
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(e.code))e.preventDefault();
  if(e.code==='KeyE'){e.preventDefault();openPanel('materials-panel');return;}
  if(e.code==='KeyB'){e.preventDefault();pickMaterial();return;}
  if(e.code==='KeyM'){e.preventDefault();$(e.shiftKey?'minimap-expand':'minimap-toggle').click();return;}
  keys.add(e.code);
  if(/^Digit[1-7]$/.test(e.code))select(+e.code.slice(-1));
  if(e.code==='Space'&&!e.repeat&&grounded)verticalVelocity=7.7;
});
listen(document,'keyup',e=>keys.delete(e.code));
listen(window,'blur',()=>{keys.clear();if(active)pause();});
listen(document,'visibilitychange',()=>{if(document.hidden&&active)pause();});
listen($('world'),'contextmenu',e=>e.preventDefault());
listen($('world'),'mousedown',e=>{if(touch||dragControls)return;if(!active){if(started)enter();return;}if(e.button===0)edit(false);if(e.button===2)edit(true);if(e.button===1){e.preventDefault();pickMaterial();}});
listen($('world'),'wheel',e=>{if(!active)return;e.preventDefault();select((selected-1+(e.deltaY>0?1:6))%7+1);},{passive:false});
$('play').onclick=enter;$('resume').onclick=enter;$('close-menu').onclick=enter;$('pause').onclick=pause;
listen($('menu'),'cancel',e=>{e.preventDefault();enter();});
$('respawn').onclick=()=>{spawn();saveWorld();enter();};$('save').onclick=()=>saveWorld(true);
$('world-list').onclick=async()=>{if(await saveWorld())leave();else toast('存档尚未同步，请重试保存后返回');};
$('day-toggle').onclick=()=>toggleDay();
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('此浏览器不支持全屏');}};
$('pick-material').onclick=pickMaterial;
$('break').onclick=()=>edit(false);$('place').onclick=()=>edit(true);$('jump').onpointerdown=e=>{e.preventDefault();if(active)verticalVelocity=grounded?7.7:body.translation().y<worldData.waterLevel(Math.round(body.translation().x),Math.round(body.translation().z))?3:verticalVelocity;};
let lookPointer: { id:number; x:number; y:number; startX:number; startY:number; button:number; moved:boolean } | null;
listen($('world'),'pointerdown',e=>{
  if((!touch&&!dragControls)||!active)return;
  lookPointer={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,button:e.button,moved:false};
  $('world').setPointerCapture(e.pointerId);
});
listen($('world'),'pointermove',e=>{
  if(!active||!lookPointer||e.pointerId!==lookPointer.id)return;
  if(Math.hypot(e.clientX-lookPointer.startX,e.clientY-lookPointer.startY)>5)lookPointer.moved=true;
  const sensitivity=touch ? .005*settings.touchSensitivity : .0023*settings.sensitivity;
  yaw-=(e.clientX-lookPointer.x)*sensitivity;pitch=THREE.MathUtils.clamp(pitch-(e.clientY-lookPointer.y)*sensitivity,-1.5,1.5);
  lookPointer.x=e.clientX;lookPointer.y=e.clientY;
});
listen($('world'),'pointerup',e=>{
  if(!lookPointer||e.pointerId!==lookPointer.id)return;
  const pointer=lookPointer;lookPointer=null;
  if(active&&dragControls&&!pointer.moved){if(pointer.button===0)edit(false);if(pointer.button===2)edit(true);if(pointer.button===1)pickMaterial();}
});
listen($('world'),'pointercancel',()=>{lookPointer=null;});
listen($('world'),'lostpointercapture',()=>{lookPointer=null;});
let stickPointer: number | null;
function moveStick(e: PointerEvent){const r=$('joystick').getBoundingClientRect();let x=(e.clientX-r.left-r.width/2)/35,y=(e.clientY-r.top-r.height/2)/35;const len=Math.hypot(x,y);if(len>1){x/=len;y/=len;}joystick.x=x;joystick.y=y;$('stick').style.transform=`translate(${x*29}px,${y*29}px)`;}
$('joystick').onpointerdown=e=>{stickPointer=e.pointerId;$('joystick').setPointerCapture(e.pointerId);moveStick(e);};
$('joystick').onpointermove=e=>{if(e.pointerId===stickPointer)moveStick(e);};
const endStick=()=>{stickPointer=null;joystick.x=joystick.y=0;$('stick').style.transform='';};$('joystick').onpointerup=endStick;$('joystick').onpointercancel=endStick;
listen(window,'resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});

function step(dt: number){
  if(dead)return;
  updateColliders();
  let x=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+joystick.x;
  let z=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)+joystick.y;
  const length=Math.hypot(x,z);if(length>1){x/=length;z/=length;}
  const speed=keys.has('ShiftLeft')||keys.has('ShiftRight')?7:4.4;
  if(grounded&&keys.has('Space'))verticalVelocity=7.7;
  const current=body.translation(),water=worldData.waterLevel(Math.round(current.x),Math.round(current.z));
  const swimming=current.y<water&&worldData.height(Math.round(current.x),Math.round(current.z))<water;
  verticalVelocity=swimming?(keys.has('Space')?3:Math.max(-1,verticalVelocity-3*dt)):Math.max(verticalVelocity-22*dt,-25);
  const desired={x:(x*Math.cos(yaw)+z*Math.sin(yaw))*speed*dt,y:verticalVelocity*dt,z:(-x*Math.sin(yaw)+z*Math.cos(yaw))*speed*dt};
  controller.computeColliderMovement(playerCollider,desired);
  const movement=controller.computedMovement(),p=body.translation();
  body.setNextKinematicTranslation({x:THREE.MathUtils.clamp(p.x+movement.x,-SIZE+.8,SIZE-.8),y:p.y+movement.y,z:THREE.MathUtils.clamp(p.z+movement.z,-SIZE+.8,SIZE-.8)});
  const wasGrounded=grounded;grounded=controller.computedGrounded();if(grounded&&verticalVelocity<0)verticalVelocity=0;
  if(verticalVelocity>0&&movement.y<desired.y-.001)verticalVelocity=0;
  physics.timestep=dt;physics.step();const after=body.translation();
  if(grounded||swimming){if(grounded&&!wasGrounded&&!swimming){const hurt=fallDamage(fallPeak-after.y);if(hurt)damage(hurt,'摔落');}fallPeak=after.y;}else fallPeak=Math.max(fallPeak,after.y);
  const submerged=after.y+.6<water&&worldData.height(Math.round(after.x),Math.round(after.z))<water;
  underwaterTime=submerged?underwaterTime+dt:0;hazardTimer+=dt;
  if(hazardTimer>=1){hazardTimer=0;if(underwaterTime>8)damage(2,'溺水');if(worldData.get(Math.round(after.x),Math.round(after.y-1.2),Math.round(after.z))===10)damage(4,'熔岩灼伤');}
  if(after.y<-8){if(gameMode==='survival')damage(20,'坠入虚空');else spawn();}updateCamera();
}
let last=0,accumulator=0,frames=0;
function animate(time: number){
  if(disposed)return;
  animationId=requestAnimationFrame(animate);const elapsed=last?Math.max(0,(time-last)/1000):0,dt=Math.min(elapsed,.05);last=time;
  timeSeconds=advanceTime(timeSeconds,elapsed,active);stream();if(active)creatures.update(dt,night);updateDay();
  if(active){accumulator+=dt;while(accumulator>=1/60){step(1/60);accumulator-=1/60;if(!active){accumulator=0;break;}}}
  else accumulator=0;

  for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.velocity.y-=9*dt;p.mesh.position.addScaledVector(p.velocity,dt);p.mesh.scale.setScalar(Math.max(0,p.life/.6));if(p.life<=0){scene.remove(p.mesh);particles.splice(i,1);}}
  camera.updateMatrixWorld();if(active&&frames%3===0)updateTarget();if(!active){outline.visible=false;preview.visible=false;}
  if(ready&&frames%120===0){const p=body.translation();creatures.stream(p.x,p.z);worldData.retain(Math.floor(p.x/16),Math.floor(p.z/16),4);}
  if(ready&&frames%15===0){updateDrops();drawMap();const p=body.translation();$('biome').textContent=biomeNames[worldData.biome(Math.round(p.x),Math.round(p.z))];$('creature-count').textContent=`附近生物 ${creatures.animals.size}`;$('coordinates').textContent=`X ${Math.round(p.x)} / Y ${Math.round(p.y)} / Z ${Math.round(p.z)}`;const compass=['N','NW','W','SW','S','SE','E','NE'];$('compass').textContent=compass[((Math.round(yaw/(Math.PI/4))%8)+8)%8];}
  frames++;renderer.render(scene,camera);
}
async function init(){
  physics=new RAPIER.World({x:0,y:-22,z:0});
  body=physics.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());playerCollider=physics.createCollider(RAPIER.ColliderDesc.capsule(.5,.3),body);
  controller=physics.createCharacterController(.015);controller.enableSnapToGround(.2);controller.enableAutostep(.4,.2,false);spawn();
  if(health>0&&saved.position&&Object.values(saved.position).every(Number.isFinite)&&Math.abs(saved.position.x)<=SIZE&&Math.abs(saved.position.z)<=SIZE&&saved.position.y>0&&saved.position.y<99){body.setTranslation(saved.position,true);body.setNextKinematicTranslation(saved.position);yaw=Number.isFinite(saved.yaw)?saved.yaw:yaw;pitch=THREE.MathUtils.clamp(Number.isFinite(saved.pitch)?saved.pitch:pitch,-1.5,1.5);updateColliders(true);physics.step();updateCamera();}
  if(saved?.selected>=1&&saved.selected<=13)select(saved.selected);
  const p=body.translation();chunkRenderer.updateCenter(p.x,p.z,2);
  for(let n=0;n<9;n++){if(signal.aborted)throw new DOMException('Game closed','AbortError');chunkRenderer.tick();await new Promise(resolve=>setTimeout(resolve,0));}
  creatures.stream(p.x,p.z);if(health<=0)health=20;fallPeak=body.translation().y;updateInventory();updateDay();
  select(selected);ready=true;$('world-seed').textContent=`世界 ${String(seed).padStart(4,'0')}`;
  $<HTMLButtonElement>('play').disabled=false;$('play').innerHTML='<i data-lucide="play"></i><span>进入世界</span>';refreshIcons();
  if(saved)$('gate-meta').textContent='广袤世界 · 六大地貌 · 10 分钟一天';
  // Read-only diagnostics make browser smoke tests inspect the real simulation.
  window.__voxel={getState:()=>({ready,active,seed,selected,night,grounded,yaw,pitch,position:{...body.translation()},target:target?{position:[...target.position],normal:target.normal.toArray(),type:target.type}:null,changes:changes.size,mined,placed,blocks:chunkRenderer.chunks.size*256,loadedChunks:chunkRenderer.chunks.size,cachedChunks:worldData.cachedChunks,creatures:creatures.counts,eggCreatures:creatures.snapshot().length,gameMode,health,keepInventory,inventory:{...inventory},drops:drops.length,weather:weatherSystem.kind,starsOpacity:(weatherSystem.stars.material as THREE.PointsMaterial).opacity,dead,timeSeconds,gameHour:clockState(timeSeconds).hour,biome:worldData.biome(Math.round(body.translation().x),Math.round(body.translation().z)),drawCalls:renderer.info.render.calls})};
  animationId=requestAnimationFrame(animate);saveInterval=setInterval(()=>{if(active)void saveWorld();},15000);
}
function disposeGame() {
    if(disposed)return;
    disposed=true;active=false;events.abort();cancelAnimationFrame(animationId);clearInterval(saveInterval);clearTimeout(saveTimer);clearTimeout(toastTimer);
    document.exitPointerLock?.();document.body.classList.remove('playing','paused','touch');
    chunkRenderer.dispose();creatures.dispose();weatherSystem.dispose();
    for(const mesh of dropMeshes.values())scene.remove(mesh);dropGeometry.dispose();dropMaterial.dispose();
    const geometries=new Set<THREE.BufferGeometry>(), mats=new Set<THREE.Material>(), textures=new Set<THREE.Texture>();
    scene.traverse(object=>{if(object instanceof THREE.Mesh||object instanceof THREE.LineSegments){geometries.add(object.geometry);for(const mat of (Array.isArray(object.material)?object.material:[object.material])){mats.add(mat);if('map' in mat&&mat.map instanceof THREE.Texture)textures.add(mat.map);}}});
    for(const materialList of materials.values())for(const mat of materialList){mats.add(mat);if(mat.map)textures.add(mat.map);}
    geometries.add(blockGeometry);geometries.add(particleGeometry);particleMaterials.forEach(mat=>mats.add(mat));
    geometries.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
    physics.free();renderer.dispose();renderer.forceContextLoss();void audioContext?.close();
    document.getElementById('hotbar')?.replaceChildren();document.getElementById('material-grid')?.replaceChildren();document.getElementById('creature-grid')?.replaceChildren();
    delete window.__voxel;
}
try { await init(); } catch(error) { disposeGame(); throw error; }
return { snapshot, save:()=>saveWorld(true), dispose:disposeGame };
}
export type GameHandle = Awaited<ReturnType<typeof startGame>>;

