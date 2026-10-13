import * as THREE from 'three';
import type { CreatureSave, Species } from '../../shared/contracts';
import { VoxelWorld, hash, WORLD_LIMIT } from './world';
export const creatureTypes: {id:Species;name:string;color:string;habitat:string}[]=[
  {id:'cow',name:'牛',color:'#8b6550',habitat:'原野、村落附近'},
  {id:'sheep',name:'羊',color:'#efe9d8',habitat:'原野、雪地'},
  {id:'chicken',name:'鸡',color:'#f2ce78',habitat:'原野、沼泽、暮色森林'},
  {id:'fish',name:'鱼',color:'#f28c5d',habitat:'海洋与湿地水域'},
  {id:'yak',name:'牦牛',color:'#514139',habitat:'雪地高原'},
];
type Animal={saved:CreatureSave;group:THREE.Group;legs:THREE.Mesh[];natural:boolean;age:number;turn:number};
export class Creatures {
  readonly animals=new Map<string,Animal>();
  private eggs=new Map<string,CreatureSave>();
  private geometry=new THREE.BoxGeometry(1,1,1);
  private palette=new Map<string,THREE.MeshLambertMaterial>();
  constructor(readonly world:VoxelWorld,readonly scene:THREE.Scene,saved:CreatureSave[]){for(const c of saved)this.eggs.set(c.id,{...c});}
  private material(color:string){if(!this.palette.has(color))this.palette.set(color,new THREE.MeshLambertMaterial({color}));return this.palette.get(color)!;}
  private model(species:Species){
    const group=new THREE.Group(),legs:THREE.Mesh[]=[];
    const add=(color:string,x:number,y:number,z:number,w:number,h:number,d:number)=>{const m=new THREE.Mesh(this.geometry,this.material(color));m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=true;m.receiveShadow=true;group.add(m);return m;};
    if(species==='fish'){
      add('#f28c5d',0,0,0,.28,.32,.65);add('#d06045',0,0,.42,.08,.38,.22);add('#ffc278',0,.22,0,.05,.15,.35);
      for(const x of [-.15,.15])add('#172c35',x,.06,-.23,.04,.07,.07);
    }else if(species==='chicken'){
      add('#f3eee0',0,.5,0,.4,.42,.5);add('#faf5e5',0,.82,-.22,.28,.32,.3);add('#c84a3d',0,1,-.2,.1,.13,.18);add('#e7aa36',0,.8,-.43,.18,.12,.17);
      for(const x of [-.12,.12])legs.push(add('#d99b32',x,.18,0,.07,.35,.07));
      for(const x of [-.15,.15])add('#1e2829',x,.86,-.3,.04,.055,.055);
    }else{
      const color=species==='sheep'?'#eee9de':species==='yak'?'#514139':'#93664e',size=species==='yak'?1.2:1;
      add(color,0,.8,0,.8,.68,1.15);add(color,0,.94,-.75,.53,.55,.55);add(species==='cow'?'#ddb7a0':'#514941',0,.8,-1.04,.45,.22,.1);
      for(const x of [-.29,.29])for(const z of [-.39,.39])legs.push(add(species==='sheep'?'#756558':'#44392f',x,.27,z,.17,.54,.18));
      for(const x of [-.29,.29]){add('#17232a',x,1.05,-.84,.05,.075,.1);if(species!=='sheep')add('#e0d3b0',x*1.25,1.3,-.72,.13,.34,.13);}
      if(species==='cow'){add('#eee6d8',.405,.88,.05,.015,.32,.35);add('#eee6d8',-.405,.8,-.2,.015,.35,.4);}
      if(species==='yak')add('#3a3030',0,.48,0,.86,.4,1.13);
      group.scale.setScalar(size);
    }
    return {group,legs};
  }
  private add(saved:CreatureSave,natural:boolean){if(this.animals.has(saved.id))return;const {group,legs}=this.model(saved.species);group.position.set(saved.x,saved.y,saved.z);group.rotation.y=saved.yaw;this.scene.add(group);this.animals.set(saved.id,{saved,group,legs,natural,age:0,turn:0});}
  private valid(species:Species,x:number,y:number,z:number){
    const ix=Math.round(x),iz=Math.round(z);if(Math.abs(x)>WORLD_LIMIT-2||Math.abs(z)>WORLD_LIMIT-2)return false;
    if(species==='fish')return y<this.world.waterLevel(ix,iz)-.3&&!this.world.get(ix,Math.round(y),iz)&&!this.world.get(ix,Math.round(y+.3),iz);
    return y>=this.world.waterLevel(ix,iz)+.4 && this.world.get(ix,Math.round(y-.6),iz)!==10 && !!this.world.get(ix,Math.round(y-.6),iz) && !this.world.get(ix,Math.round(y+.2),iz)&&!this.world.get(ix,Math.round(y+1.4),iz);
  }
  spawn(species:Species,x:number,y:number,z:number):string{
    if(this.eggs.size>=256)return '生物蛋生成的生物已达到 256 只上限';
    if(!this.valid(species,x,y,z))return species==='fish'?'鱼需要生成在水中':'需要干燥的地面和足够的活动空间';
    const c={id:crypto.randomUUID(),species,x,y,z,yaw:0};this.eggs.set(c.id,c);this.add(c,false);return '';
  }
  stream(x:number,z:number){
    const cx=Math.floor(x/16),cz=Math.floor(z/16);
    for(const [id,a] of this.animals)if(Math.abs(a.saved.x-x)>64||Math.abs(a.saved.z-z)>64){this.scene.remove(a.group);this.animals.delete(id);}
    for(const c of this.eggs.values())if(Math.abs(c.x-x)<48&&Math.abs(c.z-z)<48)this.add(c,false);
    for(let a=cx-2;a<=cx+2;a++)for(let b=cz-2;b<=cz+2;b++){
      const id=`wild:${a}:${b}`;if(this.animals.has(id)||this.animals.size>=72)continue;
      const px=a*16+2+Math.floor(hash(this.world.seed,a,b,221)*12),pz=b*16+2+Math.floor(hash(this.world.seed,a,b,222)*12),h=this.world.top(px,pz),biome=this.world.biome(px,pz),r=hash(this.world.seed,a,b,223);
      if(biome==='volcano')continue;
      const wet=h<this.world.waterLevel(px,pz);const species:Species=wet?'fish':biome==='snow'?(r<.7?'yak':'sheep'):biome==='swamp'||biome==='twilight'?'chicken':r<.4?'cow':r<.75?'sheep':'chicken';
      const y=wet?this.world.waterLevel(px,pz)-1:h+.5;if(h>this.world.height(px,pz)+2||!this.valid(species,px,y,pz))continue;
      this.add({id,species,x:px,y,z:pz,yaw:r*Math.PI*2},true);
    }
  }
  update(dt:number,night:boolean){
    for(const a of this.animals.values()){
      const c=a.saved;a.age+=dt;a.turn-=dt;
      if(a.turn<=0){c.yaw+=(hash(this.world.seed,Math.floor(c.x),Math.floor(c.z),Math.floor(a.age/3)+401)-.5)*2;a.turn=2+hash(this.world.seed,Math.floor(c.x),Math.floor(c.z),43)*3;}
      const moving=Math.sin(a.age*.7+c.x*.02)>.0,speed=(c.species==='fish'?.8:c.species==='chicken'?.6:.45)*(night&&c.species!=='fish'?.3:1)*(moving?1:0);
      const nx=c.x-Math.sin(c.yaw)*speed*dt,nz=c.z-Math.cos(c.yaw)*speed*dt;let ny=c.y;
      if(c.species!=='fish'){
        let ground:number|undefined;
        for(let y=Math.min(94,Math.floor(c.y+1));y>=Math.max(0,Math.floor(c.y-2));y--)if(this.world.get(Math.round(nx),y,Math.round(nz))){ground=y+.5;break;}
        if(ground!==undefined)ny=ground;
      }
      if(this.valid(c.species,nx,ny,nz)&&Math.abs(ny-c.y)<=1.1){c.x=nx;c.z=nz;c.y=ny;}else c.yaw+=Math.PI*dt;
      a.group.position.set(c.x,c.y+(c.species==='fish'?Math.sin(a.age*3)*.05:0),c.z);a.group.rotation.y=c.yaw;
      a.legs.forEach((leg,i)=>leg.rotation.x=moving?Math.sin(a.age*6+i%2*Math.PI)*.3:0);
    }
  }
  snapshot(){return [...this.eggs.values()].map(c=>({...c}));}
  get counts(){return Object.fromEntries(creatureTypes.map(t=>[t.id,[...this.animals.values()].filter(a=>a.saved.species===t.id).length]));}
  dispose(){for(const a of this.animals.values())this.scene.remove(a.group);this.animals.clear();this.geometry.dispose();for(const m of this.palette.values())m.dispose();}
}
