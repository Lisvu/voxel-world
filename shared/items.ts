import { armorItems } from './armor.js';
export const MAX_BLOCK_ID=25;
export const ores=[
  {id:14,name:'煤矿石',color:'#34343b',resource:30,resourceName:'煤炭'},
  {id:15,name:'铜矿石',color:'#ba805b',resource:31,resourceName:'铜'},
  {id:16,name:'铁矿石',color:'#cab9aa',resource:32,resourceName:'铁'},
  {id:17,name:'金矿石',color:'#eccc48',resource:33,resourceName:'金'},
  {id:18,name:'钻石矿石',color:'#55e5e4',resource:34,resourceName:'钻石'},
  {id:19,name:'绿宝石矿石',color:'#49c477',resource:35,resourceName:'绿宝石'},
];
export type ToolKind='pickaxe'|'sword'|'shovel'|'hoe'|'axe';
export const toolMaterials=[{name:'木',resource:4,durability:60,speed:2,damage:3},{name:'石',resource:3,durability:132,speed:3,damage:4},{name:'铜',resource:31,durability:190,speed:4,damage:5},{name:'铁',resource:32,durability:251,speed:5,damage:6},{name:'金',resource:33,durability:33,speed:7,damage:5},{name:'钻石',resource:34,durability:1562,speed:8,damage:8}];
const kinds: {kind:ToolKind;name:string;cost:number}[]=[{kind:'pickaxe',name:'镐',cost:3},{kind:'sword',name:'剑',cost:2},{kind:'shovel',name:'铲',cost:1},{kind:'hoe',name:'锄',cost:2},{kind:'axe',name:'斧',cost:3}];
export const tools=toolMaterials.flatMap((m,i)=>kinds.map((k,j)=>({id:100+i*5+j,name:m.name+k.name,kind:k.kind,durability:m.durability,speed:m.speed,damage:m.damage+(k.kind==='sword'?2:0),recipe:{[m.resource]:k.cost+(m.resource===4?2:0),...(m.resource===4?{}:{4:2})} as Record<string,number>})));
export const foods=[{id:200,name:'苹果',hunger:4},{id:201,name:'浆果',hunger:2},{id:202,name:'生肉',hunger:3},{id:203,name:'烤肉',hunger:8},{id:204,name:'鱼肉',hunger:4},{id:205,name:'面包',hunger:6},{id:206,name:'小麦',hunger:0},{id:207,name:'羽毛',hunger:0},{id:208,name:'烤鱼',hunger:7}];
export const constructionRecipes:{id:number;name:string;recipe:Record<string,number>}[]=[{id:20,name:'工作台',recipe:{4:4}},{id:21,name:'火把',recipe:{4:1,30:1}},{id:22,name:'灯笼',recipe:{32:2,30:1}},{id:23,name:'熔炉',recipe:{3:8}},{id:25,name:'箱子',recipe:{7:8}}];
export const itemName=(id:number)=>armorItems.find(a=>a.id===id)?.name??tools.find(t=>t.id===id)?.name??foods.find(t=>t.id===id)?.name??ores.find(t=>t.resource===id)?.resourceName??String(id);
export const validItem=(id:number)=>Number.isInteger(id)&&((id>=1&&id<=MAX_BLOCK_ID)||ores.some(t=>t.resource===id)||tools.some(t=>t.id===id)||foods.some(t=>t.id===id)||armorItems.some(a=>a.id===id));
export function miningSeconds(block:number,toolId:number){const tool=tools.find(t=>t.id===toolId);const kind:ToolKind=[3,9,10,14,15,16,17,18,19,23].includes(block)?'pickaxe':[4,7,20,21,25].includes(block)?'axe':[5,13].includes(block)?'hoe':'shovel';return (block>=14&&block<=19?3:kind==='pickaxe'?2.4:kind==='axe'?1.8:.8)/(tool?.kind===kind?tool.speed:1);}
export function craft(recipe:Record<string,number>,inventory:Record<string,number>){if(Object.entries(recipe).some(([id,n])=>(inventory[id]??0)<n))return false;for(const [id,n] of Object.entries(recipe))inventory[id]-=n;return true;}
