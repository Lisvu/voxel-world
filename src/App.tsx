import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Box, Plus, LogOut, Play, Pencil, Trash2, Download, X, LoaderCircle, RefreshCw, Sprout, ArrowRight } from 'lucide-react';
import { api, ApiError } from './api';
import { snapshotSchema, snapshotFingerprint, type Snapshot, type User, type WorldDetail, type WorldSummary } from '../shared/contracts';
import { GameView } from './game/GameView';

const errorText = (error: unknown) => error instanceof Error ? error.message : '操作失败，请重试';
function Brand() { return <div className="app-brand"><Box /><strong>野境</strong><span>VOXEL WORLD</span></div>; }
function readLegacy(): Snapshot | null {
  try { const result = snapshotSchema.safeParse(JSON.parse(localStorage.getItem('voxel-world-v1') ?? 'null')); return result.success ? result.data : null; } catch { return null; }
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [world, setWorld] = useState<WorldDetail | null>(null);
  const checkSession = useCallback(async () => {
    setLoading(true); setError('');
    try { setUser(await api<User>('/auth/me')); }
    catch (e) { if (!(e instanceof ApiError && e.status === 401)) setError(errorText(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void checkSession(); }, [checkSession]);
  const leave = useCallback(() => setWorld(null), []);
  const logout = useCallback(() => setUser(null), []);
  if (loading) return <div className="app-screen loading-screen"><Brand /><LoaderCircle className="spinner" /><span>正在连接世界</span></div>;
  if (error) return <div className="app-screen loading-screen"><Brand /><p role="alert">{error}</p><button className="primary" onClick={() => void checkSession()}><RefreshCw />重新连接</button></div>;
  if (!user) return <Auth onLogin={setUser} />;
  if (world) return <GameView world={world} user={user} onLeave={leave} />;
  return <Lobby user={user} onOpen={setWorld} onLogout={logout} />;
}

function Auth({ onLogin }: { onLogin: (user: User) => void }) {
  const [register, setRegister] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    try { onLogin(await api<User>(`/auth/${register ? 'register' : 'login'}`, { method: 'POST', body: { email: form.get('email'), password: form.get('password'), ...(register ? { name: form.get('name') } : {}) } })); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return <main className="app-screen auth-screen"><header className="app-header"><Brand /><span className="edition">创造版 / 01</span></header><div className="auth-content"><div className="auth-intro"><span className="kicker">青木河谷</span><h1>一方天地，<br />自由生长。</h1></div><form className="auth-form" onSubmit={submit}><div className="auth-tabs" role="tablist"><button type="button" role="tab" aria-selected={!register} onClick={() => { setRegister(false); setError(''); }}>登录</button><button type="button" role="tab" aria-selected={register} onClick={() => { setRegister(true); setError(''); }}>注册</button></div><h2>{register ? '开启你的世界' : '欢迎回来'}</h2>{register && <label>昵称<input name="name" autoComplete="nickname" required maxLength={30} placeholder="你的名字" /></label>}<label>邮箱<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" /></label><label>密码<input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={10} maxLength={128} placeholder="至少 10 个字符" /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy ? <LoaderCircle className="spinner" /> : <ArrowRight />}{register ? '创建账号' : '登录世界'}</button></form></div><footer className="app-foot">野境 <span>单人 · 创造模式</span></footer></main>;
}

type Modal = { kind: 'new' } | { kind: 'rename' | 'delete'; world: WorldSummary } | { kind: 'recover'; world: WorldDetail; snapshot: Snapshot; backupKey: string };
function Lobby({ user, onOpen, onLogout }: { user: User; onOpen: (world: WorldDetail) => void; onLogout: () => void }) {
  const [worlds, setWorlds] = useState<WorldSummary[]>([]), [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [modal, setModal] = useState<Modal | null>(null);
  const [legacy, setLegacy] = useState<Snapshot | null>(readLegacy);
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try { setWorlds(await api<WorldSummary[]>('/worlds')); }
    catch (e) { if (e instanceof ApiError && e.status === 401) onLogout(); else setError(errorText(e)); }
    finally { setLoading(false); }
  }, [onLogout]);
  useEffect(() => { void refresh(); }, [refresh]);
  async function action(task: () => Promise<void>) {
    if (busy) return; setBusy(true); setError('');
    try { await task(); } catch (e) { if (e instanceof ApiError && e.status === 401) onLogout(); else setError(errorText(e)); } finally { setBusy(false); }
  }
  async function open(id: string) {
    await action(async () => {
      const world = await api<WorldDetail>(`/worlds/${id}`);
      try {
        for (const backupKey of Object.keys(localStorage).filter(key => key.startsWith(`voxel-backup:${user.id}:${id}:`))) {
          const draft = JSON.parse(localStorage.getItem(backupKey) ?? 'null');
          const snapshot = snapshotSchema.safeParse(draft?.snapshot);
          if (snapshot.success && snapshot.data.seed === world.seed && snapshotFingerprint(snapshot.data) !== snapshotFingerprint(world.snapshot)) {
            setModal({ kind: 'recover', world, snapshot: snapshot.data, backupKey }); return;
          }
        }
      } catch {}
      onOpen(world);
    });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await action(async () => {
      if (modal?.kind === 'new') {
        const seed = String(form.get('seed') ?? '').trim();
        const world = await api<WorldDetail>('/worlds', { method: 'POST', body: { name: form.get('name'), ...(seed ? { seed: Number(seed) } : {}) } }); onOpen(world);
      } else if (modal?.kind === 'rename') {
        await api(`/worlds/${modal.world.id}`, { method: 'PATCH', body: { name: form.get('name') } }); setModal(null); await refresh();
      }
    });
  }
  return <main className="app-screen lobby-screen"><header className="app-header"><Brand /><div className="account"><span>{user.name}</span><button className="plain-icon" aria-label="退出登录" title="退出登录" disabled={busy} onClick={() => void action(async () => { await api('/auth/logout', { method: 'POST' }); onLogout(); })}><LogOut /></button></div></header>
    <section className="lobby-main"><div className="lobby-title"><div><span className="kicker">你的每一块创造</span><h1>我的世界 <span>{worlds.length.toString().padStart(2, '0')}</span></h1></div><button className="primary" disabled={busy} onClick={() => { setError(''); setModal({ kind: 'new' }); }}><Plus />新建世界</button></div>
      {error && !modal && <div className="form-error error-strip" role="alert">{error}<button className="plain-icon" title="重试" onClick={() => void refresh()}><RefreshCw /></button></div>}
      {legacy && <div className="import-strip"><div><Download size={18} /><span>发现本机的旧世界</span></div><button disabled={busy} onClick={() => void action(async () => { const created = await api<WorldDetail>('/worlds', { method: 'POST', body: { name: '本地世界 · 导入', snapshot: legacy } }); setLegacy(null); onOpen(created); })}>导入世界 <ArrowRight size={15} /></button></div>}
      {loading ? <div className="empty-state"><LoaderCircle className="spinner" /><p>正在加载世界</p></div> : worlds.length === 0 ? <div className="empty-state"><Sprout size={36} /><h2>这里，还是一片空地</h2><button className="secondary" onClick={() => setModal({ kind: 'new' })}>创建第一个世界</button></div> : <div className="world-grid">{worlds.map(world => <article className="world-card" key={world.id}><button className="world-cover" aria-label={`进入 ${world.name}`} disabled={busy} onClick={() => void open(world.id)}><img src="/world-preview.png" alt="像素方块河谷" /><span className="world-mode">创造模式</span><span className="world-play"><Play /></span></button><div className="world-info"><h2>{world.name}</h2><p>种子 {world.seed} <span>·</span> {world.blockCount} 处修改</p><div className="world-bottom"><time dateTime={world.updatedAt}>{new Date(world.updatedAt).toLocaleDateString('zh-CN')}</time><div><button className="plain-icon" aria-label={`重命名 ${world.name}`} title="重命名" disabled={busy} onClick={() => { setError(''); setModal({ kind: 'rename', world }); }}><Pencil size={15} /></button><button className="plain-icon" aria-label={`删除 ${world.name}`} title="删除" disabled={busy} onClick={() => { setError(''); setModal({ kind: 'delete', world }); }}><Trash2 size={15} /></button></div></div></div></article>)}</div>}
    </section><footer className="app-foot">VOXEL WORLD<span>{user.email}</span></footer>
    {modal && <div className="modal-backdrop"><section className="app-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><span className="kicker">VOXEL WORLD</span><button className="plain-icon" aria-label="关闭对话框" disabled={busy} onClick={() => { setModal(null); setError(''); }}><X /></button></header><h2 id="modal-title">{modal.kind === 'new' ? '新建世界' : modal.kind === 'rename' ? '重命名世界' : modal.kind === 'delete' ? '删除这个世界？' : '发现未同步的进度'}</h2>
      {(modal.kind === 'new' || modal.kind === 'rename') && <form onSubmit={submit}><label>世界名称<input name="name" autoFocus required maxLength={40} defaultValue={modal.kind === 'rename' ? modal.world.name : ''} placeholder="为这片天地起个名字" /></label>{modal.kind === 'new' && <label>种子（可选）<input name="seed" type="number" min={0} max={2147483647} step={1} placeholder="随机生成" /></label>}<button className="primary" disabled={busy}>{busy ? <LoaderCircle className="spinner" /> : <Sprout />}{modal.kind === 'new' ? '创建并进入' : '保存名称'}</button></form>}
      {modal.kind === 'delete' && <><p>「{modal.world.name}」及其存档将被永久删除。</p><div className="modal-actions"><button className="secondary" disabled={busy} onClick={() => setModal(null)}>取消</button><button className="danger" disabled={busy} onClick={() => void action(async () => { await api(`/worlds/${modal.world.id}`, { method: 'DELETE' }); try { localStorage.removeItem(`voxel-backup:${user.id}:${modal.world.id}`); } catch {} setModal(null); await refresh(); })}><Trash2 size={16} />确认删除</button></div></>}
      {modal.kind === 'recover' && <><p>本机保留了一份进度，可以另存为新世界，或继续云端版本。</p><button className="primary" disabled={busy} onClick={() => void action(async () => { const restored = await api<WorldDetail>('/worlds', { method: 'POST', body: { name: `${modal.world.name.slice(0, 30)} · 恢复`, snapshot: modal.snapshot } }); localStorage.removeItem(modal.backupKey); onOpen(restored); })}><Download />恢复为新世界</button><button className="secondary full-width" disabled={busy} onClick={() => onOpen(modal.world)}>继续云端版本</button></>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section></div>}
  </main>;
}
