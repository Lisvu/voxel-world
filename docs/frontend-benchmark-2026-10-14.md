# Minecraft 前端体验对标与本轮实现

日期：2026-10-14。基线：voxel-world `5253834d2476d3b83b5cf06931165c92fdea9e6f`。

## 方法与范围

已安装 morluto/rea 的 `.agents/skills/reverse-engineer-anything` skill。按其要求先区分目标与证据：voxel-world 有完整源码，使用源码检查和本地浏览器测试；Minecraft 部分使用官方公开操作说明。本次没有 Minecraft 二进制或运行会话，不进行反编译，也不宣称玩法与 Minecraft 完全一致。安装 skill 不等于注册 REA MCP；本次未更改 MCP 配置。

## 证据与决定

| 观察依据 | 基线缺口 | 本轮实现 | 验证范围 |
| --- | --- | --- | --- |
| [Minecraft 官方控制说明](https://www.minecraft.net/article/minecraft-controls)；[教育版操作指南](https://education.minecraft.net/lessonsupportfiles/0795826792427979-Wheel%20of%20Steve%20Educator%20Guide%20v1X1.pdf) | engine 固定 7 格建造方块，工具和食物需反复打开背包 | 九格快捷栏、数字 1–9、背包绑定工具/食物、工具耐久条、按账号和世界隔离的浏览器记忆 | 键盘选择、绑定、重新进入、不同世界隔离、390px 布局 |
| [Minecraft 官方创造背包分类调整](https://feedback.minecraft.net/hc/en-us/articles/9994475500301-Minecraft-Java-Edition-Snapshot-22w42a)；项目 GameView / engine 的四个长列表 | 无搜索、分类和拥有量筛选 | 全部／方块／工具／食物／资源／合成／生物蛋，名称搜索、仅已拥有、空状态、结果数量 | 分类组合、筛选重置、原有点击处理保留 |
| [Minecraft 官方合成指南](https://www.minecraft.net/en-us/article/how-craft) | 点击合成后才知道缺少材料 | 配方展示持有量／需求量、缺口、仅可合成筛选；已有工具和容量上限提示 | 生存消耗、创造模式、已有工具、缺料反馈 |
| [Minecraft 官方生命说明](https://www.minecraft.net/en-us/article/health-minecraft) | 水下 8 秒后扣血，但没有剩余氧气提示 | 10 格氧气提示，低氧变色，出水／重生隐藏 | 使用真实物理与水域的氧气倒计时；保留本项目 8 秒规则 |
| 当前触控板、F/R/T 等自定义键位 | 只有短提示，难以查阅完整操作 | H 帮助面板、顶部入口、暂停阅读、新手采集—合成—快捷栏指引 | 打开暂停、关闭返回菜单、继续游戏 |

以上“缺口”只针对已检查的当前源码，不代表 Minecraft 所有版本的完整功能对照。新增 UI 是本项目的独立实现，没有复制 Minecraft 代码、贴图或品牌资源。

## 有意保留的边界

快捷栏是本机浏览器偏好，不改变云端存档格式。每种工具持有一把、简化合成与既有饥饿规则保持原样。生物蛋仍在图鉴中选用。村民交易、熔炉、盔甲、多人模式不属于本轮范围。

## 验证入口

- `tests/inventory-browser.mjs`：独立背包组件功能与窄屏布局。
- `tests/ux-browser.mjs`：完整游戏中的九格、耐久、存储隔离、帮助暂停和氧气。
- `tests/frontend-browser.mjs`：原有桌面／手机设置、建造、地图与生命周期。
- TypeScript 类型检查与 Vite 生产构建。
