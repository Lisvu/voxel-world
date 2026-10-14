import * as THREE from 'three';
/** A fixed pool avoids shader recompilation as lights enter and leave view. */
export class BlockLights {
  private readonly sources = new Map<string, {x:number;y:number;z:number;type:number}>();
  private readonly lights: THREE.PointLight[];
  activeCount = 0;
  constructor(private readonly scene: THREE.Scene, changes: Map<string,number>) {
    for (const [key,type] of changes) this.set(key,type);
    this.lights=Array.from({length:8},()=>{const light=new THREE.PointLight(0xffc578,0,14,2);scene.add(light);return light;});
  }
  set(key:string,type:number) {
    if(type===21||type===22){const [x,y,z]=key.split(',').map(Number);this.sources.set(key,{x,y,z,type});}else this.sources.delete(key);
  }
  update(player:{x:number;y:number;z:number}) {
    const distance=(s:{x:number;y:number;z:number})=>(s.x-player.x)**2+(s.y-player.y)**2+(s.z-player.z)**2;
    const nearby=[...this.sources.values()].filter(s=>distance(s)<32**2).sort((a,b)=>distance(a)-distance(b)).slice(0,8);
    this.activeCount=nearby.length;
    this.lights.forEach((light,i)=>{const source=nearby[i];light.intensity=source?(source.type===21?32:48):0;if(source){light.distance=source.type===21?10:14;light.position.set(source.x,source.y+.7,source.z);}});
  }
  dispose(){for(const light of this.lights){this.scene.remove(light);light.dispose();}this.sources.clear();}
}
