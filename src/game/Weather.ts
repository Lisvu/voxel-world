import * as THREE from 'three';
import { hash, type Biome, type VoxelWorld } from './world';
export const weatherNames={clear:'晴天',rain:'雨天',snow:'雪天',thunder:'雷阵雨',cloudy:'多云'};
export type WeatherKind=keyof typeof weatherNames;
export type WeatherChoice=WeatherKind|'auto';
export function weatherAt(seed:number,seconds:number,biome:Biome,choice:WeatherChoice='auto'):WeatherKind{
  if(choice!=='auto')return choice;
  const r=hash(seed,Math.floor(seconds/90),0,701);
  const kind:WeatherKind=r<.32?'clear':r<.55?'cloudy':r<.78?'rain':r<.92?'snow':'thunder';
  return biome==='snow'&&(kind==='rain'||kind==='thunder')?'snow':kind;
}
export class Weather {
  readonly stars:THREE.Points;
  readonly rain:THREE.LineSegments;
  readonly snow:THREE.Points;
  readonly flash=new THREE.PointLight(0xd9e8ff,0,90);
  readonly bolt:THREE.Line;
  private rainPositions=new Float32Array(350*6);
  private snowPositions=new Float32Array(350*3);
  private lightningBucket=-1;
  private flashUntil=-1;
  kind:WeatherKind='clear';
  constructor(readonly scene:THREE.Scene,readonly seed:number,readonly world:VoxelWorld){
    const stars:number[]=[];for(let i=0;i<600;i++){const theta=hash(seed,i,0,702)*Math.PI*2,h=.1+hash(seed,i,0,703)*.9,r=Math.sqrt(1-h*h)*110;stars.push(Math.cos(theta)*r,h*110,Math.sin(theta)*r);}
    const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.Float32BufferAttribute(stars,3));this.stars=new THREE.Points(sg,new THREE.PointsMaterial({color:0xe8eeff,size:.38,transparent:true,opacity:0,depthWrite:false,fog:false}));
    const rg=new THREE.BufferGeometry();rg.setAttribute('position',new THREE.BufferAttribute(this.rainPositions,3));this.rain=new THREE.LineSegments(rg,new THREE.LineBasicMaterial({color:0xaacbdf,transparent:true,opacity:.65}));this.rain.frustumCulled=false;
    const ng=new THREE.BufferGeometry();ng.setAttribute('position',new THREE.BufferAttribute(this.snowPositions,3));this.snow=new THREE.Points(ng,new THREE.PointsMaterial({color:0xf7fbff,size:.12,transparent:true,opacity:.9}));this.snow.frustumCulled=false;
    this.bolt=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xebf5ff,transparent:true,opacity:1,fog:false}));this.bolt.frustumCulled=false;this.bolt.visible=false;
    scene.add(this.stars,this.rain,this.snow,this.flash,this.bolt);
  }
  update(seconds:number,player:THREE.Vector3,daylight:number,biome:Biome,choice:WeatherChoice){
    this.kind=weatherAt(this.seed,seconds,biome,choice);
    const wet=this.kind==='rain'||this.kind==='thunder',snowing=this.kind==='snow';
    this.rain.visible=wet;this.snow.visible=snowing;this.stars.position.copy(player);
    (this.stars.material as THREE.PointsMaterial).opacity=Math.max(0,1-daylight*4)*(this.kind==='clear'?.95:this.kind==='cloudy'?.25:0);
    // Each particle lives in a fixed nearby column. Reject particles below a roof or ground.
    for(let i=0;i<((wet||snowing)?350:0);i++){
      const x=Math.floor(player.x/4)*4+(hash(this.seed,i,0,711)-.5)*30,z=Math.floor(player.z/4)*4+(hash(this.seed,i,0,712)-.5)*30;
      const speed=snowing?1.8:18,y=player.y+18-((seconds*speed+hash(this.seed,i,0,713)*24)%24);
      const roof=this.world.top(Math.round(x),Math.round(z))+.6,visible=y>roof;
      if(wet){const at=i*6;this.rainPositions.set([x,visible?y:player.y-50,z,x-.05,visible?y-.8:player.y-50,z],at);}
      if(snowing)this.snowPositions.set([x+Math.sin(seconds+i)*.35,visible?y:player.y-50,z],i*3);
    }
    if(wet)this.rain.geometry.attributes.position.needsUpdate=true;if(snowing)this.snow.geometry.attributes.position.needsUpdate=true;
    const bucket=Math.floor(seconds/9);let thunder=false;
    if(this.kind==='thunder'&&bucket!==this.lightningBucket){this.lightningBucket=bucket;this.flashUntil=seconds+.16;thunder=true;
      const x=player.x+12+hash(this.seed,bucket,0,719)*10,z=player.z-15;
      this.bolt.geometry.dispose();this.bolt.geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x,player.y+35,z),new THREE.Vector3(x-2,player.y+23,z),new THREE.Vector3(x+1,player.y+18,z),new THREE.Vector3(x-1,player.y,z)]);
    }
    this.bolt.visible=this.kind==='thunder'&&seconds<this.flashUntil;this.flash.position.set(player.x,player.y+12,player.z);this.flash.intensity=this.bolt.visible?90:0;
    return thunder;
  }
  dispose(){for(const object of [this.stars,this.rain,this.snow,this.bolt]){this.scene.remove(object);object.geometry.dispose();(object.material as THREE.Material).dispose();}this.scene.remove(this.flash);}
}
