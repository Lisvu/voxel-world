interface Window {
  __voxel?: { getState(): {
    ready: boolean; active: boolean; seed: number; selected: number; night: boolean;
    grounded: boolean; yaw: number; pitch: number; position: { x: number; y: number; z: number };
    target: { position: number[]; normal: number[]; type: number } | null;
    changes: number; mined: number; placed: number; blocks: number; drawCalls: number;
  } };
}
