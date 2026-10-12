import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, RotateCw, CloudOff } from 'lucide-react';
import type { User, WorldDetail } from '../../shared/contracts';
import { CloudSave, type SyncState } from './CloudSave';
import type { GameHandle } from './engine';

export function GameView({ world, user, onLeave }: { world: WorldDetail; user: User; onLeave: () => void }) {
  const [sync, setSync] = useState<SyncState>('saved');
  const [message, setMessage] = useState('');
  const [fatal, setFatal] = useState('');
  const handle = useRef<GameHandle | null>(null);
  useEffect(() => {
    let mounted = true;
    const lifecycle = new AbortController();
    const cloud = new CloudSave(world, user.id, (state, error) => { if (mounted) { setSync(state); setMessage(error ?? ''); } });
    import('./engine').then(({ startGame }) => startGame(world.snapshot, cloud.save, onLeave, lifecycle.signal)).then(game => {
      if (!mounted) game.dispose(); else handle.current = game;
    }).catch(error => { if (mounted) setFatal(error instanceof Error ? error.message : '无法加载世界'); });
    const backup = () => { if (handle.current) cloud.backupOnly(handle.current.snapshot()); };
    window.addEventListener('pagehide', backup);
    return () => { mounted = false; lifecycle.abort(); backup(); window.removeEventListener('pagehide', backup); handle.current?.dispose(); handle.current = null; };
  }, [world, user.id, onLeave]);
  return <>
    <canvas id="world" aria-label="可交互的三维方块世界" />
    <header className="hud topbar">
      <div className="identity"><span className="brand-mark"><i data-lucide="box" /></span><div><h1>野境 <span>VOXEL WORLD</span></h1><p><span className="status-dot" />创造模式 <span className="divider">/</span> <span id="biome">{world.name}</span></p></div></div>
      <div className="top-actions"><span className="save-state" id="save-state"><i data-lucide="check" /> 已保存</span><button id="day-toggle" className="icon-button" title="切换昼夜" aria-label="切换昼夜"><i data-lucide="sun" /></button><button id="fullscreen" className="icon-button" title="全屏" aria-label="全屏"><i data-lucide="maximize" /></button><button id="pause" className="icon-button" title="暂停 · Esc" aria-label="暂停"><i data-lucide="pause" /></button></div>
    </header>
    <div className="hud telemetry"><span id="coordinates">X 0 / Y 0 / Z 0</span><span className="compass" id="compass">N</span><span id="world-seed">世界 {world.seed}</span></div>
    <div id="crosshair" aria-hidden="true" /><div id="target-label" className="hud" />
    <section id="gate" className="gate"><div className="gate-content"><p className="eyebrow">{world.name}</p><h2>你的世界。<br />从一块开始。</h2><button id="play" className="play-button" disabled><i data-lucide="loader-circle" /><span>正在生成世界</span></button><div className="world-meta"><span className="status-dot" /><span id="gate-meta">创造模式 · 无限材料</span></div><button className="back-link" onClick={onLeave}><ArrowLeft size={14} />我的世界</button></div></section>
    <div id="toast" role="status" />
    <footer className="hud inventory"><div className="selection-label"><span className="line" /><span id="selected-name">草方块</span><span className="line" /></div><div id="hotbar" role="toolbar" aria-label="方块材料" /><div className="inventory-meta"><span><i data-lucide="layers-3" /> 建造栏</span><span>∞</span></div></footer>
    <div id="touch-controls" className="hud"><div id="joystick" aria-label="移动摇杆"><div id="stick" /></div><div className="touch-actions"><button id="break" className="touch-button" aria-label="挖掘" title="挖掘"><i data-lucide="pickaxe" /></button><button id="place" className="touch-button" aria-label="放置" title="放置"><i data-lucide="plus" /></button><button id="jump" className="touch-button" aria-label="跳跃" title="跳跃"><i data-lucide="arrow-up" /></button></div></div>
    <dialog id="menu"><div className="menu-heading"><span className="eyebrow">VOXEL WORLD</span><button id="close-menu" className="icon-button" aria-label="关闭" title="关闭"><i data-lucide="x" /></button></div><h2>稍作停留</h2><p className="menu-world">{world.name} <span>·</span> 创造模式</p><button id="resume" className="menu-primary"><i data-lucide="play" /> 继续探索</button><button id="respawn" className="menu-option"><i data-lucide="map-pin" /> 返回出生点</button><button id="save" className="menu-option"><i data-lucide="save" /> 保存世界</button><button id="world-list" className="menu-option"><i data-lucide="layers-3" /> 保存并返回世界列表</button><button className="menu-option" onClick={onLeave}><ArrowLeft size={17} />返回并保留本地草稿</button></dialog>
    {(sync === 'offline' || sync === 'conflict') && <div className="sync-alert" role="alert"><CloudOff size={16} /><span>{message || '进度尚未同步'}</span>{sync === 'offline' ? <button onClick={() => void handle.current?.save()}><RotateCw size={14} />重试</button> : <button onClick={onLeave}>返回世界列表</button>}</div>}
    {fatal && <div className="fatal-error" role="alert"><h2>世界加载失败</h2><p>{fatal}</p><button onClick={onLeave}>返回世界列表</button></div>}
  </>;
}
