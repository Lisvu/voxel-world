# 野境 / Voxel World

一个 TypeScript 全栈单人方块沙盒。前端 React + Vite + Three.js + Rapier，
后端 NestJS，数据库 PostgreSQL，通过 Prisma 管理迁移和数据访问。
方块贴图为本地生成的原创素材，不使用 Minecraft 游戏资源。

## 本机启动

本机已配置独立 PostgreSQL 17，数据在 `.local/postgres`，仅监听 `127.0.0.1:55432`。
数据库密码自动生成，位于被 Git 忽略的 `.env`，不要提交该文件。

```sh
cd ~/voxel-world
npm run db:local
npm run dev
```

打开 Vite 输出的地址，默认 `http://localhost:5173`，端口占用时会自动递增。
后端默认 `http://127.0.0.1:3001/api`，前端通过 Vite 代理访问它。
首次使用先注册账号；未创建预置账号或密码。

`Ctrl+C` 停止前后端；`npm run db:stop` 停止项目数据库，保留全部数据。

## 在其他机器安装

需要 Node.js 24 LTS、npm 和 PostgreSQL 17。首次安装：

```sh
npm ci
cp .env.example .env
# 将 .env 中的数据库连接、用户名和密码改为自己的配置
npm run db:generate
npm run db:migrate
npm run dev
```

也可以配置 `.env` 的 `POSTGRES_PASSWORD` 和匹配的 `DATABASE_URL` 后，
执行 `docker compose up -d db` 启动数据库，再执行迁移与开发命令。
Docker 和 `db:local` 是两个可选方案，不要同时占用 55432 端口。

macOS Homebrew 用户可以安装 `postgresql@17` 后使用 `npm run db:local` 自动初始化。
其他安装位置可通过 `PG_BIN` 指定 PostgreSQL 的 bin 目录。

## 项目结构

```text
src/                 React 登录、世界管理和游戏界面
src/game/engine.ts   Three.js/Rapier 游戏循环、交互与资源清理
src/game/CloudSave.ts 串行云存档队列、本地草稿与冲突处理
server/             NestJS 账号、会话、世界服务与权限校验
shared/contracts.ts 前后端共享的 TypeScript 类型和 Zod 校验
prisma/             数据模型与可重复执行的部署迁移
scripts/local-db.mjs 本项目独立的 PostgreSQL 开发实例
tests/              真实数据库接口测试、桌面和移动浏览器测试
```

## 账号与存档

- 注册、登录、退出；密码用带随机盐的 scrypt 哈希，数据库不存明文密码。
- 会话令牌只通过 HttpOnly、SameSite=Strict Cookie 传输，数据库保存令牌哈希。
- 每个账号可创建多个世界，支持重命名、确认后删除、旧浏览器存档导入。
- 初始世界保存种子和生成器版本；方块修改按 16×16 水平区块保存到 JSONB。
- 保存还包括玩家位置、朝向、选中材料和昼夜状态。数据库事务使用 revision
  乐观锁，旧页面保存时返回 409，不能覆盖更新后的世界。
- 游戏编辑防抖保存，运行中每 15 秒保存，暂停和返回列表时保存。
- 请求失败会显示未同步状态，并保留按账号、世界和标签页隔离的本地草稿。
  重试可恢复同步；重新进入时，可将草稿恢复为独立世界，避免覆盖云端版本。
- 原来的 `voxel-world-v1` 浏览器存档不会被删除，可在世界列表导入。
  浏览器存储按站点地址隔离：旧存档在 5173 时，应从相同地址打开新版本才能发现。
- 每个世界最多 30,000 处方块修改；此版本使用整份修改集保存，适合小型单人世界。

## 接口

所有接口以 `/api` 开头；修改请求须带 `X-Voxel-Client: web` 请求头。
除注册、登录、退出和健康检查外，接口均要求登录，并检查世界所有权。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | /health | 检查服务和 PostgreSQL |
| POST | /auth/register、/auth/login、/auth/logout | 账号和会话 |
| GET | /auth/me | 当前用户 |
| GET / POST | /worlds | 列表 / 创建（可携带旧存档） |
| GET / PATCH / DELETE | /worlds/:id | 读取 / 重命名 / 删除 |
| PUT | /worlds/:id/save | 保存 `{ revision, snapshot }` |

## 构建与测试

```sh
npm run typecheck
npm run build
# 保持数据库和后端运行
npm run test:api
# 保持前端运行，安装本机 Chrome
TEST_WEB_URL=http://localhost:5173 npm run test:e2e
```

API 测试会验证 PostgreSQL 数据、密码哈希、权限隔离、输入校验、并发保存、会话失效。
浏览器测试包含注册、游戏操作、存档恢复、断网重试、多标签页冲突、导入和手机操作。
测试只清理自身创建的账号及关联数据；截图写入 `screenshots/`。

`npm run build` 输出 `dist/` 和 `dist-server/`。`npm start` 启动 NestJS，
同一服务同时提供构建后的前端与 API。生产环境应设置 `NODE_ENV=production`，
并通过 HTTPS 反向代理访问；生产会话 Cookie 启用 Secure。不要直接暴露数据库端口。

## 操作

- Click 进入世界 to capture the mouse.
- WASD or arrow keys: move. Mouse: look. Space: jump. Shift: sprint.
- Left click: mine. Right click: place. Number keys 1-7 or mouse wheel: material.
- Esc: pause, save, return to spawn, or create a new world.
- Mobile: left joystick moves; drag the scene to look; pickaxe, plus, and arrow
  buttons mine, place, and jump.

## 当前范围

单人创造模式、57×57 方块地形、七种材料、无限材料、树木、河流、昼夜切换、
账号和服务端存档。基岩不可挖掘；掉出世界会回到出生点。水体为视觉效果。

尚未加入多人联机、怪物、合成、生存系统、邮件验证或找回密码。
当前服务器校验存档结构与权限，不执行权威游戏物理；多人模式需要独立的房间与同步设计。
