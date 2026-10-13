export type Mode='survival'|'creative';
export type Inventory=Record<string,number>;
export function applyDamage(mode:Mode,health:number,amount:number){return mode==='creative'?20:Math.max(0,health-Math.max(0,amount));}
export function fallDamage(distance:number){return Math.max(0,Math.floor(distance-3));}
export function addItem(items:Inventory,id:number,count=1){items[id]=Math.min(9999,(items[id]??0)+count);}
export function consumeItem(mode:Mode,items:Inventory,id:number){if(mode==='creative')return true;if((items[id]??0)<1)return false;items[id]--;return true;}
export function deathInventory(items:Inventory,keep:boolean){return {inventory:keep?{...items}:{},dropped:keep?{}:{...items}};}
