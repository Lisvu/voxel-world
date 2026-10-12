import { api, ApiError } from '../api';
import type { Snapshot, WorldDetail, WorldSummary } from '../../shared/contracts';
import { snapshotFingerprint } from '../../shared/contracts';

export type SyncState = 'saved' | 'saving' | 'offline' | 'conflict';
const tabId = (() => {
  try { const existing = sessionStorage.getItem('voxel-tab-id'); if (existing) return existing; const id = crypto.randomUUID(); sessionStorage.setItem('voxel-tab-id', id); return id; }
  catch { return crypto.randomUUID(); }
})();
export class CloudSave {
  private revision: number;
  private queue: Promise<void> = Promise.resolve();
  private blocked: ApiError | null = null;
  private last: string;
  readonly backupKey: string;
  constructor(readonly world: WorldDetail, userId: string, private status: (state: SyncState, error?: string) => void) {
    this.revision = world.revision;
    this.last = snapshotFingerprint(world.snapshot);
    this.backupKey = `voxel-backup:${userId}:${world.id}:${tabId}`;
  }
  private backup(snapshot: Snapshot) {
    try { localStorage.setItem(this.backupKey, JSON.stringify({ revision: this.revision, snapshot, updatedAt: Date.now() })); } catch { /* Cloud persistence remains available when local storage is full. */ }
  }
  save = (snapshot: Snapshot): Promise<void> => {
    this.backup(snapshot);
    const task = this.queue.catch(() => {}).then(async () => {
      if (this.blocked) throw this.blocked;
      const serialized = snapshotFingerprint(snapshot);
      if (serialized === this.last) { this.status('saved'); return; }
      this.status('saving');
      try {
        const result = await api<WorldSummary>(`/worlds/${this.world.id}/save`, { method: 'PUT', body: { revision: this.revision, snapshot } });
        this.revision = result.revision; this.last = serialized;
        // Only clear the draft that was acknowledged; a newer queued draft must survive.
        try {
          const current = JSON.parse(localStorage.getItem(this.backupKey) ?? 'null');
          if (current?.snapshot && snapshotFingerprint(current.snapshot) === serialized) localStorage.removeItem(this.backupKey);
        } catch {}
        this.status('saved');
      } catch (error) {
        if (error instanceof ApiError && [401, 403, 404, 409].includes(error.status)) this.blocked = error;
        this.status(error instanceof ApiError && error.status === 409 ? 'conflict' : 'offline', error instanceof Error ? error.message : '保存失败');
        throw error;
      }
    });
    this.queue = task;
    return task;
  };
  backupOnly(snapshot: Snapshot) { this.backup(snapshot); }
}
