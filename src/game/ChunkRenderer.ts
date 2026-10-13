import * as THREE from 'three';
import { VoxelWorld, CHUNK, HEIGHT } from './world';
const faces = [
  {n:[1,0,0],v:[[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5],[.5,-.5,.5]]},
  {n:[-1,0,0],v:[[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5],[-.5,-.5,-.5]]},
  {n:[0,1,0],v:[[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5]]},
  {n:[0,-1,0],v:[[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]]},
  {n:[0,0,1],v:[[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]]},
  {n:[0,0,-1],v:[[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5]]},
];
/** One atlas, one terrain draw call per chunk; only exposed faces go to the GPU. */
export class ChunkRenderer {
  readonly chunks = new Map<string,{solid:THREE.Mesh;water:THREE.Mesh}>();
  readonly material:THREE.MeshLambertMaterial;
  private readonly waterMaterial=new THREE.MeshPhongMaterial({color:0x418da5,transparent:true,opacity:.68,shininess:90,depthWrite:false,side:THREE.DoubleSide});
  private readonly atlas:THREE.CanvasTexture;
  private pending: [number,number][]=[];
  constructor(readonly world:VoxelWorld,readonly scene:THREE.Scene,materials:Map<number,THREE.MeshLambertMaterial[]>){
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=256;const ctx=canvas.getContext('2d')!;
    for(const [id,mats] of materials)for(let face=0;face<3;face++)ctx.drawImage(mats[face===0?0:face===1?2:3].map!.image as HTMLCanvasElement,face*16,(id-1)*16,16,16);
    this.atlas=new THREE.CanvasTexture(canvas);this.atlas.magFilter=THREE.NearestFilter;this.atlas.minFilter=THREE.NearestFilter;this.atlas.colorSpace=THREE.SRGBColorSpace;
    this.material=new THREE.MeshLambertMaterial({map:this.atlas});
  }
  get liquids(){return [...this.chunks.values()].map(c=>c.water);}
  get meshes(){return [...this.chunks.values()].map(c=>c.solid);}
  updateCenter(x:number,z:number,radius:number){
    const cx=Math.floor(x/16),cz=Math.floor(z/16);
    for(const [k,c] of this.chunks){const [a,b]=k.split(',').map(Number);if(Math.abs(a-cx)>radius||Math.abs(b-cz)>radius){this.scene.remove(c.solid,c.water);c.solid.geometry.dispose();c.water.geometry.dispose();this.chunks.delete(k);}}
    this.pending=[];
    for(let a=cx-radius;a<=cx+radius;a++)for(let b=cz-radius;b<=cz+radius;b++)if(!this.chunks.has(`${a},${b}`))this.pending.push([a,b]);
    this.pending.sort((a,b)=>(a[0]-cx)**2+(a[1]-cz)**2-(b[0]-cx)**2-(b[1]-cz)**2);
    this.world.retain(cx,cz,radius+2);
  }
  tick(){const next=this.pending.shift();if(next)this.build(...next);}
  rebuild(x:number,z:number){const cx=Math.floor(x/16),cz=Math.floor(z/16);for(const [a,b] of [[cx,cz],[cx-1,cz],[cx+1,cz],[cx,cz-1],[cx,cz+1]])if(this.chunks.has(`${a},${b}`))this.build(a,b);}
  build(cx:number,cz:number){
    const id=`${cx},${cz}`,old=this.chunks.get(id);if(old){this.scene.remove(old.solid,old.water);old.solid.geometry.dispose();old.water.geometry.dispose();}
    const positions:number[]=[],normals:number[]=[],uvs:number[]=[],indices:number[]=[],water:number[]=[];
    const data=this.world.chunk(cx,cz);
    for(let x=0;x<CHUNK;x++)for(let z=0;z<CHUNK;z++){
      const wx=cx*16+x,wz=cz*16+z,level=this.world.waterLevel(wx,wz);
      if(this.world.height(wx,wz)<level){const y=level+.18;water.push(wx-.5,y,wz-.5,wx+.5,y,wz+.5,wx+.5,y,wz-.5,wx-.5,y,wz-.5,wx-.5,y,wz+.5,wx+.5,y,wz+.5);}
      for(let y=0;y<HEIGHT;y++){
        const type=data[(x*16+z)*HEIGHT+y];if(!type)continue;
        for(let f=0;f<6;f++){
          const {n,v}=faces[f];if(y===0&&n[1]===-1||this.world.get(wx+n[0],y+n[1],wz+n[2]))continue;
          const start=positions.length/3,tile=f===2?1:f===3?2:0;
          const u0=(tile*16+.1)/64,u1=(tile*16+15.9)/64,v0=1-((type-1)*16+15.9)/256,v1=1-((type-1)*16+.1)/256;
          for(const a of v){positions.push(wx+a[0],y+a[1],wz+a[2]);normals.push(...n);}
          uvs.push(u0,v0,u1,v0,u1,v1,u0,v1);indices.push(start,start+1,start+2,start,start+2,start+3);
        }
      }
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeBoundingSphere();
    const solid=new THREE.Mesh(geometry,this.material);solid.castShadow=true;solid.receiveShadow=true;
    const wg=new THREE.BufferGeometry();wg.setAttribute('position',new THREE.Float32BufferAttribute(water,3));wg.computeVertexNormals();
    const liquid=new THREE.Mesh(wg,this.waterMaterial);liquid.userData.water=true;this.scene.add(solid,liquid);this.chunks.set(id,{solid,water:liquid});
  }
  dispose(){for(const c of this.chunks.values()){this.scene.remove(c.solid,c.water);c.solid.geometry.dispose();c.water.geometry.dispose();}this.chunks.clear();this.material.dispose();this.waterMaterial.dispose();this.atlas.dispose();}
}
