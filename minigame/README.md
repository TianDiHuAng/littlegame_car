# 亮车计划 · 微信小游戏包

这个目录是**构建产物**，不要手改。源代码在 `../prototype/`，改完重新构建：

```bash
node tools/build-minigame.mjs
```

## 目录

| 文件 | 说明 |
|---|---|
| `game.js` | 入口（适配层 + 素材表 + 关卡数据 + 游戏逻辑，全部打在一起） |
| `game.json` | 小游戏配置（竖屏、隐藏状态栏） |
| `project.config.json` | 开发者工具项目配置，`appid` 是 `touristappid`，导入时要改成你自己的 |
| `images/` | 19 张 WebP 素材，共 685 KB |
| `adapter.js` | 适配层**源码**（构建时会被打进 game.js） |
| `preview.html` | 浏览器验证页，不参与打包 |

包体合计 **0.80 MB**，主包上限 4 MB。

## 导入微信开发者工具

1. 打开微信开发者工具 → **导入项目**
2. 目录选这个 `minigame/` 文件夹
3. AppID 填你自己的（或先用「测试号」）
4. 项目类型会自动识别为**小游戏**

`project.config.json` 里已经配好：

```json
{ "compileType": "game", "libVersion": "latest", "setting": { "es6": true } }
```

## 等级 / 每日洗车数 / 好友排行

### 等级

- 每洗一辆给经验：`22 + 星级 × 16`，首次通关 ×1.5
- 升级所需经验：`100 + (等级-1) × 60`
- 数据存在存档里：`level`、`xp`、`washes`
- 结算卡会显示经验条，升级时弹「升级！Lv.N」横幅
- HUD 左上角显示 `Lv.N · 第 x/16 单`

### 每日洗车数

- `save.daily = { d: '2026-11-10', n: 3 }`，跨天自动归零
- 只有**洗完**才算，断水失败不计
- 目标 5 辆（`DAILY_GOAL`），HUD 右上角显示 `今日 3/5`，达标后变成 `5/5 ✓`

### 好友排行

用的是微信的**开放数据域**（open data context）。这块机制必须理解清楚：

```
主域（游戏）                     开放数据域（openDataContext/index.js）
─────────────────────           ────────────────────────────────────
wx.setUserCloudStorage    ──写──▶  云存储
                                   │
wx.getOpenDataContext()          wx.getFriendCloudStorage  ──读──▶ 好友数据
  .postMessage({type:'rank:show'})──▶
                                   │
ctx.drawImage(sharedCanvas) ◀──画──  往 sharedCanvas 上绘制
```

**三个关键点：**

1. **写分数在主域**：每洗一辆调用 `wx.setUserCloudStorage`，写入 `level` / `washes` / `score`
2. **读好友数据只能在开放数据域**：`wx.getFriendCloudStorage` 主域调用会报错
3. **开放数据域碰不到主画布**：它只能画到 `sharedCanvas`，主域再用 `drawImage` 贴到界面上

`game.json` 里已经配好：

```json
{ "openDataContext": "openDataContext" }
```

### 调试排行

- 开发者工具里可以直接看，会返回**模拟好友数据**
- 真机上只有**也玩过这个游戏的好友**才会出现在榜上
- 想验证真实数据，需要一个已发布的游戏 + 至少两个微信号玩过

### 已知限制

**没法高亮"你自己"那一行。** 因为 `getFriendCloudStorage` 返回的每项虽然带 `openid`，但主域拿不到自己的 openid —— 这需要服务端调 `code2session` 换取。没有服务端就只能不做高亮。

要做的话加一个云函数就行，但会引入服务器成本和备案要求。


浏览器 API → `wx.*` 的映射，只在缺失时安装，已有的不动：

