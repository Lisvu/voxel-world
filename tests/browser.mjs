import 'dotenv/config';
import { chromium, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.env.TEST_WEB_URL ?? 'http://localhost:5174';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const db = new PrismaClient();
const email = `browser-${randomUUID()}@example.test`, password = 'Browser-test-password!';
const errors = [];
await mkdir('screenshots', { recursive: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const gameReady = p => p.waitForFunction(() => window.__voxel?.getState().ready);
const state = () => page.evaluate(() => window.__voxel.getState());
async function shot(p, name, checkScene = false) {
  const image = await p.screenshot({ path: `screenshots/${name}.png` });
  if (checkScene) {
    const colors = await p.evaluate(async data => {
      const img = new Image(); img.src = `data:image/png;base64,${data}`; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(Math.floor(c.width*.5), Math.floor(c.height*.3), Math.floor(c.width*.35), Math.floor(c.height*.35)).data;
      const seen = new Set(); for (let i=0;i<pixels.length;i+=64) seen.add(`${pixels[i]>>3},${pixels[i+1]>>3},${pixels[i+2]>>3}`);
      return seen.size;
    }, image.toString('base64'));
    assert(colors > 25, `nonblank textured 3D scene: ${colors}`);
  }
}
async function list(p = page) { return (await p.request.get(`${base}/api/worlds`)).json(); }
async function detail(id, p = page) { return (await p.request.get(`${base}/api/worlds/${id}`)).json(); }
async function returnToLobby() {
  if ((await state()).active) await page.keyboard.press('Escape');
  if (await page.locator('#menu').isVisible()) await page.locator('#world-list').click();
  else await page.getByRole('button', { name: '我的世界', exact: true }).click();
  await expect(page.getByRole('button', { name: '新建世界', exact: true })).toBeVisible();
}
try {
  await page.goto(base);
  await expect(page.getByRole('button', { name: '登录世界' })).toBeVisible();
  await shot(page, 'fullstack-login');
  await page.getByRole('tab', { name: '注册', exact: true }).click();
  await page.getByLabel('昵称').fill('河谷建造者');
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  await page.getByRole('button', { name: '新建世界', exact: true }).click();
  await page.getByLabel('世界名称').fill('青木河谷');
  await page.getByLabel('种子（可选）').fill('248');
  await page.getByRole('button', { name: '创建并进入' }).click();
  await gameReady(page);
  const world = (await list())[0];
  await shot(page, 'fullstack-world', true);
  const hidden = await page.addStyleTag({ content: '.hud,.gate,#toast,dialog{visibility:hidden!important}' });
  await page.screenshot({ path: 'screenshots/clean-world.png' }); await hidden.evaluate(el => el.remove());
  await page.locator('#play').click();
  await page.waitForFunction(() => window.__voxel.getState().active && window.__voxel.getState().grounded);
  const first = await state();
  await page.keyboard.down('KeyW'); await page.waitForTimeout(700); await page.keyboard.up('KeyW');
  const moved = await state(); assert(Math.hypot(moved.position.x-first.position.x,moved.position.z-first.position.z)>1);
  await page.waitForFunction(() => window.__voxel.getState().grounded);
  const before = (await state()).position.y;
  await page.keyboard.press('Space'); await page.waitForTimeout(180);
  assert((await state()).position.y>before+.3);
  await page.waitForFunction(() => window.__voxel.getState().grounded);
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove',{movementY:270})));
  await page.waitForFunction(() => window.__voxel.getState().target);
  await page.mouse.click(720,450); assert.equal((await state()).mined,1);
  await page.keyboard.press('Digit7');
  await page.waitForFunction(() => window.__voxel.getState().grounded);
  for(let i=0;i<12;i++) {
    const s=await state(); if(s.target){const q=s.target.position.map((v,n)=>v+s.target.normal[n]);if(!(Math.abs(q[0]-s.position.x)<.82&&Math.abs(q[2]-s.position.z)<.82&&Math.abs(q[1]-s.position.y)<1.35)){await page.mouse.click(720,450,{button:'right'}); if((await state()).placed>0)break;}}
    await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove',{movementX:120,movementY:-25})));await page.waitForTimeout(200);
  }
  assert.equal((await state()).placed,1);
  const editCount=(await state()).changes;
  await page.keyboard.press('Escape'); await page.locator('#save').click();
  await expect.poll(async () => (await detail(world.id)).snapshot.changes.length).toBe(editCount);
  await returnToLobby();
  await expect(page.getByRole('button',{name:'进入 青木河谷',exact:true})).toBeVisible();
  await shot(page, 'fullstack-lobby');
  await page.getByRole('button',{name:'进入 青木河谷',exact:true}).click(); await gameReady(page);
  assert.equal((await state()).changes,editCount); assert.equal((await state()).selected,7);
  console.log('Registration, create, movement, collision, mining, building, database save and reopening passed.');

  await context.route('**/api/worlds/*/save', route => route.abort('failed'));
  await page.locator('#day-toggle').click();
  await expect(page.locator('.sync-alert')).toBeVisible({timeout:20000});
  assert(await page.evaluate(() => Object.keys(localStorage).some(key=>key.startsWith('voxel-backup:'))));
  await context.unroute('**/api/worlds/*/save');
  await page.getByRole('button',{name:'重试',exact:true}).click();
  await expect(page.locator('.sync-alert')).toHaveCount(0);
  await expect.poll(async () => (await detail(world.id)).snapshot.night).toBe(true);
  console.log('Failed cloud writes retain drafts; retry persists them to PostgreSQL.');

  const second=await context.newPage();second.on('pageerror',error=>errors.push(error.message));
  await second.goto(base);await second.getByRole('button',{name:'进入 青木河谷',exact:true}).click();await gameReady(second);
  await page.locator('#day-toggle').click();
  await expect.poll(async () => (await detail(world.id)).snapshot.night).toBe(false);
  await second.getByRole('button',{name:'木板',exact:true}).click();
  // The second tab has an old revision. Changing its position-independent
  // lighting twice would return to the initial state, so change material too.
  await second.getByRole('button',{name:'岩石',exact:true}).click();
  await second.locator('#day-toggle').click();
  await expect(second.locator('.sync-alert')).toContainText('其他页面');
  assert.equal((await detail(world.id)).snapshot.selected,7);
  await second.close();
  console.log('Concurrent tab conflict is surfaced without overwriting the newer save.');

  await returnToLobby();
  await page.getByRole('button',{name:'重命名 青木河谷',exact:true}).click();
  await page.getByLabel('世界名称').fill('青木河谷 · 云端');await page.getByRole('button',{name:'保存名称'}).click();
  await expect(page.getByRole('heading',{name:'青木河谷 · 云端',exact:true})).toBeVisible();
  await page.evaluate(() => localStorage.setItem('voxel-world-v1',JSON.stringify({version:1,seed:99,changes:[['1,5,1',7]],yaw:0,pitch:0,selected:7,night:false})));
  await page.reload();await page.getByRole('button',{name:'导入世界'}).click();await gameReady(page);
  assert.equal((await state()).seed,99);assert.equal((await state()).changes,1);
  await returnToLobby();
  await page.getByRole('button',{name:'删除 本地世界 · 导入',exact:true}).click();
  await page.getByRole('button',{name:'确认删除'}).click();
  await expect(page.getByRole('heading',{name:'本地世界 · 导入',exact:true})).toHaveCount(0);
  console.log('Rename, legacy import, multiple worlds, engine disposal and confirmed deletion passed.');

  const mobileContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const mobile=await mobileContext.newPage();mobile.on('pageerror',error=>errors.push(error.message));
  await mobile.goto(base);await expect(mobile.getByRole('button',{name:'登录世界'})).toBeVisible();await shot(mobile,'fullstack-mobile-login');
  await mobile.getByLabel('邮箱').fill(email);await mobile.getByLabel('密码').fill(password);await mobile.getByRole('button',{name:'登录世界'}).tap();
  await expect(mobile.getByRole('button',{name:'进入 青木河谷 · 云端',exact:true})).toBeVisible();await shot(mobile,'fullstack-mobile-lobby');
  await mobile.getByRole('button',{name:'进入 青木河谷 · 云端',exact:true}).tap();await gameReady(mobile);await mobile.locator('#play').tap();
  await expect(mobile.locator('#touch-controls')).toBeVisible();
  const p0=await mobile.evaluate(()=>window.__voxel.getState().position);
  const cdp=await mobileContext.newCDPSession(mobile),stick=await mobile.locator('#joystick').boundingBox();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:stick.x+stick.width/2,y:stick.y+10}]});await mobile.waitForTimeout(800);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const p1=await mobile.evaluate(()=>window.__voxel.getState().position);assert(Math.hypot(p1.x-p0.x,p1.z-p0.z)>.1);
  await shot(mobile,'fullstack-mobile-game',true);
  assert(await mobile.evaluate(()=>[...document.querySelectorAll('.slot,.top-actions,#joystick,.touch-actions')].every(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;})));
  await mobile.locator('#pause').tap();await mobile.locator('#world-list').tap();await mobile.getByRole('button',{name:'退出登录'}).tap();await expect(mobile.getByRole('button',{name:'登录世界'})).toBeVisible();
  assert.deepEqual(errors,[]);
  console.log('Mobile login, lobby, real touch movement, nonblank canvas, layout and logout passed.');
} catch (error) {
  await page.screenshot({ path: 'screenshots/fullstack-failure.png' }).catch(() => {});
  console.error('Browser errors:', errors);
  console.error('Visible page:', (await page.locator('body').innerText()).slice(0, 2500));
  throw error;
} finally {
  await browser.close();
  await db.user.deleteMany({where:{email}});await db.$disconnect();
}
