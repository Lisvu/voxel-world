import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, RotateCw, CloudOff, BookOpen, Settings2, Pipette } from 'lucide-react';
import type { User, WorldDetail } from '../../shared/contracts';
import { CloudSave, type SyncState } from './CloudSave';
import { defaults } from './features';
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
    <canvas id="world" tabIndex={-1} aria-label="可交互的三维方块世界" />
    <header className="hud topbar">
      <div className="identity"><span className="brand-mark"><i data-lucide="box" /></span><div><h1>野境 <span>VOXEL WORLD</span></h1><p><span className="status-dot" /><span id="mode-label">创造模式</span> <span className="divider">/</span> <span id="biome">{world.name}</span></p></div></div>
      <div className="top-actions"><button id="open-materials" className="icon-button" title="物品栏 · E" aria-label="物品栏"><BookOpen /></button><button id="open-settings" className="icon-button" title="游戏设置" aria-label="游戏设置"><Settings2 /></button><span className="save-state" id="save-state"><i data-lucide="check" /> 已保存</span><button id="day-toggle" className="icon-button" title="切换昼夜" aria-label="切换昼夜"><i data-lucide="sun" /></button><button id="fullscreen" className="icon-button" title="全屏" aria-label="全屏"><i data-lucide="maximize" /></button><button id="pause" className="icon-button" title="暂停 · Esc" aria-label="暂停"><i data-lucide="pause" /></button></div>
    </header>
    <div className="hud telemetry"><span id="coordinates">X 0 / Y 0 / Z 0</span><span className="compass" id="compass">N</span><span id="world-clock">第 1 天 · 06:00</span><span id="weather-label">晴天</span><span id="creature-count">附近生物 0</span><span id="world-seed">世界 {world.seed}</span></div>
    <aside id="minimap" className="hud minimap" aria-label="世界小地图"><div className="map-heading"><strong>附近地形 · N ↑</strong><button id="minimap-toggle" aria-expanded="true" aria-controls="minimap-body" title="M 收起／展开地图">收起地图</button></div><div id="minimap-body"><canvas id="minimap-canvas" width="228" height="228" aria-label="地形俯视图，三角代表玩家，方框代表出生点" /><div className="map-legend"><span>▲ 你　□ 出生点</span><button id="minimap-expand" title="Shift + M 放大／缩小">放大</button></div></div></aside>
    <div id="health-hud" className="hud health-hud" hidden><span id="health-value">生命 20 / 20</span><div className="health-track"><i id="health-fill" /></div></div><div id="crosshair" aria-hidden="true" /><div id="target-label" className="hud" />
    <section id="gate" className="gate"><div className="gate-content"><p className="eyebrow">{world.name}</p><h2>你的世界。<br />从一块开始。</h2><button id="play" className="play-button" disabled><i data-lucide="loader-circle" /><span>正在生成世界</span></button><div className="world-meta"><span className="status-dot" /><span id="gate-meta">{world.snapshot.gameMode==='survival'?'生存模式 · 收集材料':'创造模式 · 无限材料'}</span></div><button className="back-link" onClick={onLeave}><ArrowLeft size={14} />我的世界</button></div></section>
    <div id="toast" role="status" /><div id="control-hint" className="hud control-hint" hidden>WASD 移动 · 按住鼠标拖动转向 · 单击左键挖掘／右键放置 · Esc 暂停</div>
    <footer className="hud inventory"><div className="selection-label"><span className="line" /><span id="selected-name">草方块</span><span className="line" /></div><div id="hotbar" role="toolbar" aria-label="方块材料" /><div className="inventory-meta"><span><i data-lucide="layers-3" /> 建造栏</span><span className="material-hint">1–7 选材 · E 图鉴 · B 吸取</span></div></footer>
    <div id="touch-controls" className="hud"><div id="joystick" aria-label="移动摇杆"><div id="stick" /></div><div className="touch-actions"><button id="pick-material" className="touch-button" aria-label="吸取目标材料" title="吸取目标材料"><Pipette /></button><button id="break" className="touch-button" aria-label="挖掘" title="挖掘"><i data-lucide="pickaxe" /></button><button id="place" className="touch-button" aria-label="放置" title="放置"><i data-lucide="plus" /></button><button id="jump" className="touch-button" aria-label="跳跃" title="跳跃"><i data-lucide="arrow-up" /></button></div></div>
    <dialog id="menu"><div className="menu-heading"><span className="eyebrow">VOXEL WORLD</span><button id="close-menu" className="icon-button" aria-label="关闭" title="关闭"><i data-lucide="x" /></button></div><h2>稍作停留</h2><p className="menu-world">{world.name} <span>·</span> <span id="menu-mode">创造模式</span></p><button id="resume" className="menu-primary"><i data-lucide="play" /> 继续探索</button><button id="menu-settings" className="menu-option"><Settings2 />游戏设置</button><button id="menu-materials" className="menu-option"><BookOpen />物品栏</button><button id="respawn" className="menu-option"><i data-lucide="map-pin" /> 返回出生点</button><button id="save" className="menu-option"><i data-lucide="save" /> 保存世界</button><button id="world-list" className="menu-option"><i data-lucide="layers-3" /> 保存并返回世界列表</button><button className="menu-option" onClick={onLeave}><ArrowLeft size={17} />返回并保留本地草稿</button></dialog>
    <dialog id="settings-panel" className="feature-dialog" aria-labelledby="settings-title"><div className="menu-heading"><span className="eyebrow">偏好设置</span><button id="settings-panel-close" className="icon-button" aria-label="关闭设置">×</button></div><h2 id="settings-title">让探索更顺手</h2><p>操作偏好保存在浏览器；模式、死亡规则和天气随世界保存。</p><div className="settings-grid world-rules"><label>游戏模式<select id="game-mode" defaultValue={world.snapshot.gameMode ?? 'creative'}><option value="creative">创造模式 · 无敌</option><option value="survival">生存模式 · 生命与物品</option></select></label><label className="checkbox-label">死亡不掉落<input id="keep-inventory" type="checkbox" defaultChecked={world.snapshot.keepInventory ?? false} /></label><label>天气<select id="weather-choice" defaultValue={world.snapshot.weather ?? 'auto'}><option value="auto">自动变化</option><option value="clear">晴天</option><option value="rain">雨天</option><option value="snow">雪天</option><option value="thunder">雷阵雨</option><option value="cloudy">多云</option></select></label></div><div className="settings-grid">{([
      ['sensitivity', '鼠标灵敏度', .2, 3, .1], ['touchSensitivity', '触屏灵敏度', .2, 3, .1], ['fov', '视野角度', 45, 100, 1], ['volume', '音效音量', 0, 100, 1],
    ] as const).map(([name,label,min,max,step])=><label key={name} htmlFor={`setting-${name}`}>{label}<output id={`value-${name}`} htmlFor={`setting-${name}`}>{defaults[name]}</output><input id={`setting-${name}`} type="range" min={min} max={max} step={step} defaultValue={defaults[name]} /></label>)}<label>画质<select id="setting-quality" defaultValue="high"><option value="low">流畅</option><option value="medium">均衡</option><option value="high">精细</option></select></label><label className="checkbox-label">开启阴影<input id="setting-shadows" type="checkbox" defaultChecked /></label></div><button id="reset-settings" className="menu-option">恢复默认设置</button></dialog>
    <dialog id="materials-panel" className="feature-dialog materials-dialog" aria-labelledby="materials-title"><div className="menu-heading"><span className="eyebrow">创造工具箱</span><button id="materials-panel-close" className="icon-button" aria-label="关闭图鉴">×</button></div><h2 id="materials-title">每一块，皆有可能</h2><p>点击选择材料。游戏中按 B 或鼠标中键吸取目标材料。</p><p id="inventory-description">点击材料添加到物品栏。</p><h3>建造材料</h3><div id="material-grid" className="material-grid" /><h3>生物蛋</h3><p>选中生物蛋，关闭图鉴后用右键／放置按钮生成。鱼需要水域，其他生物需要干燥地面。</p><div id="creature-grid" className="material-grid" /></dialog>
    <dialog id="death-panel" className="feature-dialog" aria-labelledby="death-title"><h2 id="death-title">你阵亡了</h2><p id="death-reason" /><button id="respawn-death" className="menu-primary">重生</button><button className="menu-option" onClick={onLeave}>返回世界列表</button></dialog>
    {(sync === 'offline' || sync === 'conflict') && <div className="sync-alert" role="alert"><CloudOff size={16} /><span>{message || '进度尚未同步'}</span>{sync === 'offline' ? <button onClick={() => void handle.current?.save()}><RotateCw size={14} />重试</button> : <button onClick={onLeave}>返回世界列表</button>}</div>}
    {fatal && <div className="fatal-error" role="alert"><h2>世界加载失败</h2><p>{fatal}</p><button onClick={onLeave}>返回世界列表</button></div>}
  </>;
}