| 游戏用到的 | 小游戏里映射到 |
|---|---|
| `document.getElementById('game')` | `wx.createCanvas()` 的主画布 |
| `document.createElement('canvas')` | 后续的 `wx.createCanvas()`（离屏） |
| PointerEvent | `wx.onTouchStart / Move / End / Cancel` |
| `localStorage` | `wx.getStorageSync / setStorageSync` |
| `navigator.vibrate` | `wx.vibrateShort` |
| `Image` | `wx.createImage()` |
| `AudioContext` | `wx.createWebAudioContext()`（基础库 2.19.0+，不支持时自动静音） |
| `document.visibilitychange` | `wx.onHide / onShow` |
| 刘海屏 | `safeArea.top` → `window.__SAFE_TOP` |

游戏逻辑本身**一行没改**，只改了两处图片加载（`new Image()` → `wx.createImage()`，以及加载完成的判定标志）。

## 分享 / 录屏

### 分享

```js
wx.shareAppMessage({
  title: '我在《亮车计划》洗到 Lv.3，累计洗了 26 辆',
  imageUrl: 'images/share_cover.jpg'
});
```

- 标题带**等级和累计洗车数**，每次分享都不一样
- 封面图 `images/share_cover.jpg`（500×400，32 KB），由 `tools/share-cover.html` 渲染生成
- `setupShare()` 里注册了右上角菜单分享（`onShareAppMessage` + `onShareTimeline`），从胶囊菜单分享也走同一套文案
- 结算卡底部有「分享」入口

### 录屏

```js
const rec = wx.getGameRecorderManager();
rec.onStop(res => { videoPath = res.videoPath; });
rec.start({ duration: 60 });   // 第一次出水时开录
rec.stop();                    // 结算时停止
```

- **第一次出水开始录，结算自动停**，不录菜单和等待时间
- 录好的视频存在 `recVideoPath`，下次点「分享」会优先分享视频
- 需要基础库 ≥ 2.10.0；不支持时自动跳过，不影响游戏

> ⚠️ **视频分享这一步请在开发者工具里确认。** 用的是
> `wx.shareAppMessage({ channel: 'video', extra: { videoPath, videoTitle } })`，
> 这条链路需要真机验证。如果报错，把 `shareNow` 里的 `if (recVideoPath)` 分支删掉，
> 退回成只分享卡片即可。

### 浏览器里验证

`tools/wx-shim.js` 模拟了 `shareAppMessage`，payload 会打到控制台：

```
[shim] 分享: {"title":"我在《亮车计划》洗到 Lv.1，累计洗了 0 辆","imageUrl":"images/share_cover.jpg"}
```

录屏能力在浏览器里**故意不提供**，所以分享会自动退到卡片模式。

---

## 浏览器里先验证

不想开开发者工具时，可以直接在浏览器跑这个包：

```
minigame/preview.html
```

它用 `../tools/wx-shim.js` 在浏览器里模拟 `wx.*`，能验证渲染、触摸、存储是否都接对了。
正式打包时 `preview.html` 已在 `packOptions.ignore` 里排除。

自动检查：

```bash
node tools/check-minigame.mjs
```

会打印控制台错误、环境信息，并模拟一次拖动看进度是否变化。

## 已知限制

- **音频**：小游戏里用的是 `wx.createWebAudioContext`，需要基础库 ≥ 2.19.0。低版本会自动静音，不影响游戏。
- **WebP**：素材是 WebP 格式。微信小游戏支持，但很老的机型可能解码慢。如果遇到图片不显示，可以改成 PNG（包体会涨到 9 MB 左右，需要先压缩）。
- **屏幕比例**：目前是全屏铺满，没有做超宽屏的留边。iPad 上会偏拉伸。
- **分包**：0.8 MB 不需要分包。

## 上线前还差的

- [ ] 换成真实 AppID
- [ ] 服务器域名配置（目前没有网络请求，暂不需要）
- [ ] 隐私协议 / 用户信息授权（如果有排行榜才需要）
- [ ] 分享接口 `wx.shareAppMessage`
- [ ] 录屏接口 `wx.getGameRecorderManager`
- [ ] 内容自审（游戏内容极简单，风险低）
