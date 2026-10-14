import { validItem, tools, foods } from '../../shared/items';
const initialSlots = [1,2,3,4,5,6,7,8,9];
export function readQuickbar(key: string): number[] {
  try { const value=JSON.parse(localStorage.getItem(key)??'null');
    if(Array.isArray(value)&&value.length===9&&value.every(validItem))return value;
  }catch{}return [...initialSlots];
}
export function createQuickbar(options:{key:string;name:(id:number)=>string;images:Map<number,string>;select:(id:number)=>void}){
  const root=document.getElementById('hotbar')!;
  let slots=readQuickbar(options.key),selected=1;
  const listeners=new AbortController();
  const buttons=slots.map((_,index)=>{
    const b=document.createElement('button');b.className='slot';b.type='button';b.dataset.slot=String(index+1);
    b.addEventListener('click',()=>options.select(slots[index]),{signal:listeners.signal});root.append(b);return b;
  });
  const picker=document.getElementById('quickbar-slot') as HTMLSelectElement;
  const status=document.getElementById('quickbar-status')!;
  const save=()=>{try{localStorage.setItem(options.key,JSON.stringify(slots));return true;}catch{return false;}};
  const pin=()=>{slots[Number(picker.value)-1]=selected;const saved=save();status.textContent=`${options.name(selected)}已放入快捷格 ${picker.value}`+(saved?'':'；浏览器存储不可用，本次会话有效');render();};
  document.getElementById('quickbar-bind')!.addEventListener('click',pin,{signal:listeners.signal});
  document.getElementById('quickbar-reset')!.addEventListener('click',()=>{slots=[...initialSlots];save();status.textContent='已恢复默认九格';render();},{signal:listeners.signal});
  let inventory:Record<string,number>={},durability:Record<string,number>={},creative=false;
  function render(){buttons.forEach((b,i)=>{
    const id=slots[i],name=options.name(id),tool=tools.find(t=>t.id===id),owned=(inventory[id]??0)>0;
    if(b.dataset.type!==String(id)){
      b.dataset.type=String(id);b.replaceChildren();
      const number=document.createElement('span');number.className='number';number.textContent=String(i+1);b.append(number);
      const url=options.images.get(id);
      if(url){const img=document.createElement('img');img.className='block-icon';img.src=url;img.alt='';b.append(img);}
      else{const icon=document.createElement('span');icon.className='item-glyph';icon.setAttribute('aria-hidden','true');icon.textContent=tool?({pickaxe:'⛏',sword:'⚔',axe:'🪓',shovel:'♠',hoe:'⌑'}[tool.kind]):foods.some(f=>f.id===id&&f.hunger>0)?'🍎':'◆';b.append(icon);}
      const count=document.createElement('span');count.className='infinity';b.append(count);
      const bar=document.createElement('progress');bar.className='slot-durability';bar.setAttribute('aria-label','工具耐久');b.append(bar);
    }
    b.classList.toggle('active',selected===id);b.classList.toggle('slot-unavailable',!creative&&!owned);b.setAttribute('aria-pressed',String(selected===id));b.setAttribute('aria-label',`${i+1} · ${name}`);
    b.title=`${i+1} · ${name}${tool?` · 耐久 ${durability[id]??0}/${tool.durability}`:''}`;
    b.querySelector('.infinity')!.textContent=creative?'∞':String(inventory[id]??0);
    const bar=b.querySelector('progress')!;bar.hidden=!tool||!owned;bar.max=tool?.durability??1;bar.value=durability[id]??0;
  });document.getElementById('quickbar-selected')!.textContent=options.name(selected);}
  return {update(id:number,items:Record<string,number>,wear:Record<string,number>,isCreative:boolean){selected=id;inventory=items;durability=wear;creative=isCreative;render();},selectSlot(index:number){if(index>=0&&index<9)options.select(slots[index]);},cycle(delta:number){options.select(slots[(Math.max(0,slots.indexOf(selected))+delta+9)%9]);},dispose(){listeners.abort();root.replaceChildren();}};
}
