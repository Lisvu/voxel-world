# 野境 / Voxel World

一个 TypeScript 全栈单人方块沙盒。前端 React + Vite + Three.js + Rapier，
后端 NestJS，数据库 PostgreSQL，通过 Prisma 管理迁移和数据访问。
方块贴图为本地生成的原创素材，不使用 Minecraft 游戏资源。

## 本机启动

首次运行需要先安装依赖和 PostgreSQL 17，并按下方步骤初始化。`db:local` 将数据库保存到 `.local/postgres`，仅监听 `127.0.0.1:55432`。
数据库密码自动生成，位于被 Git 忽略的 `.env`，不要提交该文件。

```sh
cd ~/voxel-world
npm run db:local
npm run db:generate
npm run db:migrate
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
- 初始世界保存种子和生成器版本；16×16 区块按需生成，方块修改按水平区块保存到 JSONB。旧生成器世界保留原始河谷，外部生成新地貌。
- 保存还包括玩家位置、朝向、材料、游戏时间、模式、生命、背包、死亡掉落、天气设置与生物蛋生成的生物。数据库事务使用 revision
  乐观锁，旧页面保存时返回 409，不能覆盖更新后的世界。
- 游戏编辑防抖保存，运行中每 15 秒保存，暂停和返回列表时保存。
- 请求失败会显示未同步状态，并保留按账号、世界和标签页隔离的本地草稿。
  重试可恢复同步；重新进入时，可将草稿恢复为独立世界，避免覆盖云端版本。
- 原来的 `voxel-world-v1` 浏览器存档不会被删除，可在世界列表导入。
  浏览器存储按站点地址隔离：旧存档在 5173 时，应从相同地址打开新版本才能发现。
- 每个世界最多 30,000 处方块修改；未修改的地形由种子重建，不占用存档。修改集仍整体保存，达到上限会提示，不能继续修改新的位置。

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
- Left click: mine. Right click: place. Number keys 1-9 or mouse wheel: material.
- Esc: pause, save, return to spawn, or create a new world.
- Mobile: left joystick moves; drag the scene to look; pickaxe, plus, and arrow
  buttons mine, place, and jump.

## 当前范围

单人创造／基础生存模式；水平坐标 −32,768 到 32,768（每边 65,537 格），高度 96 格，19 种方块材料。按 16×16 区块加载附近地形，只绘制外露面，远处区块与生物渲染资源会卸载。不是一次加载整个世界，也不是无限世界。

包含原野、雪地、火山、沼泽森林、暮色森林、海洋，原野会生成带房屋和水井结构的村落。同一种子和生成器版本得到相同地形。旧存档的中心 57×57 河谷及修改保留，向外可以继续探索。

牛、羊、鸡、鱼、牦牛按地貌自然出现并活动；创造模式的物品栏可领取对应生物蛋。陆生动物需要干燥地面和活动空间，鱼需要水域。生物蛋生成的生物（最多 256 只）随存档保存；自然生物按区域重建，远处自然生物不持久保存其每一步移动。生物可以受伤、死亡并掉落物品；死亡标识随存档保存，最多 10,000 个。尚无繁殖、驯养和村民交易。

生存模式初始 20 点生命、空背包；挖掘获得材料，放置消耗材料。摔落超过 3 格、长时间潜水和站在熔岩石上会受伤。死亡后可重生；未开启“死亡不掉落”时，背包留在原地，靠近拾回。单种材料上限 9,999，掉落堆上限 256；达到掉落堆上限时保留本次背包，避免静默丢失。创造模式无敌，物品栏可无限领取并放置材料。游戏设置可切换模式、开启死亡不掉落。

游戏中实际经过 **600 秒 = 游戏 24 小时**。暂停、切出页面或离开世界时停止计时；时间和天数保存，新世界从 08:00 开始。提供渐变昼夜光照、晴朗夜晚星空、雨、雪、雷阵雨和多云；自动天气约每 90 秒选取一次状态（可能延续相同天气），也可在游戏设置手动选择。天气不会修改地形或自动堆积雪层。

尚未加入多人联机、敌对怪物、邮件验证或找回密码。当前服务器校验存档结构与所有权，不执行权威游戏物理。

## 前端探索工具

- 世界大厅支持按名称搜索，按最近更新、名称和修改数量排序；最近游玩入口按账号保存在当前浏览器。
- 暂停菜单或右上角可打开游戏设置：鼠标／触屏灵敏度、视野、音效音量、画质与阴影。画质控制渲染分辨率，操作偏好保存在当前浏览器；游戏模式、死亡规则和天气选择随世界存档保存。
- 右上角小地图显示地形、玩家朝向与出生点，建造后同步更新；`M` 收起／展开，`Shift + M` 放大／缩小，手机可点击地图按钮。
- 对准 6 格内的方块可看到放置预览：绿色可放置，红色不可放置，并显示原因。
- `E` 打开材料和生物蛋物品栏；`B` 或鼠标中键吸取目标材料，手机使用吸管按钮。图鉴选择与快捷栏同步。

前端验证（浏览器测试使用模拟 API，无需数据库；完整真实接口测试仍使用上文命令）：

```sh
npm run test:frontend
# 先运行 npm run dev:web，并安装本机 Chrome
TEST_WEB_URL=http://localhost:5173 npm run test:frontend:browser
```

浏览器测试覆盖桌面与手机的大厅搜索排序、设置持久化、材料选择、放置与地图更新、暂停和重新进入。

## 大世界和模式验证

```sh
npm run test:world
npm run test:world:service
# 先启动 npm run dev:web；以下测试使用模拟 API，无需数据库
TEST_WEB_URL=http://localhost:5173 npm run test:world:browser
TEST_WEB_URL=http://localhost:5173 npm run test:modes:browser
```

覆盖确定性地形、旧河谷逐格兼容、负坐标区块重建、600 秒昼夜比例、背包消耗和死亡规则；浏览器覆盖六种地貌、跨区块移动、生物蛋、天气、生命与存档恢复。真实 PostgreSQL 保存测试使用 `npm run test:api`，需启动数据库和后端。新增状态存储在已有 JSON 字段，无新增数据库迁移。


## 触控板与采集生存更新

- 内置浏览器不支持鼠标锁定时，触控板无需按住，滑动指针即可转向；双指滑动也可调整视角。T 切换自由转向／释放光标，WASD 移动，F 挖掘／攻击，R 放置／进食，E 打开背包，Esc 暂停。
- 新增村民、燕子、老鹰、麻雀、猫及生物蛋。村民出现在村庄，鸟类在空中活动。生物有生命，武器伤害随材质增加，死亡生成肉、鱼肉、羽毛或绿宝石掉落。
- 地下增加煤、铜、铁、金、钻石、绿宝石矿脉。矿石掉落对应资源；旧版中心河谷保持原样，已有方块修改优先保留。
- 木、石、铜、铁、金、钻石六种材质各有镐、剑、铲、锄、斧，共 30 种工具。镐加速岩石／矿石，斧加速木材，铲加速土沙雪，锄加速树叶；剑提高攻击伤害。每次挖掘完成或命中消耗一次耐久，耗尽后损坏。背包显示当前／最大耐久，每种工具持有一把。
- 在背包合成区查看和使用配方；本版矿物可直接用于合成，不需要熔炉。面包由 3 小麦合成，烤肉由生肉和煤炭合成。挖草获得小麦，树叶可掉苹果或浆果；生物提供肉类或鱼肉。
- 方块和生物死亡生成可见掉落物，靠近 4 格内开始吸引，2.5 格内收入背包。掉落、死亡遗留工具的耐久、饥饿及生物死亡标识均保存。
- 生命 20 点显示为左侧 10 个爱心，饱腹 20 点显示为右侧 10 个面包。活动中每 25 秒消耗 1 点饱腹（左 Shift 冲刺时加倍）；饱腹至少 16 点时每 5 秒回复 1 生命并消耗半点饱腹，饱腹耗尽每 5 秒扣 1 生命。暂停停止消耗，创造模式免疫伤害。

验证：`npm run test:survival`、`npm run test:survival:browser`；后者需要运行开发服务和本机 Chrome，使用隔离的测试存档。

## 本地网页无法访问

`http://localhost:5173/` 需要当前电脑上的开发服务运行。先确认数据库和 `npm run dev` 均已启动，并保持启动终端运行；重启电脑后需重新启动。账号和存档还需要后端与数据库，不要仅运行 `dev:web`。确认终端输出的实际端口，通过 `/api/health` 检查后端。若出现 `Cannot find package express`，更新代码后重新执行 `npm ci`。

## 背包与探索界面更新

- 背包提供方块、工具、食物、资源、合成、生物蛋分类，以及名称搜索、仅已拥有和仅可合成筛选。配方直接显示材料持有量、需求量和缺口。
- 九格快捷栏可绑定工具、食物和材料；背包中选中物品，再选择格位并点击放入快捷栏。数字 1–9 切换，工具显示耐久条。配置按账号和世界保存在当前浏览器，不随云端存档同步。
- 生存模式潜水显示十格氧气和低氧警告，沿用八秒后开始缺氧受伤的规则。
- H 或顶部帮助按钮打开操作说明，阅读时暂停游戏；包含触控板与采集合成指引。

验证：`npm run test:inventory:browser`、`npm run test:ux:browser`、`npm run test:frontend:browser`。需开发服务和本机 Chrome。对标依据与实现边界见 [前端体验对标记录](docs/frontend-benchmark-2026-10-14.md)。
