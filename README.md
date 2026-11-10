# littlegame · 微信小游戏（解压向）

## 快速开始

**双击 [`prototype/play.cmd`](prototype/play.cmd)** —— 会直接用 Chrome/Edge 打开游戏。

> 不要直接双击 `.html`：这台机器把它关联到了 Internet Explorer，会显示空白页。

## 目录

| 路径 | 说明 |
|---|---|
| [`docs/01-concepts.md`](docs/01-concepts.md) | 五个解压向概念方案、组合策略、平台约束、验证计划 |
| [`prototype/`](prototype/) | 《亮车计划》可玩原型，含单文件版与说明 |
| [`tools/shot.mjs`](tools/shot.mjs) | headless Chrome 截图回归（真实派发指针事件） |
| [`tools/bundle.mjs`](tools/bundle.mjs) | 打包单文件版 |

## 当前进度

- [x] 概念方案（5 个方向 + 推荐组合）
- [x] v1 手感原型：冲洗 / 粒子 / 音效 / 3 关卡 / 结算
- [x] v2 成长系统：3 条升级线 / 金币 / 存档 / 10 关卡 / 4 类物体 / 3 种脏法
- [x] v3 代价系统：水槽 / 星级=省水 / 升级幅度收窄 / 单局翻倍
- [x] v4 四个拓展：区域化脏污（14 关）/ 洗前洗后对比 / 泡沫预浸 / 禅模式
- [x] v7 美术换血：本地 ComfyUI 生成 19 张位图素材（手绘厚涂风）+ 色相抠像 + WebP 压缩 0.68MB
- [ ] 找人试玩，判定 keep / kill（判据见 [prototype/README.md](prototype/README.md)）
- [ ] （若 keep）重写正式版：真实污渍贴图 + 真实水声采样
- [ ] 一单多车 / 无尽模式（解决单局时长与满级后的内容）
- [ ] 迁微信小游戏 + 资质/上线
