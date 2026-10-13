interface Window {
  __voxel?: { getState(): {
    ready: boolean; active: boolean; seed: number; selected: number; night: boolean;
    grounded: boolean; yaw: number; pitch: number; position: { x: number; y: number; z: number };
    target: { position: number[]; normal: number[]; type: number } | null;
    gameMode:'survival'|'creative'; health:number; keepInventory:boolean; inventory:Record<string,number>; drops:number; weather:string; starsOpacity:number; dead:boolean;
    loadedChunks:number; cachedChunks:number; creatures:Record<string,number>; eggCreatures:number; timeSeconds:number; gameHour:number; biome:string;
    changes: number; mined: number; placed: number; blocks: number; drawCalls: number;
  } };
}

