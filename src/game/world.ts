/** Seeded terrain. Generation order never affects a block or a structure. */
export const CHUNK = 16, HEIGHT = 96, SEA = 12, WORLD_LIMIT = 32768;
export const biomes = ['plains', 'snow', 'volcano', 'swamp', 'twilight', 'ocean'] as const;
export type Biome = typeof biomes[number];
export const biomeNames: Record<Biome,string> = { plains:'原野 · 村落', snow:'雪地', volcano:'火山', swamp:'沼泽森林', twilight:'暮色森林', ocean:'海洋' };
export const key = (x:number,y:number,z:number)=>`${x},${y},${z}`;
export function hash(seed:number,x:number,z:number,salt=0){
  let n=Math.imul(x|0,374761393)^Math.imul(z|0,668265263)^Math.imul(seed|0,1442695041)^Math.imul(salt,1274126177);
  n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;
}
const smooth=(x:number)=>x*x*(3-2*x);
function noise(seed:number,x:number,z:number,scale:number,salt:number){
  x/=scale;z/=scale;const ix=Math.floor(x),iz=Math.floor(z),u=smooth(x-ix),v=smooth(z-iz);
  return (hash(seed,ix,iz,salt)*(1-u)+hash(seed,ix+1,iz,salt)*u)*(1-v)+(hash(seed,ix,iz+1,salt)*(1-u)+hash(seed,ix+1,iz+1,salt)*u)*v;
}
export class VoxelWorld {
  readonly changes = new Map<string,number>();
  private editsByChunk = new Map<string,Map<string,number>>();
  private chunks = new Map<string,Uint8Array>();
  constructor(readonly seed:number, readonly generatorVersion=2, edits: [string,number][]=[]){for(const [k,t] of edits){this.changes.set(k,t);this.indexEdit(k,t);}}
  private indexEdit(k:string,t:number){const [x,,z]=k.split(',').map(Number),id=`${Math.floor(x/16)},${Math.floor(z/16)}`;if(!this.editsByChunk.has(id))this.editsByChunk.set(id,new Map());this.editsByChunk.get(id)!.set(k,t);}
  legacyRandom(x:number,z:number,n=0){const v=Math.sin(x*127.1+z*311.7+this.seed*.071+n*63.9)*43758.5453;return v-Math.floor(v);}
  legacyHeight(x:number,z:number){const river=Math.abs(x-(8+Math.sin(z*.1)*3)),hills=Math.sin(x*.13+this.seed*.01)*1.6+Math.cos(z*.15)*1.3+Math.sin((x+z)*.18)*.6;return river<3?2:river<5?3:Math.max(4,Math.floor(5+hills));}
  region(cx:number,cz:number){return (cx===0&&cz===0?'plains':biomes[Math.floor(hash(this.seed,cx,cz,91)*biomes.length)]) as Biome;}
  biome(x:number,z:number):Biome{return this.region(Math.floor((x+96)/192),Math.floor((z+96)/192));}
  village(x:number,z:number){const cx=Math.floor((x+96)/192),cz=Math.floor((z+96)/192);return this.region(cx,cz)==='plains' && (cx===0&&cz===0 || hash(this.seed,cx,cz,103)>.35) && Math.abs(x-cx*192-38)<25 && Math.abs(z-cz*192-38)<25;}
  height(x:number,z:number){
    const alt:Record<Biome,number>={plains:19,snow:29,volcano:22,swamp:12,twilight:22,ocean:5};
    const gx=x/192,gz=z/192,cx=Math.floor(gx),cz=Math.floor(gz),u=smooth(gx-cx),v=smooth(gz-cz);
    let h=(alt[this.region(cx,cz)]*(1-u)+alt[this.region(cx+1,cz)]*u)*(1-v)+(alt[this.region(cx,cz+1)]*(1-u)+alt[this.region(cx+1,cz+1)]*u)*v;
    h+=(noise(this.seed,x,z,32,7)-.5)*6+(noise(this.seed,x,z,87,11)-.5)*8;
    const rx=Math.floor((x+96)/192),rz=Math.floor((z+96)/192),b=this.region(rx,rz),r=Math.hypot(x-rx*192,z-rz*192);
    if(b==='ocean')h=h*(Math.min(1,Math.max(0,(r-55)/40)))+5*(1-Math.min(1,Math.max(0,(r-55)/40)));
    if(b==='swamp')h=12+(noise(this.seed,x,z,16,19)-.45)*4;
    if(b==='volcano' && r<70)h+=Math.max(0,1-r/70)*35-Math.max(0,1-r/13)*18;
    if(this.village(x,z))h=20;
    const spawnDistance=Math.hypot(x,z-12);if(spawnDistance<36){const blend=smooth(Math.max(0,(spawnDistance-18)/18));h=20*(1-blend)+h*blend;}
    if(this.generatorVersion===1){const d=Math.max(Math.abs(x),Math.abs(z));if(d<48){const t=Math.max(0,(d-28)/20);h=this.legacyHeight(x,z)*(1-t)+h*t;}}
    return Math.max(1,Math.min(HEIGHT-12,Math.floor(h)));
  }
  waterLevel(x:number,z:number){return this.generatorVersion===1 && Math.max(Math.abs(x),Math.abs(z))<38 ? 3 : SEA;}
  chunk(cx:number,cz:number){
    const id=`${cx},${cz}`;let data=this.chunks.get(id);if(data)return data;
    data=new Uint8Array(CHUNK*CHUNK*HEIGHT);this.chunks.set(id,data);
    const set=(x:number,y:number,z:number,t:number,onlyAir=false)=>{x-=cx*CHUNK;z-=cz*CHUNK;if(x<0||x>=16||z<0||z>=16||y<0||y>=HEIGHT)return;const i=(x*16+z)*HEIGHT+y;if(!onlyAir||!data![i])data![i]=t;};
    for(let lx=0;lx<16;lx++)for(let lz=0;lz<16;lz++){
      const x=cx*16+lx,z=cz*16+lz,h=this.height(x,z),b=this.biome(x,z),legacy=this.generatorVersion===1&&Math.abs(x)<=28&&Math.abs(z)<=28;
      let top=legacy?(h<=3?6:1):b==='snow'?8:b==='volcano'?9:b==='swamp'?11:h<=SEA?6:b==='twilight'?12:1;
      if(!legacy&&b==='volcano'&&Math.hypot(x-Math.round(x/192)*192,z-Math.round(z/192)*192)<9)top=10;
      if(this.village(x,z)&&!legacy&&(Math.abs((x-38)%192)<3||Math.abs((z-38)%192)<3))top=3;
      for(let y=0;y<=h;y++){
        let t=y===h?top:y<h-2?3:2;
        if(t===3&&y>0&&y<h-3&&!legacy){const r=hash(this.seed,Math.floor(x/2),Math.floor(z/2),700+Math.floor(y/2));if(r<.035)t=14;else if(r<.060)t=15;else if(r<.082)t=16;else if(r<.094&&y<18)t=17;else if(r<.104&&y<12)t=18;else if(r<.110&&y<16)t=19;}
        set(x,y,z,t);
      }
    }
    // Generate trees from an expanded anchor area so neighboring chunks agree.
    for(let x=cx*16-3;x<cx*16+19;x++)for(let z=cz*16-3;z<cz*16+19;z++){
      const h=this.height(x,z),b=this.biome(x,z),legacy=this.generatorVersion===1&&Math.abs(x)<=28&&Math.abs(z)<=28;
      let grow=false,trunk=4;
      if(legacy){grow=x>=-25&&x<25&&z>=-25&&z<25&&h>=4&&this.legacyRandom(x,z,8)<=.014&&Math.hypot(x,z-12)>=5;trunk=3+Math.floor(this.legacyRandom(x,z,9)*2);}
      else {grow=h>this.waterLevel(x,z)&&b!=='volcano'&&b!=='ocean'&&!this.village(x,z)&&Math.hypot(x,z-12)>7&&hash(this.seed,x,z,41)<(b==='twilight'?.045:b==='swamp'?.028:.009);trunk=b==='twilight'?8:b==='snow'?6:4;}
      if(!grow||(!legacy&&this.generatorVersion===1&&Math.abs(x)<=31&&Math.abs(z)<=31))continue;
      for(let y=h+1;y<=h+trunk;y++)set(x,y,z,4);
      for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=0;dy<=2;dy++)if(Math.abs(dx)+Math.abs(dz)+(dy===2?1:0)<=3)set(x+dx,h+trunk+dy,z+dz,b==='snow'&&dy===2?8:b==='twilight'?13:5,true);
    }
    // Four houses and a central well per village. Flattened foundations are deterministic.
    const rx=Math.round((cx*16-38)/192),rz=Math.round((cz*16-38)/192),vx=rx*192+38,vz=rz*192+38;
    if(this.village(vx,vz)){
      for(const [dx,dz] of [[-12,-12],[12,-12],[-12,12],[12,12]])for(let x=-4;x<=4;x++)for(let z=-4;z<=4;z++)for(let y=21;y<=26;y++){
        const wx=vx+dx+x,wz=vz+dz+z;if(this.generatorVersion===1&&Math.abs(wx)<=28&&Math.abs(wz)<=28)continue;
        const wall=Math.abs(x)===4||Math.abs(z)===4,door=z===-4&&Math.abs(x)<=1&&y<=23,window=wall&&y===24&&(x===0||z===0);
        set(wx,y,wz,y===21?7:y===26?9:wall&&!door&&!window?7:0);
      }
      for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++)set(vx+x,21,vz+z,Math.abs(x)===2||Math.abs(z)===2?3:0);
    }
    for(const [k,t] of this.editsByChunk.get(id) ?? []){const [x,y,z]=k.split(',').map(Number);if(Math.floor(x/16)===cx&&Math.floor(z/16)===cz)set(x,y,z,t);}
    return data;
  }
  get(x:number,y:number,z:number){if(y<0||y>=HEIGHT||Math.abs(x)>WORLD_LIMIT||Math.abs(z)>WORLD_LIMIT)return 0;const cx=Math.floor(x/16),cz=Math.floor(z/16);return this.chunk(cx,cz)[((x-cx*16)*16+z-cz*16)*HEIGHT+y];}
  set(x:number,y:number,z:number,t:number){const cx=Math.floor(x/16),cz=Math.floor(z/16);this.chunk(cx,cz)[((x-cx*16)*16+z-cz*16)*HEIGHT+y]=t;this.changes.set(key(x,y,z),t);this.indexEdit(key(x,y,z),t);}
  top(x:number,z:number){const cx=Math.floor(x/16),cz=Math.floor(z/16),data=this.chunk(cx,cz),base=((x-cx*16)*16+z-cz*16)*HEIGHT;for(let y=HEIGHT-1;y>=0;y--)if(data[base+y])return y;return 0;}
  retain(cx:number,cz:number,radius=4){for(const k of this.chunks.keys()){const [x,z]=k.split(',').map(Number);if(Math.abs(x-cx)>radius||Math.abs(z-cz)>radius)this.chunks.delete(k);}}
  get cachedChunks(){return this.chunks.size;}
}
