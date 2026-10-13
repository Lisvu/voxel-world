export const DAY_SECONDS = 600;
export function advanceTime(seconds:number, elapsed:number, active=true){return seconds+(active?Math.max(0,elapsed):0);}
export function clockState(seconds:number){
  const cycle=((seconds%DAY_SECONDS)+DAY_SECONDS)%DAY_SECONDS,hour=cycle/DAY_SECONDS*24;
  const daylight=Math.max(0,Math.sin((hour-6)/24*Math.PI*2));
  return { day:Math.floor(seconds/DAY_SECONDS)+1,hour,daylight,night:hour<6||hour>=18,label:`第 ${Math.floor(seconds/DAY_SECONDS)+1} 天 · ${String(Math.floor(hour)).padStart(2,'0')}:${String(Math.floor((hour%1)*60)).padStart(2,'0')}` };
}
