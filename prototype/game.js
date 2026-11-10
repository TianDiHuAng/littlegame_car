/* =====================================================================
 * 亮车计划 · 可玩原型
 *
 * v2 相比 v1：升级系统（水压/喷嘴/除油剂）、金币与存档、
 * 10 个关卡、4 类物体、3 种脏法。
 *
 * 调试：?lv=3 指定关卡；?auto=1 自动扫射；?fresh=1 清空存档
 * =================================================================== */
(function () {
  'use strict';

  /* ---------------------------------------------------------------
   * 0. 画布与工具
   * ------------------------------------------------------------- */
  var stage = document.getElementById('stage');
  var cv = document.getElementById('game');
  // 某些基础库对带选项的 getContext 会返回 null，必须有回退，否则整屏空白且不报错
  var ctx = cv.getContext('2d', { alpha: false }) || cv.getContext('2d');

  /* 启动步骤显示器：一旦中途失败，屏幕上会留下走到哪一步的清单 */
  var BOOT_LOG = [];
  var bootDone = false;
  function bootMark(tag) {
    BOOT_LOG.push(tag);
    if (bootDone || !ctx) return;
    try {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#0d1620';
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = '#5fd39a';
      ctx.font = '16px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('启动中 ' + BOOT_LOG.length, 14, 16);
      for (var i = 0; i < BOOT_LOG.length; i++) {
        ctx.fillText((i + 1) + '. ' + BOOT_LOG[i], 14, 48 + i * 22);
      }
    } catch (e) {}
  }

  var dirtCv = document.createElement('canvas');
  var dctx = dirtCv.getContext('2d');
  var heavyCv = document.createElement('canvas');    // 厚泥层：盖在软泥上面，只能用泡沫
  var hctx = heavyCv.getContext('2d');
  var grainCv = null;
  var IMAGES = {};               // 位图素材（assets.js 里的 data URI）
  var imagesReady = false;

  function loadImages(done) {
    var src = window.CW_IMG || {};
    var keys = Object.keys(src);
    if (!keys.length) { imagesReady = true; done(); return; }
    var left = keys.length;
    keys.forEach(function (k) {
      var im = new Image();
      var settle = function (okFlag) {
        if (okFlag) {
          // 小游戏图片对象不一定有 naturalWidth，onload 时就把尺寸记下来
          im.__w = im.naturalWidth || im.width || 0;
          im.__h = im.naturalHeight || im.height || 0;
          im.__ok = true;
        } else {
          im.__err = true;
        }
        if (--left === 0) { imagesReady = true; done(); }
      };
      im.onload = function () { settle(true); };
      im.onerror = function () { settle(false); };
      im.src = src[k];
      IMAGES[k] = im;
    });
  }

  /** 稳健取尺寸：小游戏没有 naturalWidth，退回 width，再退回 onload 时记下的值 */
  function imgW(im) { return (im && (im.__w || im.naturalWidth || im.width)) || 0; }
  function imgH(im) { return (im && (im.__h || im.naturalHeight || im.height)) || 0; }

  function imgOf(name) {
    var im = name && IMAGES[name];
    if (!im || im.__err) return null;
    if (im.__ok) return im;
    if (im.complete && (im.naturalWidth || im.width)) return im;
    return null;
  }

  var trimCache = {};
  var tintCache = {};
  var softCache = {};

  /**
   * 柔边贴图：把贴图的 alpha 乘一个径向渐变，边缘淡到 0。
   * 这是消除"贴图边界感"的关键 —— 硬边贴图叠在一起就会露出方形/圆形接缝。
   */
  function softTex(name) {
    var im = imgOf(name);
    if (!im) return null;
    if (softCache[name]) return softCache[name];

    var w = imgW(im), h = imgH(im);
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    g.drawImage(im, 0, 0);

    g.globalCompositeOperation = 'destination-in';
    var grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) * 0.5);
    grd.addColorStop(0, 'rgba(0,0,0,1)');
    grd.addColorStop(0.5, 'rgba(0,0,0,1)');
    grd.addColorStop(0.74, 'rgba(0,0,0,0.55)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';

    softCache[name] = c;
    return c;
  }

  /** 给贴图染色（source-atop 只作用在已有像素上，保留裂纹和 alpha） */
  function tintedTex(name, tint) {
    var im = imgOf(name);
    if (!im) return null;
    var key = name + '|' + tint;
    if (tintCache[key]) return tintCache[key];

    var c = document.createElement('canvas');
    c.width = imgW(im);
    c.height = imgH(im);
    var g = c.getContext('2d');
    g.drawImage(im, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = tint;
    g.fillRect(0, 0, c.width, c.height);

    // 同样做柔边，避免厚泥块露出方形接缝
    g.globalCompositeOperation = 'destination-in';
    var grd = g.createRadialGradient(
      c.width / 2, c.height / 2, 0,
      c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.5
    );
    grd.addColorStop(0, 'rgba(0,0,0,1)');
    grd.addColorStop(0.52, 'rgba(0,0,0,1)');
    grd.addColorStop(0.76, 'rgba(0,0,0,0.55)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, c.width, c.height);

    g.globalCompositeOperation = 'source-over';

    tintCache[key] = c;
    return c;
  }

  /** 裁掉透明留白：生成图四周有空白，不裁的话物体在屏幕上会显得很小 */
  function trimOf(name) {
    var im = imgOf(name);
    if (!im) return null;
    if (trimCache[name]) return trimCache[name];

    var w = imgW(im), h = imgH(im);
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    g.drawImage(im, 0, 0);

    var d;
    try { d = g.getImageData(0, 0, w, h).data; } catch (e) {
      trimCache[name] = { x: 0, y: 0, w: w, h: h };
      return trimCache[name];
    }

    var x0 = w, y0 = h, x1 = -1, y1 = -1, x, y;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 60) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) {
      trimCache[name] = { x: 0, y: 0, w: w, h: h };
      return trimCache[name];
    }
    var pad = Math.round(Math.min(w, h) * 0.015);
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
    x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);

    trimCache[name] = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    return trimCache[name];
  }

  /** 把物体画进 b（自动按裁边后的比例拉伸） */
  function drawArt(c, b, name) {
    var im = imgOf(name);
    if (!im) return false;
    var t = trimOf(name) || { x: 0, y: 0, w: imgW(im), h: imgH(im) };
    c.drawImage(im, t.x, t.y, t.w, t.h, b.x, b.y, b.w, b.h);
    return true;
  }
  var tintCv = document.createElement('canvas');     // 高亮用的临时层
  var tctx = tintCv.getContext('2d');
  var beforeCv = document.createElement('canvas');   // 开洗前的脏污快照，用于对比
  var bctx = beforeCv.getContext('2d');
  var cleanCv = document.createElement('canvas');
  var cctx = cleanCv.getContext('2d');
  var probe = document.createElement('canvas');
  probe.width = 48; probe.height = 48;
  var pctx = probe.getContext('2d', { willReadFrequently: true }) || probe.getContext('2d');

  var NS = window.CW;
  var LEVELS = NS.LEVELS;
  var UPGRADES = NS.UPGRADES;

  var QS = new URLSearchParams(location.search);
  var AUTO = QS.has('auto');
  // 刘海屏安全区（微信适配层会设置；浏览器里为 0）
  var SAFE_TOP = (typeof window !== 'undefined' && window.__SAFE_TOP) || 0;
  var FONT = 'system-ui,"PingFang SC","Microsoft YaHei",sans-serif';

  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(a, b) { return a + Math.random() * (b - a); }

  function hexRGB(h) {
    var n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mixHex(a, b, t) {
    var A = hexRGB(a), B = hexRGB(b);
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' +
      Math.round(A[1] + (B[1] - A[1]) * t) + ',' +
      Math.round(A[2] + (B[2] - A[2]) * t) + ')';
  }

  function rr(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function starPath(c, cx, cy, r) {
    c.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5;
      var rad = i % 2 === 0 ? r : r * 0.45;
      var px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
  }

  /* ---------------------------------------------------------------
   * 1. 存档
   * ------------------------------------------------------------- */
  var SAVE_KEY = 'chongyichong.save.v2';

  function defaultSave() {
    return {
      coins: 0,
      up: { pressure: 1, nozzle: 1, detergent: 1 },
      best: {},
      idx: 0,
      level: 1,          // 洗车等级
      xp: 0,             // 当前等级内的经验
      washes: 0,         // 累计洗车数
      daily: { d: '', n: 0 }   // 今天洗了几辆
    };
  }

  /** 升到下一级需要的经验 */
  function xpForNext(lv) {
    return 100 + (lv - 1) * 60;
  }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  /** 跨天自动清零今日计数 */
  function refreshDaily() {
    var k = todayKey();
    if (save.daily.d !== k) {
      save.daily.d = k;
      save.daily.n = 0;
    }
  }

  var DAILY_GOAL = 5;

  function loadSave() {
    var s = null;
    if (!QS.has('fresh')) {
      try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { s = null; }
    }
    var d = defaultSave();
    if (!s || typeof s !== 'object') return d;

    s.coins = Math.max(0, s.coins | 0);
    s.up = s.up || {};
    for (var k in d.up) s.up[k] = clamp(s.up[k] | 0 || 1, 1, 5);
    s.best = s.best || {};
    s.idx = clamp(s.idx | 0, 0, LEVELS.length - 1);

    // 老存档没有这些字段，补默认值
    s.level = clamp(s.level | 0 || 1, 1, 99);
    s.xp = Math.max(0, s.xp | 0);
    s.washes = Math.max(0, s.washes | 0);
    s.daily = s.daily || {};
    s.daily.d = s.daily.d || '';
    s.daily.n = Math.max(0, s.daily.n | 0);

    // 经验可能超过上限（改过曲线），往前推
    var guard = 0;
    while (s.xp >= xpForNext(s.level) && guard++ < 200) {
      s.xp -= xpForNext(s.level);
      s.level++;
    }
    return s;
  }

  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
  }

  /** 把成绩写进微信云存储，好友排行榜才能读到 */
  function syncRank() {
    try {
      if (typeof wx === 'undefined') return;
      if (!wx.setUserCloudStorage) return;
      wx.setUserCloudStorage({
        KVDataList: [
          { key: 'level', value: String(save.level) },
          { key: 'washes', value: String(save.washes) },
          { key: 'score', value: String(save.level * 1000 + save.washes) }
        ],
        fail: function () {}
      });
    } catch (e) {}
  }

  /* ---------------- 分享 / 录屏 ---------------- */
  var SHARE_IMG = 'images/share_cover.jpg';
  var recMgr = null;
  var recActive = false;
  var recVideoPath = null;

  function shareTitle() {
    var t = '我在《亮车计划》洗到 Lv.' + save.level + '，累计洗了 ' + save.washes + ' 辆';
    return t.length > 36 ? t.slice(0, 36) + '…' : t;
  }

  function setupShare() {
    try {
      if (typeof wx === 'undefined') return;
      if (wx.showShareMenu) {
        wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
      }
      if (wx.onShareAppMessage) {
        wx.onShareAppMessage(function () {
          return { title: shareTitle(), imageUrl: SHARE_IMG };
        });
      }
      if (wx.onShareTimeline) {
        wx.onShareTimeline(function () {
          return { title: shareTitle(), imageUrl: SHARE_IMG };
        });
      }
    } catch (e) {}
  }

  function shareNow() {
    try {
      if (typeof wx === 'undefined' || !wx.shareAppMessage) {
        toast('分享需要在微信里使用');
        return;
      }
      // 有录像就分享录像（更吸引人），否则分享成绩卡片
      if (recVideoPath) {
        wx.shareAppMessage({
          channel: 'video',
          extra: { videoPath: recVideoPath, videoTitle: shareTitle() }
        });
      } else {
        wx.shareAppMessage({ title: shareTitle(), imageUrl: SHARE_IMG });
      }
      blip(880);
    } catch (e) {}
  }

  function setupRecorder() {
    try {
      if (typeof wx === 'undefined' || !wx.getGameRecorderManager) return;
      recMgr = wx.getGameRecorderManager();
      recMgr.onStop(function (res) {
        recActive = false;
        if (res && res.videoPath) {
          recVideoPath = res.videoPath;
          toast('录像已保存，可以分享');
        }
      });
      recMgr.onError(function () { recActive = false; });
    } catch (e) { recMgr = null; }
  }

  function startRecording() {
    if (!recMgr || recActive) return;
    try {
      recMgr.start({ duration: 60 });
      recActive = true;
    } catch (e) {}
  }

  function stopRecording() {
    if (!recMgr || !recActive) return;
    try { recMgr.stop(); } catch (e) {}
  }

  // 音效开关记在本地
  try { audioOn = localStorage.getItem('chongyichong.audio') !== '0'; } catch (e) { }

  var save = loadSave();
  refreshDaily();
  if (QS.has('lv')) save.idx = clamp(parseInt(QS.get('lv'), 10) || 0, 0, LEVELS.length - 1);

  /* ---------------------------------------------------------------
   * 2. 升级效果
   * ------------------------------------------------------------- */
  // 升级幅度刻意收窄：满级大约是 1 级的两倍效率，不是五倍。
  // 五倍会让游戏在升级完成的一瞬间失去内容。
  // 手感松紧的总开关：想让玩家更轻松就调大，不碰关卡数据
  var WATER_BONUS = 1.38;
  var FOAM_BONUS = 1.40;

  function brushRadius() { return W * (0.052 + 0.0042 * (save.up.pressure - 1)); }
  function stampSteps() { return [1, 2, 2, 3, 4][save.up.nozzle - 1]; }
  function eraseAlpha() { return 0.26 + 0.021 * (save.up.nozzle - 1); }
  function greasePower() { return [0.55, 0.9, 1.3, 1.8, 2.4][save.up.detergent - 1]; }

  /* ---------------------------------------------------------------
   * 3. 状态
   * ------------------------------------------------------------- */
  var W = 480, H = 900, DPR = 1;
  var levelIndex = clamp(save.idx, 0, LEVELS.length - 1);
  // 多车订单本身没有 art/bounds，初始化时先取它的第一辆
  var level = LEVELS[levelIndex].fleet
    ? (NS.LEVEL_INDEX[LEVELS[levelIndex].fleet[0]] || LEVELS[0])
    : LEVELS[levelIndex];
  var bounds = { x: 0, y: 0, w: 1, h: 1 };

  var state = 'play';               // play | done | upgrade | compare
  var order = null;                 // 当前订单（可能是多车）
  var partIdx = 0, partTotal = 1, partDone = 0;
  var orderWaterMax = 0;
  var pickOptions = [];             // 还没洗的车在 fleet 里的下标
  var thumbs = {};                  // 选车卡片的缩略图
  var pointer = { x: 0, y: 0, down: false };
  var lastX = 0, lastY = 0;
  var parts = [];
  var grease = [];
  var buttons = [];

  var progress = 0, progShown = 0, totalDirty = 1;
  var finishing = false, finishT = 0;
  var firstSpray = true;
  var startTime = 0, doneAt = 0, elapsed = 0;
  var sampleTimer = 0, shineT = 0, autoT = 0;

  var lastGain = 0, coinShown = 0, coinTarget = 0;
  var lastXP = 0, levelUpTo = 0;
  var buyFlash = 0, buyRow = -1;
  var glossBucket = -1;
  var compareSplit = 0.5, compareDrag = false;

  // 泡沫：独立资源，只在玩家主动使用时生效，不会破坏现有的水量平衡
  var foamDots = [];
  var foam = 100, foamMax = 100;
  var FOAM_RATE = 26;           // 每秒消耗
  var FOAM_BOOST = 2.2;         // 打过泡沫的地方，冲洗效率倍数
  var tool = 'rinse';           // rinse | foam | scrape | paint
  var paintSpots = [];
  var toastT = 0, toastMsg = '';
  var heavyLeftFrac = 0;
  var heavyHintCd = 0;

  /** 取某点的 alpha（0..1），用来判断指针下面是哪种污渍 */
  var probe2 = null, probe2ctx = null;
  function alphaAt(cv, x, y) {
    if (!probe2) {
      probe2 = document.createElement('canvas');
      probe2.width = 2; probe2.height = 2;
      probe2ctx = probe2.getContext('2d', { willReadFrequently: true }) || probe2.getContext('2d');
    }
    try {
      probe2ctx.clearRect(0, 0, 2, 2);
      probe2ctx.drawImage(cv, x * DPR - DPR, y * DPR - DPR, 4, 4, 0, 0, 2, 2);
      var d = probe2ctx.getImageData(0, 0, 2, 2).data;
      var mx = 0;
      for (var i = 3; i < d.length; i += 4) if (d[i] > mx) mx = d[i];
      return mx / 255;
    } catch (e) { return 0; }
  }
  var zen = false;              // 禅模式：无限水、无星级、纯解压

  // 水量：这一版的"代价"。冲得慢、冲得散 = 浪费水 = 拿不到星
  var WATER_RATE = 10;          // 每秒消耗
  var water = 120, waterMax = 120;
  var waterSpent = 0;           // 本关累计用水，仅用于调平衡
  var dryT = 0;                 // >0 表示断水结算倒计时
  var finishReason = '';        // complete | dry
  var finalWater = 0, finalProgress = 0;

  var hasLayout = false;

  /* ---------------------------------------------------------------
   * 4. 尺寸
   * ------------------------------------------------------------- */
  function resize() {
    var r = stage.getBoundingClientRect();
    // 某些基础库下 getBoundingClientRect 可能返回 NaN，会让画布变成 0 号尺寸（黑屏）
    var nw = Math.max(300, Math.round(r.width) || 0);
    var nh = Math.max(420, Math.round(r.height) || 0);
    if (!isFinite(nw) || !isFinite(nh)) { nw = 360; nh = 640; }

    // 移动端地址栏收起/展开只拉伸画布，不重置关卡
    if (hasLayout && Math.abs(nw - W) < 80 && Math.abs(nh - H) < 180) {
      cv.style.width = nw + 'px';
      cv.style.height = nh + 'px';
      return;
    }
    hasLayout = true;

    W = nw; H = nh;
    DPR = window.devicePixelRatio;
    if (!(DPR > 0) || !isFinite(DPR)) DPR = 1;
    DPR = Math.min(DPR, 2);

    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';

    adoptBuffer();
    applyLayout();
  }

  /**
   * 以画布缓冲区真实像素为准反推逻辑尺寸。
   * 运行时可能把缓冲区固定成屏幕物理分辨率，那样按 CSS 尺寸绘制只会铺满一部分。
   */
  function adoptBuffer() {
    var bw = Math.round(cv.width), bh = Math.round(cv.height);
    if (!(bw > 0) || !(bh > 0)) return false;
    var wantW = Math.round(W * DPR), wantH = Math.round(H * DPR);
    if (bw === wantW && bh === wantH) return false;
    var s = bh / H;
    if (!(s > 0) || !isFinite(s)) s = DPR;
    DPR = s;
    W = bw / s;
    return true;
  }

  /** 按当前 W/H/DPR 重排离屏层、上下文变换，并重建关卡 */
  function applyLayout() {
    var bw = Math.round(W * DPR), bh = Math.round(H * DPR);
    if (cv.width !== bw) cv.width = bw;
    if (cv.height !== bh) cv.height = bh;

    [dirtCv, cleanCv, beforeCv, heavyCv, tintCv].forEach(function (c) {
      c.width = bw;
      c.height = bh;
    });

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    dctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    bctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    hctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    tctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    if (order) loadPart(partIdx, water); else configureLevel();
  }

  /* ---------------------------------------------------------------
   * 5. 关卡装配
   * ------------------------------------------------------------- */
  function configureLevel() {
    bounds = {
      x: W * level.bounds.x,
      y: H * level.bounds.y,
      w: W * level.bounds.w,
      h: H * level.bounds.h
    };

    // 有位图时按"裁边后"的宽高比居中收进 bounds，避免拉伸变形
    var artImg = imgOf(level.art.img);
    if (artImg) {
      var tt = trimOf(level.art.img) || { w: imgW(artImg), h: imgH(artImg) };
      var sc = Math.min(bounds.w / tt.w, bounds.h / tt.h);
      var fw = tt.w * sc, fh = tt.h * sc;
      bounds = {
        x: bounds.x + (bounds.w - fw) / 2,
        y: bounds.y + (bounds.h - fh) / 2,
        w: fw,
        h: fh
      };
    }

    glossBucket = -1;
    buildBodyMask();
    buildRegionMask();
    buildCoverMask();
    bakeClean(0);
    bakeDirt();
    bakeHeavy();
    makeGrease();
    bakeGreaseSprites();
    makePaint();

    // 洗前快照 = 软泥 + 厚泥
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.clearRect(0, 0, beforeCv.width, beforeCv.height);
    bctx.drawImage(dirtCv, 0, 0);
    bctx.drawImage(heavyCv, 0, 0);

    captureBaseline();

    progress = 0; progShown = 0;
    finishing = false; finishT = 0; shineT = 0;
    state = 'play';
    parts.length = 0;
    buttons = [];
    firstSpray = true;
    sampleTimer = 0;
    autoT = 0;
    lastGain = 0; coinShown = 0; coinTarget = 0;
    lastXP = 0; levelUpTo = 0;
    recVideoPath = null;
    waterMax = level.water || 120;
    water = waterMax;
    waterSpent = 0;
    dryT = 0;
    foamMax = Math.round((level.foam || 100) * FOAM_BONUS);
    foam = foamMax;
    foamDots.length = 0;
    tool = 'rinse';
    heavyLeftFrac = level.heavy ? 1 : 0;
    toastT = 0;
    toastMsg = '';
    if (zen) { water = 1e9; waterMax = 1e9; foam = 1e9; foamMax = 1e9; }
    finishReason = '';
    startTime = performance.now();
    doneAt = 0;
    elapsed = 0;
  }

  /** 车漆高光随清洁度增长：越干净越亮，脏东西盖住的地方自然看不到 */
  function bakeClean(gloss) {
    cctx.setTransform(1, 0, 0, 1, 0, 0);
    cctx.clearRect(0, 0, cleanCv.width, cleanCv.height);
    cctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    var b = bounds;
    if (!drawArt(cctx, b, level.art.img)) {
      level.art.paint(cctx, b);
    }

    gloss = gloss || 0;
    if (gloss > 0.02) {
      cctx.save();
      // source-atop：只画在已有像素上，位图和矢量都适用
      cctx.globalCompositeOperation = 'source-atop';
      var g = cctx.createLinearGradient(b.x, b.y + b.h * 0.15, b.x + b.w * 0.75, b.y + b.h);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.28, 'rgba(255,255,255,' + (0.30 * gloss).toFixed(3) + ')');
      g.addColorStop(0.42, 'rgba(255,255,255,0)');
      g.addColorStop(0.60, 'rgba(255,255,255,' + (0.14 * gloss).toFixed(3) + ')');
      g.addColorStop(0.76, 'rgba(255,255,255,0)');
      cctx.fillStyle = g;
      cctx.fillRect(b.x, b.y, b.w, b.h);
      cctx.restore();
    }
  }

  function updateGloss() {
    var bucket = Math.floor(progress * 8);
    if (bucket === glossBucket) return;
    glossBucket = bucket;
    bakeClean(progress);
  }

  function fadeOf(color) {
    return color.replace(/,\s*[\d.]+\)$/, ',0)');
  }

  /* =============================================================
   * 重建段：音频 / 采样 / 污渍绘制 / 冲洗 / 粒子 / 场景 / 订单 / 结算 / 更新
   * ============================================================= */

  /* ---------------- 音频 ---------------- */
  var ac = null, master = null, waterVoice = null, foamVoice = null;
  var audioOn = true, noiseBuf = {};
  var waterOn = false, waterSpeed = 0, waterLeft = 1, foamToolOn = false;

  function pinkNoise(ctx) {
    if (noiseBuf.pink) return noiseBuf.pink;
    var len = Math.floor(ctx.sampleRate * 3);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (var i = 0; i < len; i++) {
      var w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    noiseBuf.pink = buf;
    return buf;
  }

  function whiteNoise(ctx) {
    if (noiseBuf.white) return noiseBuf.white;
    var len = Math.floor(ctx.sampleRate * 2);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noiseBuf.white = buf;
    return buf;
  }

  function loopSrc(ctx, buf) {
    var s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.start();
    return s;
  }

  function initAudio() {
    if (QS.has('mute')) return;
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ac = new AC();
      master = ac.createGain();
      master.gain.value = audioOn ? 0.9 : 0.0001;
      master.connect(ac.destination);

      var pink = loopSrc(ac, pinkNoise(ac));
      var bp1 = ac.createBiquadFilter(); bp1.type = 'bandpass'; bp1.frequency.value = 700; bp1.Q.value = 0.9;
      var bp2 = ac.createBiquadFilter(); bp2.type = 'bandpass'; bp2.frequency.value = 1650; bp2.Q.value = 1.4;
      var bp3 = ac.createBiquadFilter(); bp3.type = 'bandpass'; bp3.frequency.value = 3200; bp3.Q.value = 2.2;
      var g1 = ac.createGain(); g1.gain.value = 0.55;
      var g2 = ac.createGain(); g2.gain.value = 0.42;
      var g3 = ac.createGain(); g3.gain.value = 0.20;

      var white = loopSrc(ac, whiteNoise(ac));
      var hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3800;
      var gs = ac.createGain(); gs.gain.value = 0.12;

      var bodyGain = ac.createGain(); bodyGain.gain.value = 0.0001;
      var churn = ac.createGain(); churn.gain.value = 0.85;

      pink.connect(bp1); bp1.connect(g1); g1.connect(bodyGain);
      pink.connect(bp2); bp2.connect(g2); g2.connect(bodyGain);
      pink.connect(bp3); bp3.connect(g3); g3.connect(bodyGain);
      white.connect(hp); hp.connect(gs); gs.connect(bodyGain);
      bodyGain.connect(churn);
      churn.connect(master);

      var lfo = ac.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 6.4;
      var lfoGain = ac.createGain(); lfoGain.gain.value = 0.15;
      lfo.connect(lfoGain); lfoGain.connect(churn.gain); lfo.start();

      waterVoice = { body: bodyGain, churn: churn, bp1: bp1, bp2: bp2, bp3: bp3, g3: g3, gs: gs, lfo: lfo };

      var fPink = loopSrc(ac, pinkNoise(ac));
      var flp = ac.createBiquadFilter(); flp.type = 'lowpass'; flp.frequency.value = 1400;
      var fGain = ac.createGain(); fGain.gain.value = 0.0001;
      fPink.connect(flp); flp.connect(fGain); fGain.connect(master);
      foamVoice = { gain: fGain, lp: flp };
    } catch (e) { ac = null; }
  }

  function updateWaterSound() {
    if (!ac || !waterVoice) return;
    var t = ac.currentTime;
    var target = waterOn ? (0.055 + waterSpeed * 0.085) : 0.0001;
    var bright = 0.55 + waterSpeed * 0.75 + (1 - waterLeft) * 0.7;

    waterVoice.body.gain.cancelScheduledValues(t);
    waterVoice.body.gain.setTargetAtTime(target, t, waterOn ? 0.03 : 0.08);
    waterVoice.churn.gain.setTargetAtTime(waterOn ? 0.85 : 0.0, t, waterOn ? 0.03 : 0.05);

    waterVoice.bp1.frequency.setTargetAtTime(560 * bright, t, 0.06);
    waterVoice.bp2.frequency.setTargetAtTime(1500 * bright, t, 0.06);
    waterVoice.bp3.frequency.setTargetAtTime(3000 * bright, t, 0.06);

    var dry = 1 - waterLeft;
    waterVoice.g3.gain.setTargetAtTime(0.18 + dry * 0.5, t, 0.1);
    waterVoice.gs.gain.setTargetAtTime(0.10 + dry * 0.34, t, 0.1);
    waterVoice.lfo.frequency.setTargetAtTime(5 + waterSpeed * 9 + dry * 6, t, 0.15);

    if (foamVoice) {
      foamVoice.gain.gain.setTargetAtTime(
        (waterOn && foamToolOn) ? (0.05 + waterSpeed * 0.06) : 0.0001, t, 0.05
      );
      foamVoice.lp.frequency.setTargetAtTime(1100 + waterSpeed * 900, t, 0.06);
    }
  }

  function setWater(on, speed, left, isFoam) {
    var wasOn = waterOn;
    waterOn = !!on;
    waterSpeed = speed || 0;
    waterLeft = (left == null) ? 1 : left;
    foamToolOn = !!isFoam;
    if (wasOn !== waterOn || waterOn) updateWaterSound();
  }

  function impactTick(strength) {
    if (!ac || !audioOn) return;
    var t = ac.currentTime;
    var s = ac.createBufferSource();
    s.buffer = whiteNoise(ac);
    s.playbackRate.value = 1.4 + Math.random() * 0.8;
    var bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400 + Math.random() * 2600;
    bp.Q.value = 1.6 + Math.random() * 2;
    var g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05 * (strength || 1), t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07 + Math.random() * 0.05);
    s.connect(bp); bp.connect(g); g.connect(master);
    s.start(t, Math.random() * 1.5, 0.12);
    s.stop(t + 0.15);
  }

  function drip() {
    if (!ac || !audioOn) return;
    var t = ac.currentTime;
    var o = ac.createOscillator();
    o.type = 'sine';
    var f0 = 900 + Math.random() * 1100;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.09);
    var g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.14);
  }

  function chime() {
    if (!ac || !audioOn) return;
    var notes = [523.25, 659.25, 783.99, 1046.5];
    for (var i = 0; i < notes.length; i++) {
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine';
      o.frequency.value = notes[i];
      var t = ac.currentTime + i * 0.075;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.14, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 0.55);
    }
  }

  function blip(freq) {
    if (!ac || !audioOn) return;
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = 'triangle';
    o.frequency.value = freq || 660;
    var t = ac.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.10, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.2);
  }

  function vibrate(p) {
    try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {}
  }

  function setAudioEnabled(on) {
    audioOn = !!on;
    if (master && ac) {
      master.gain.setTargetAtTime(audioOn ? 0.9 : 0.0001, ac.currentTime, 0.05);
    }
    if (!audioOn) { waterOn = false; updateWaterSound(); }
    try { localStorage.setItem('chongyichong.audio', audioOn ? '1' : '0'); } catch (e) {}
  }

  /* ---------------- 清洁进度采样 ---------------- */
  var CELL_N = 48 * 48;
  var BASE_SOFT = new Uint8Array(CELL_N);
  var BASE_HEAVY = new Uint8Array(CELL_N);
  var baseSoftSum = 1, baseHeavySum = 1;

  function readProbeCv(canvas) {
    var sw = bounds.w * DPR, sh = bounds.h * DPR;
    if (sw < 2 || sh < 2) return null;
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.clearRect(0, 0, 48, 48);
    pctx.drawImage(canvas, bounds.x * DPR, bounds.y * DPR, sw, sh, 0, 0, 48, 48);
    return pctx.getImageData(0, 0, 48, 48).data;
  }

  function fillBase(canvas, out) {
    var d = readProbeCv(canvas);
    var sum = 0;
    for (var i = 0; i < CELL_N; i++) {
      var a = d ? d[i * 4 + 3] : 0;
      out[i] = a > 40 ? a : 0;
      sum += out[i];
    }
    return sum > 0 ? sum : 1;
  }

  function captureBaseline() {
    baseSoftSum = fillBase(dirtCv, BASE_SOFT);
    baseHeavySum = fillBase(heavyCv, BASE_HEAVY);
  }

  function remainMass(canvas, base) {
    var d = readProbeCv(canvas);
    if (!d) return 0;
    var rem = 0;
    for (var i = 0; i < CELL_N; i++) {
      var b = base[i];
      if (!b) continue;
      var a = d[i * 4 + 3];
      rem += a < b ? a : b;
    }
    return rem;
  }

  function sampleCleaned() {
    var totalBase = baseSoftSum + baseHeavySum;
    if (totalBase <= 1) return 0;
    var remSoft = remainMass(dirtCv, BASE_SOFT);
    var remHeavy = remainMass(heavyCv, BASE_HEAVY);
    heavyLeftFrac = baseHeavySum > 1 ? clamp(remHeavy / baseHeavySum, 0, 1) : 0;
    return clamp(1 - (remSoft + remHeavy) / totalBase, 0, 1);
  }

  function updateProgress() {
    var d = sampleCleaned();
    var tasks = grease.length + paintSpots.length;
    var partProg;

    if (!tasks) {
      partProg = d;
    } else {
      var done = (grease.length - crustsLeft() + paintSpots.length - paintLeft()) / tasks;
      partProg = clamp(d * 0.85 + done * 0.15, 0, 1);
    }

    progress = clamp((partDone + partProg) / partTotal, 0, 1);
    return d;
  }

  /* ---------------- 密度噪声 / 遮罩 ---------------- */
  function noiseMask(w, h, cellsLo, cellsHi, lo, hi) {
    var c = document.createElement('canvas');
    c.width = Math.max(2, Math.round(w));
    c.height = Math.max(2, Math.round(h));
    var g = c.getContext('2d');

    function octave(cells) {
      var n = document.createElement('canvas');
      n.width = Math.max(2, cells);
      n.height = Math.max(2, Math.round(cells * c.height / c.width));
      var ng = n.getContext('2d');
      var img = ng.createImageData(n.width, n.height);
      for (var i = 0; i < img.data.length; i += 4) {
        var v = Math.random() * 255;
        img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
      }
      ng.putImageData(img, 0, 0);
      return n;
    }

    g.imageSmoothingEnabled = true;
    try { g.imageSmoothingQuality = 'high'; } catch (e) {}
    g.drawImage(octave(cellsLo), 0, 0, c.width, c.height);

    var hi2 = octave(cellsHi);
    var t = document.createElement('canvas');
    t.width = c.width; t.height = c.height;
    var tg = t.getContext('2d');
    tg.imageSmoothingEnabled = true;
    try { tg.imageSmoothingQuality = 'high'; } catch (e) {}
    tg.drawImage(hi2, 0, 0, c.width, c.height);

    g.globalCompositeOperation = 'multiply';
    g.drawImage(t, 0, 0);
    g.globalCompositeOperation = 'source-over';

    var d = g.getImageData(0, 0, c.width, c.height);
    var p = d.data;
    for (var j = 0; j < p.length; j += 4) {
      var a = p[j] / 255;
      a = a * a * (3 - 2 * a);
      a = Math.pow(a, 0.6);
      p[j + 3] = Math.round((lo + (hi - lo) * a) * 255);
    }
    g.putImageData(d, 0, 0);
    return c;
  }

  function applyDensityMask(c, b, lo, hi) {
    var m = noiseMask(b.w * DPR, b.h * DPR, 8, 26, lo, hi);
    c.save();
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(m, b.x, b.y, b.w, b.h);
    c.restore();
  }

  /** 只保留物体内部的像素：优先用加固过的车身遮罩 */
  function maskToObject(c, b) {
    c.save();
    c.globalCompositeOperation = 'destination-in';
    if (maskCv) {
      c.drawImage(maskCv, 0, 0, W, H);
    } else {
      c.beginPath();
      level.art.silhouette(c, b);
      c.fillStyle = '#ffffff';
      c.fill();
    }
    c.restore();
  }

  /* ---------------- 厚泥 ---------------- */
  function bakeHeavy() {
    hctx.setTransform(1, 0, 0, 1, 0, 0);
    hctx.clearRect(0, 0, heavyCv.width, heavyCv.height);
    hctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    var cfg = level.heavy;
    if (!cfg) return;

    var b = bounds, i, k;

    hctx.save();

    hctx.fillStyle = 'rgba(52,34,22,0.90)';
    hctx.fillRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12);

    var htex = tintedTex('dirt_heavy', 'rgba(96,62,38,0.74)');
    if (htex) {
      var hw = htex.width, hh = htex.height;
      var hs = Math.round(20 * (cfg.density || 1));
      for (i = 0; i < hs; i++) {
        var hp = [b.x + Math.random() * b.w, b.y + Math.random() * b.h];
        var k2 = (b.w * (0.2 + Math.random() * 0.3)) / hw;
        var dw2 = hw * k2, dh2 = hh * k2;
        hctx.save();
        hctx.translate(hp[0], hp[1]);
        hctx.rotate(Math.random() * TAU);
        hctx.globalAlpha = 0.55 + Math.random() * 0.45;
        hctx.drawImage(htex, -dw2 / 2, -dh2 / 2, dw2, dh2);
        hctx.restore();
      }
      hctx.globalAlpha = 1;
    }

    var pal = ['rgba(44,28,18,0.95)', 'rgba(70,46,28,0.92)', 'rgba(32,20,12,0.96)', 'rgba(92,62,38,0.86)'];
    var count = Math.round(34 * (cfg.density || 1));
    for (i = 0; i < count; i++) {
      var cx = b.x + Math.random() * b.w;
      var cy = b.y + Math.random() * b.h;
      var rx = b.w * 0.04 + Math.random() * b.w * 0.10;
      var ry = rx * (0.5 + Math.random() * 0.8);
      hctx.save();
      hctx.translate(cx, cy);
      hctx.rotate(Math.random() * Math.PI);

      hctx.beginPath();
      hctx.ellipse(0, 0, rx * 1.10, ry * 1.10, 0, 0, TAU);
      hctx.fillStyle = 'rgba(178,140,98,0.30)';
      hctx.fill();

      hctx.beginPath();
      hctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
      hctx.fillStyle = pal[i % pal.length];
      hctx.fill();
      hctx.restore();
    }

    hctx.strokeStyle = 'rgba(198,162,120,0.40)';
    hctx.lineWidth = 1.4;
    for (i = 0; i < 24; i++) {
      var sx = b.x + Math.random() * b.w;
      var sy = b.y + Math.random() * b.h;
      var px = sx, py = sy;
      hctx.beginPath();
      hctx.moveTo(px, py);
      for (k = 0; k < 3; k++) {
        px += rand(-26, 26);
        py += rand(-20, 20);
        hctx.lineTo(px, py);
      }
      hctx.stroke();
    }

    hctx.restore();

    applyRegionMask(hctx, b);
    applyDensityMask(hctx, b, 0.58, 1.0);
    maskToObject(hctx, b);
  }

  function eraseHeavy(x, y, r, strength) {
    hctx.save();
    hctx.globalCompositeOperation = 'destination-out';
    var g = hctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,' + strength + ')');
    g.addColorStop(0.6, 'rgba(0,0,0,' + strength + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    hctx.fillStyle = g;
    hctx.beginPath();
    hctx.arc(x, y, r, 0, TAU);
    hctx.fill();
    hctx.restore();
  }

  /* ---------------- 硬垢 / 掉漆 ---------------- */
  function makeGrease() {
    grease = [];
    var list = level.grease || [];
    for (var i = 0; i < list.length; i++) {
      grease.push({
        x: bounds.x + bounds.w * list[i][0],
        y: bounds.y + bounds.h * list[i][1],
        r: Math.max(20, bounds.w * list[i][2] * 1.2),
        hp: 1
      });
    }
  }

  function crustsLeft() {
    var n = 0;
    for (var i = 0; i < grease.length; i++) if (grease[i].hp > 0) n++;
    return n;
  }

  function makePaint() {
    paintSpots = [];
    var want = (level.paint || []).length;
    for (var i = 0; i < want; i++) {
      if (i < grease.length) {
        var g = grease[i];
        paintSpots.push({
          x: g.x + (Math.random() - 0.5) * g.r * 0.28,
          y: g.y + (Math.random() - 0.5) * g.r * 0.28,
          r: Math.max(12, g.r * (0.66 + Math.random() * 0.24)),
          hp: 1,
          revealed: false,
          src: i
        });
      } else {
        paintSpots.push({
          x: bounds.x + bounds.w * (0.25 + Math.random() * 0.5),
          y: bounds.y + bounds.h * (0.45 + Math.random() * 0.3),
          r: Math.max(14, bounds.w * 0.05),
          hp: 1,
          revealed: true,
          src: -1
        });
      }
    }
  }

  function paintLeft() {
    var n = 0;
    for (var i = 0; i < paintSpots.length; i++) if (paintSpots[i].hp > 0) n++;
    return n;
  }

  function paintShown() {
    var n = 0;
    for (var i = 0; i < paintSpots.length; i++) {
      if (paintSpots[i].hp > 0 && paintSpots[i].revealed) n++;
    }
    return n;
  }

  function revealPaintUnder(greaseIndex) {
    for (var i = 0; i < paintSpots.length; i++) {
      var s = paintSpots[i];
      if (s.src !== greaseIndex || s.revealed) continue;
      s.revealed = true;
      toast('刮掉硬垢，底下漆伤了 · 用「补漆」');
      blip(720);
      vibrate(20);
    }
  }

  /* ---------------- 冲洗 ---------------- */
  function eraseAt(x, y, r, strength) {
    dctx.save();
    dctx.globalCompositeOperation = 'destination-out';
    var g = dctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,' + strength + ')');
    g.addColorStop(0.55, 'rgba(0,0,0,' + strength + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    dctx.fillStyle = g;
    dctx.beginPath();
    dctx.arc(x, y, r, 0, TAU);
    dctx.fill();
    dctx.restore();
  }

  function addFoam(x, y, r) {
    foamDots.push({ x: x, y: y, r: r * 1.15, hp: 1 });
    if (foamDots.length > 220) foamDots.splice(0, foamDots.length - 220);
  }

  function foamBoostAt(x, y, r) {
    var best = 0;
    for (var i = 0; i < foamDots.length; i++) {
      var f = foamDots[i];
      if (f.hp <= best) continue;
      var dx = f.x - x, dy = f.y - y;
      if (dx * dx + dy * dy < (r * 1.1) * (r * 1.1)) best = f.hp;
    }
    return 1 + FOAM_BOOST * best;
  }

  function rinseFoam(x, y, r) {
    for (var i = foamDots.length - 1; i >= 0; i--) {
      var f = foamDots[i];
      var dx = f.x - x, dy = f.y - y;
      if (dx * dx + dy * dy < r * r) {
        f.hp -= 0.42;
        if (f.hp <= 0) foamDots.splice(i, 1);
      }
    }
  }

  function drawFoam() {
    for (var i = 0; i < foamDots.length; i++) {
      var f = foamDots[i];
      var a = clamp(f.hp, 0, 1);
      ctx.fillStyle = 'rgba(214,238,255,' + (0.20 * a).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 1.32, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(238,249,255,' + (0.46 * a).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 1.02, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,' + (0.72 * a).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.66, 0, TAU); ctx.fill();
    }
  }

  function toast(msg) {
    if (toastT > 0.8 && toastMsg === msg) return;
    toastMsg = msg;
    toastT = 2.2;
  }

  function spawnImpact(x, y) {
    var i;
    var jet = Math.atan2(y - H * 0.97, x - W * 0.87);
    for (i = 0; i < 3; i++) {
      var a = jet + rand(-1.0, 1.0);
      var sp = rand(40, 185);
      parts.push({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        life: rand(0.22, 0.46), max: 0.46,
        size: rand(1, 2.8), col: '234,247,255', g: 520
      });
    }
    if (Math.random() < 0.55) {
      var a2 = jet + rand(-0.8, 0.8);
      var sp2 = rand(55, 220);
      parts.push({
        x: x, y: y,
        vx: Math.cos(a2) * sp2, vy: Math.sin(a2) * sp2 - 55,
        life: rand(0.28, 0.58), max: 0.58,
        size: rand(1.4, 3.8), col: '104,84,60', g: 760
      });
    }
    if (parts.length > 420) parts.splice(0, parts.length - 420);
  }

  function spawnScrape(x, y) {
    for (var i = 0; i < 2; i++) {
      var a = rand(-Math.PI, 0) + (Math.random() < 0.5 ? -0.6 : 0.6);
      var sp = rand(60, 200);
      parts.push({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
        life: rand(0.18, 0.36), max: 0.36,
        size: rand(1, 2.6),
        col: Math.random() < 0.5 ? '120,104,86' : '210,200,186',
        g: 900
      });
    }
    if (parts.length > 420) parts.splice(0, parts.length - 420);
  }

  function spawnPaintMist(x, y) {
    for (var i = 0; i < 2; i++) {
      var a = rand(0, TAU);
      var sp = rand(20, 95);
      parts.push({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
        life: rand(0.2, 0.42), max: 0.42,
        size: rand(1, 2.4), col: '206,210,216', g: 320
      });
    }
    if (parts.length > 420) parts.splice(0, parts.length - 420);
  }

  function updateParts(dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.g * dt;
      p.life -= dt;
      if (p.life <= 0) parts.splice(i, 1);
    }
  }

  function drawParts() {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var a = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = 'rgba(' + p.col + ',' + (a * 0.85).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    }
  }

  function sprayStep(dt) {
    var r = brushRadius();
    var alpha = eraseAlpha();
    var cap = stampSteps() + 1;

    var d = Math.hypot(pointer.x - lastX, pointer.y - lastY);
    var n = clamp(Math.ceil(d / (r * 0.45)) + 1, 1, cap);

    if (tool === 'foam') {
      if (foam > 0) {
        foam = Math.max(0, foam - FOAM_RATE * dt);
        for (var fi = 1; fi <= n; fi++) {
          var fk = fi / n;
          var fx = lastX + (pointer.x - lastX) * fk;
          var fy = lastY + (pointer.y - lastY) * fk;
          eraseHeavy(fx, fy, r, 0.5);
          addFoam(fx, fy, r);
        }
      }
    } else if (tool === 'rinse') {
      for (var i = 1; i <= n; i++) {
        var k = i / n;
        var px = lastX + (pointer.x - lastX) * k + rand(-1.5, 1.5);
        var py = lastY + (pointer.y - lastY) * k + rand(-1.5, 1.5);
        var boost = foamBoostAt(px, py, r);
        eraseAt(px, py, r, Math.min(0.95, alpha * boost));
        rinseFoam(px, py, r);
      }
      spawnImpact(pointer.x, pointer.y);

      if (heavyHintCd <= 0 && alphaAt(heavyCv, pointer.x, pointer.y) > 0.25) {
        toast('这层厚泥冲不掉，先打「泡沫」');
        heavyHintCd = 3.2;
      }
    } else if (tool === 'scrape') {
      spawnScrape(pointer.x, pointer.y);
    } else {
      spawnPaintMist(pointer.x, pointer.y);
    }

    var power = greasePower();
    for (var g = 0; g < grease.length; g++) {
      var gr = grease[g];
      if (gr.hp <= 0) continue;
      if (Math.hypot(pointer.x - gr.x, pointer.y - gr.y) < gr.r) {
        if (tool === 'scrape') {
          var was = gr.hp;
          gr.hp = Math.max(0, gr.hp - dt * power);
          if (was > 0 && gr.hp === 0) {
            blip(1240);
            vibrate(22);
            revealPaintUnder(g);
          }
        } else if (tool === 'rinse') {
          toast('硬垢要换「刮刀」');
        }
      }
    }

    for (var p = 0; p < paintSpots.length; p++) {
      var ps = paintSpots[p];
      if (ps.hp <= 0) continue;
      if (Math.hypot(pointer.x - ps.x, pointer.y - ps.y) < ps.r * 1.1) {
        if (tool === 'paint') {
          var pw = ps.hp;
          ps.hp = Math.max(0, ps.hp - dt * 1.8);
          if (pw > 0 && ps.hp === 0) { blip(1480); vibrate(25); }
        } else if ((tool === 'rinse' || tool === 'scrape') && ps.revealed) {
          toast('掉漆了，用「补漆」');
        }
      }
    }

    lastX = pointer.x;
    lastY = pointer.y;
    if (firstSpray) { firstSpray = false; startRecording(); }
  }

  function setTool(t) {
    if (tool === t) return;
    tool = t;
    blip(t === 'scrape' ? 420 : t === 'foam' ? 820 : 620);
    vibrate(10);

    if (t === 'foam') {
      toast(heavyLeftFrac > 0.03 ? '泡沫用来软化深色厚泥，软化后再冲洗' : '这单没有厚泥，泡沫用不上');
    } else if (t === 'scrape') {
      toast(crustsLeft() > 0 ? '刮刀对付黑色硬垢，水冲不掉' : '这单没有硬垢，刮刀用不上');
    } else if (t === 'paint') {
      toast(paintShown() > 0 ? '补漆修复刮开硬垢后露出的掉漆' : '这单没有掉漆，补漆用不上');
    }
  }

  /* ---------------- 场景 ---------------- */
  var grainPat = null;

  function makeGrain() {
    var n = 96;
    grainCv = document.createElement('canvas');
    grainCv.width = n; grainCv.height = n;
    var g = grainCv.getContext('2d');
    var img = g.createImageData(n, n);
    for (var i = 0; i < n * n; i++) {
      var v = 128 + (Math.random() - 0.5) * 80;
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 9;
    }
    g.putImageData(img, 0, 0);
  }

  function drawAmbientSky() {
    var t = performance.now() / 1000;
    var gy = H * level.groundY;

    ctx.save();
    for (var i = 0; i < 3; i++) {
      var speed = 7 + i * 4;
      var span = W + 320;
      var cx = ((t * speed + i * 260) % span) - 160;
      var cy = gy * (0.13 + i * 0.12);
      var rw = 86 + i * 26;
      var rh = rw * 0.34;
      var a = 0.10 + i * 0.02;

      var cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rw);
      cg.addColorStop(0, 'rgba(255,255,255,' + a.toFixed(3) + ')');
      cg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rw, rh * 1.5, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    var sweep = (Math.sin(t / 9) * 0.5 + 0.5);
    ctx.save();
    var lg = ctx.createLinearGradient(-W * 0.3 + sweep * W * 1.4, 0,
      W * 0.1 + sweep * W * 1.4, H * 0.85);
    lg.addColorStop(0, 'rgba(255,248,226,0)');
    lg.addColorStop(0.5, 'rgba(255,248,226,0.10)');
    lg.addColorStop(1, 'rgba(255,248,226,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, W, H * 0.9);
    ctx.restore();
  }

  function drawBackdrop() {
    var sky = level.sky, gr = level.ground;
    var gy = H * level.groundY;

    var bg = imgOf(level.bg);
    if (bg) {
      var sc = Math.max(W / imgW(bg), H / imgH(bg));
      var dw = imgW(bg) * sc, dh = imgH(bg) * sc;
      ctx.drawImage(bg, (W - dw) / 2, (H - dh) / 2, dw, dh);
      drawAmbientSky();
      return;
    }

    var g = ctx.createLinearGradient(0, 0, 0, gy + 60);
    g.addColorStop(0, sky[0]);
    g.addColorStop(0.62, sky[1]);
    g.addColorStop(1, mixHex(sky[1], gr[0], 0.45));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    var sun = ctx.createRadialGradient(W * 0.74, gy * 0.30, 0, W * 0.74, gy * 0.30, W * 1.05);
    sun.addColorStop(0, 'rgba(255,250,232,0.52)');
    sun.addColorStop(0.45, 'rgba(255,250,232,0.14)');
    sun.addColorStop(1, 'rgba(255,250,232,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.40)';
    for (var ci = 0; ci < 3; ci++) {
      var cxx = W * (0.14 + ci * 0.34) + Math.sin(ci * 2.1) * 16;
      var cyy = gy * (0.15 + ci * 0.10);
      var rw = W * (0.12 + ci * 0.025);
      ctx.beginPath();
      ctx.ellipse(cxx, cyy, rw, rw * 0.40, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cxx + rw * 0.52, cyy + rw * 0.07, rw * 0.62, rw * 0.30, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    ctx.fillStyle = mixHex(gr[0], '#2b4a56', 0.46);
    ctx.beginPath();
    ctx.moveTo(-30, gy - 18);
    ctx.quadraticCurveTo(W * 0.20, gy - 88, W * 0.46, gy - 34);
    ctx.quadraticCurveTo(W * 0.70, gy - 2, W + 30, gy - 56);
    ctx.lineTo(W + 30, H);
    ctx.lineTo(-30, H);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = mixHex(gr[0], '#2b4a56', 0.22);
    ctx.beginPath();
    ctx.moveTo(-30, gy + 12);
    ctx.quadraticCurveTo(W * 0.30, gy - 44, W * 0.62, gy + 6);
    ctx.quadraticCurveTo(W * 0.85, gy + 34, W + 30, gy - 8);
    ctx.lineTo(W + 30, H);
    ctx.lineTo(-30, H);
    ctx.closePath();
    ctx.fill();

    var gg = ctx.createLinearGradient(0, gy, 0, H);
    gg.addColorStop(0, gr[0]);
    gg.addColorStop(1, gr[1]);
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.moveTo(0, gy + 14);
    ctx.quadraticCurveTo(W * 0.5, gy - 12, W, gy + 14);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();

    var haze = ctx.createLinearGradient(0, gy - 40, 0, gy + 26);
    haze.addColorStop(0, 'rgba(255,255,255,0)');
    haze.addColorStop(0.7, 'rgba(255,255,255,0.16)');
    haze.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, gy - 40, W, 66);
  }

  function drawPaintDamage() {
    for (var i = 0; i < paintSpots.length; i++) {
      var s = paintSpots[i];
      if (s.hp <= 0) continue;
      var g = ctx.createRadialGradient(s.x, s.y, s.r * 0.15, s.x, s.y, s.r);
      g.addColorStop(0, 'rgba(182,184,188,' + (0.96 * s.hp).toFixed(3) + ')');
      g.addColorStop(0.62, 'rgba(150,152,158,' + (0.88 * s.hp).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(150,152,158,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = 'rgba(96,98,104,' + (0.55 * s.hp).toFixed(3) + ')';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * 0.5, 0.4, 2.3);
      ctx.stroke();
    }
  }

  function drawScene() {
    drawBackdrop();

    var b = bounds;
    var gx = b.x + b.w * 0.5;
    var gy2 = b.y + b.h * 0.985;

    var halo = ctx.createRadialGradient(gx, b.y + b.h * 0.42, b.w * 0.15, gx, b.y + b.h * 0.42, b.w * 0.78);
    halo.addColorStop(0, 'rgba(255,252,238,0.20)');
    halo.addColorStop(1, 'rgba(255,252,238,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.ellipse(gx, b.y + b.h * 0.42, b.w * 0.78, b.h * 0.8, 0, 0, TAU);
    ctx.fill();

    var sh1 = ctx.createRadialGradient(gx, gy2, 0, gx, gy2, b.w * 0.52);
    sh1.addColorStop(0, 'rgba(22,46,30,0.34)');
    sh1.addColorStop(0.5, 'rgba(22,46,30,0.16)');
    sh1.addColorStop(1, 'rgba(22,46,30,0)');
    ctx.fillStyle = sh1;
    ctx.beginPath();
    ctx.ellipse(gx, gy2, b.w * 0.52, b.h * 0.095, 0, 0, TAU);
    ctx.fill();

    ctx.drawImage(cleanCv, 0, 0, W, H);
    drawPaintDamage();
    ctx.drawImage(dirtCv, 0, 0, W, H);
    ctx.drawImage(heavyCv, 0, 0, W, H);

    for (var i = 0; i < grease.length; i++) {
      var s = grease[i];
      if (s.hp <= 0) continue;
      var sp = greaseSprites[i];
      if (sp) {
        ctx.save();
        ctx.globalAlpha = clamp(s.hp, 0, 1);
        ctx.drawImage(sp.cv, sp.x, sp.y, sp.r * 2, sp.r * 2);
        ctx.restore();
      } else {
        var rg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
        rg.addColorStop(0, 'rgba(58,46,34,' + (0.88 * s.hp).toFixed(3) + ')');
        rg.addColorStop(0.55, 'rgba(80,64,46,' + (0.74 * s.hp).toFixed(3) + ')');
        rg.addColorStop(1, 'rgba(80,64,46,0)');
        ctx.fillStyle = rg;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
      }

      var specX = s.x - s.r * 0.26, specY = s.y - s.r * 0.28, specR = s.r * 0.38;
      var sg = ctx.createRadialGradient(specX, specY, 0, specX, specY, specR);
      sg.addColorStop(0, 'rgba(255,255,255,' + (0.42 * s.hp).toFixed(3) + ')');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(specX, specY, specR, 0, TAU); ctx.fill();
    }
  }

  function drawGroundGrass() {
    var t = performance.now() / 1000;
    var gy = H * level.groundY;

    ctx.save();
    ctx.lineCap = 'round';
    for (var i = 0; i < 30; i++) {
      var x = ((i * 83) % 100) / 100 * W + Math.sin(i * 1.7) * 9;
      var baseY = gy + 24 + ((i * 47) % 100) / 100 * (H - gy - 150);
      var hgt = 10 + (i % 4) * 6;
      var sway = Math.sin(t * 1.5 + i * 0.7) * (3 + (i % 3));
      var fade = ((baseY - gy) / Math.max(1, H - gy));
      var alpha = (0.16 + fade * 0.22).toFixed(3);

      ctx.strokeStyle = 'rgba(28,74,50,' + alpha + ')';
      ctx.lineWidth = 1.6 + fade * 1.4;
      ctx.beginPath();
      ctx.moveTo(x, baseY);
      ctx.quadraticCurveTo(x - hgt * 0.25 + sway * 0.5, baseY - hgt * 0.6, x + sway, baseY - hgt);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x + 4, baseY);
      ctx.quadraticCurveTo(x + 4 + sway * 0.5, baseY - hgt * 0.45, x + 6 + sway * 1.3, baseY - hgt * 0.75);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawForeground() {
    var g = ctx.createLinearGradient(0, H * 0.52, 0, H);
    g.addColorStop(0, 'rgba(16,44,32,0)');
    g.addColorStop(1, 'rgba(16,44,32,0.26)');
    ctx.fillStyle = g;
    ctx.fillRect(0, H * 0.52, W, H * 0.48);

    ctx.save();
    ctx.fillStyle = 'rgba(13,38,28,0.34)';
    var clusters = [
      [[-20, H * 0.66], [26, H * 0.74], [-6, H * 0.82], [40, H * 0.88]],
      [[W + 20, H * 0.62], [W - 26, H * 0.72], [W + 6, H * 0.80], [W - 42, H * 0.87]]
    ];
    for (var ci = 0; ci < clusters.length; ci++) {
      var cl = clusters[ci];
      for (var j = 0; j < cl.length; j++) {
        var px = cl[j][0], py = cl[j][1];
        var rx = 44 + (j % 3) * 16;
        var ry = rx * 0.72;
        ctx.beginPath();
        ctx.ellipse(px, py, rx, ry, 0, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawGrade() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,214,170,0.09)');
    g.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(120,160,210,0.11)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    if (grainCv) {
      ctx.save();
      ctx.globalAlpha = 0.28;
      if (!grainPat) grainPat = ctx.createPattern(grainCv, 'repeat');
      ctx.fillStyle = grainPat;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    var v = ctx.createRadialGradient(W * 0.5, H * 0.46, H * 0.28, W * 0.5, H * 0.5, H * 0.82);
    v.addColorStop(0, 'rgba(10,22,34,0)');
    v.addColorStop(1, 'rgba(10,22,34,0.18)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  /* ---------------- 订单装配 ---------------- */
  function buildThumbs() {
    thumbs = {};
    for (var i = 0; i < order.fleet.length; i++) {
      var lv = NS.LEVEL_INDEX[order.fleet[i]];
      if (!lv) continue;
      var tw = 200;
      var th = Math.max(48, Math.round(tw * (lv.bounds.h * H) / (lv.bounds.w * W)));
      var c = document.createElement('canvas');
      c.width = tw * 2;
      c.height = th * 2;
      var g = c.getContext('2d');
      g.setTransform(2, 0, 0, 2, 0, 0);
      try { lv.art.paint(g, { x: 0, y: 0, w: tw, h: th }); } catch (e) {}
      thumbs[i] = { cv: c, w: tw, h: th };
    }
  }

  function startOrder(lv) {
    order = lv;
    var idx = LEVELS.indexOf(lv);
    levelIndex = idx < 0 ? 0 : idx;
    partTotal = lv.fleet ? lv.fleet.length : 1;
    partDone = 0;
    orderWaterMax = Math.round((lv.water || 120) * WATER_BONUS);
    water = orderWaterMax;
    waterMax = orderWaterMax;

    if (lv.fleet) {
      pickOptions = [];
      for (var i = 0; i < lv.fleet.length; i++) pickOptions.push(i);
      buildThumbs();
      state = 'pick';
      buttons = [];
    } else {
      pickOptions = [];
      loadPart(0, null);
    }
  }

  function loadPart(i, carry) {
    partIdx = i;
    level = order.fleet ? (NS.LEVEL_INDEX[order.fleet[i]] || order) : order;
    configureLevel();
    waterMax = orderWaterMax;
    water = (carry != null && isFinite(carry)) ? carry : orderWaterMax;
  }

  function choosePart(idx) {
    var pos = pickOptions.indexOf(idx);
    if (pos < 0) return;
    pickOptions.splice(pos, 1);
    blip(700);
    loadPart(idx, water);
  }

  function startLevel(i) {
    startOrder(LEVELS[clamp(i, 0, LEVELS.length - 1)]);
  }

  function nextLevel() {
    if (levelIndex + 1 >= LEVELS.length) { startOrder(order); return; }
    startLevel(levelIndex + 1);
  }

  /* ---------------- 结算 ---------------- */
  function starCount() {
    if (zen) return 0;
    if (finishReason === 'dry') return 0;
    var left = waterMax > 0 ? water / waterMax : 0;
    if (left >= 0.25) return 3;
    if (left >= 0.08) return 2;
    return 1;
  }

  function finishNow(reason) {
    finishReason = reason || 'complete';

    if (reason === 'complete' && pickOptions.length > 0) {
      partDone++;
      water = Math.min(orderWaterMax, water + orderWaterMax * 0.15);
      blip(920);
      vibrate([0, 18, 40]);
      state = 'pick';
      buttons = [];
      return;
    }

    state = 'done';
    doneAt = performance.now();
    elapsed = (doneAt - startTime) / 1000;
    finalWater = water;
    finalProgress = reason === 'dry' ? progress : 1;
    setWater(false);
    stopRecording();
    vibrate([0, 30, 60, 30]);
    pointer.down = false;

    var stars = starCount();
    if (reason === 'dry') blip(240);
    else chime();

    if (zen) {
      lastGain = 0; coinShown = 0; coinTarget = 0;
      shineT = 0;
      lastXP = 0; levelUpTo = 0;
      return;
    }

    var first = !save.best[order.id];
    var gain;
    if (reason === 'dry') gain = Math.round(15 + finalProgress * 60);
    else gain = 40 + stars * 25;
    if (first) gain *= 2;

    save.best[order.id] = Math.max(save.best[order.id] || 0, stars);
    save.coins += gain;
    if (stars > 0 && levelIndex >= save.idx) {
      save.idx = Math.min(LEVELS.length - 1, levelIndex + 1);
    }

    var xpGain = reason === 'dry'
      ? Math.round(8 + finalProgress * 18)
      : Math.round(22 + stars * 16);
    if (first) xpGain = Math.round(xpGain * 1.5);

    var beforeLv = save.level;
    save.xp += xpGain;
    var guard = 0;
    while (save.xp >= xpForNext(save.level) && save.level < 99 && guard++ < 50) {
      save.xp -= xpForNext(save.level);
      save.level++;
    }
    levelUpTo = save.level > beforeLv ? save.level : 0;

    if (reason !== 'dry') {
      save.washes++;
      refreshDaily();
      save.daily.n++;
    }

    persist();
    syncRank();

    lastGain = gain;
    lastXP = xpGain;
    coinShown = 0;
    coinTarget = gain;
    shineT = 0;
  }

  /* ---------------- 更新 ---------------- */
  function update(dt) {
    if (AUTO) {
      autoT += dt;
      if (autoT > 0.9 && state === 'play') {
        var at = autoT - 0.9;
        pointer.down = true;
        pointer.x = bounds.x + bounds.w * (0.5 + 0.44 * Math.sin(at * 1.6));
        pointer.y = bounds.y + bounds.h * (0.5 + 0.44 * Math.sin(at * 2.7 + 1.1));
        if (firstSpray) firstSpray = false;
      }
    }

    if (state === 'play' && dryT > 0) {
      dryT -= dt;
      pointer.down = false;
      setWater(false);
      if (dryT <= 0) { dryT = 0; finishNow('dry'); }
    }

    if (state === 'play' && !finishing && dryT <= 0) {
      if (pointer.down) {
        var pdx = pointer.x - lastX, pdy = pointer.y - lastY;
        var spd = Math.min(1, Math.hypot(pdx, pdy) / 24);

        if (tool === 'rinse') {
          waterSpent += WATER_RATE * dt;
          water = Math.max(0, water - WATER_RATE * dt);
        }
        sprayStep(dt);
        setWater(tool === 'rinse' || tool === 'foam', spd,
          zen ? 1 : (waterMax > 0 ? water / waterMax : 1),
          tool === 'foam');

        if (tool !== 'scrape' && Math.random() < 0.16 + spd * 0.3) {
          impactTick(0.6 + spd * 0.8);
        }
        if (Math.random() < 0.035) drip();

        if (tool === 'foam' && foam <= 0) {
          tool = 'rinse';
          blip(400);
        }
        if (tool === 'rinse' && water <= 0) {
          dryT = 0.9;
          pointer.down = false;
          setWater(false);
          blip(300);
        }
      } else {
        setWater(false);
        lastX = pointer.x;
        lastY = pointer.y;
      }

      sampleTimer += dt;
      if (sampleTimer > 0.11) {
        sampleTimer = 0;
        var d = updateProgress();
        updateGloss();
        if (d >= 0.94 && crustsLeft() === 0 && paintLeft() === 0) finishing = true;
      }
    }

    if (finishing) {
      finishT = Math.min(1, finishT + dt / 1.0);
      dctx.save();
      dctx.globalCompositeOperation = 'destination-out';
      dctx.globalAlpha = 0.18 + 0.34 * finishT;
      dctx.fillRect(0, 0, W, H);
      dctx.restore();

      for (var gi = 0; gi < grease.length; gi++) {
        grease[gi].hp = Math.max(0, grease[gi].hp - dt * 1.8);
      }

      progress = clamp((partDone + 1) / partTotal, 0, 1);
      if (finishT >= 1 && state === 'play') {
        finishNow('complete');
      }
    }

    if (state === 'done' || state === 'upgrade') {
      shineT = Math.min(1, shineT + dt * 1.6);
      coinShown = lerp(coinShown, coinTarget, 1 - Math.pow(0.002, dt));
      if (Math.abs(coinShown - coinTarget) < 0.5) coinShown = coinTarget;
    }
    if (buyFlash > 0) buyFlash = Math.max(0, buyFlash - dt * 2.2);

    updateParts(dt);
    progShown = lerp(progShown, progress, 1 - Math.pow(0.001, dt));
    if (toastT > 0) toastT -= dt;
    if (heavyHintCd > 0) heavyHintCd -= dt;

    for (var fd = foamDots.length - 1; fd >= 0; fd--) {
      foamDots[fd].hp -= dt * 0.22;
      if (foamDots[fd].hp <= 0) foamDots.splice(fd, 1);
    }
  }

  function bakeDirt() {
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.clearRect(0, 0, dirtCv.width, dirtCv.height);
    dctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    var b = bounds;
    var cfg = level.dirt;
    var rec = cfg.recipe;
    var density = cfg.density || 0.8;
    var i;

    dctx.save();

    // 有纹理贴图就用贴图去"盖"，没有就程序化生成
    var tex = imgOf(cfg.tex || rec.tex);

    // 区域化脏污：同一张图只脏某个部位，就能变成一个新关卡
    var regs = (cfg.regions && cfg.regions.length) ? cfg.regions : null;
    if (regs) {
      dctx.beginPath();
      for (var ri = 0; ri < regs.length; ri++) {
        var RG = regs[ri];
        dctx.rect(b.x + b.w * RG[0], b.y + b.h * RG[1], b.w * RG[2], b.h * RG[3]);
      }
      dctx.clip();
    }

    function pickPoint() {
      if (!regs) return [b.x + Math.random() * b.w, b.y + Math.random() * b.h];
      var total = 0, i;
      for (i = 0; i < regs.length; i++) total += regs[i][2] * regs[i][3];
      var t = Math.random() * total;
      for (i = 0; i < regs.length; i++) {
        var ar = regs[i][2] * regs[i][3];
        if (t <= ar || i === regs.length - 1) {
          var R = regs[i];
          return [b.x + b.w * (R[0] + Math.random() * R[2]),
            b.y + b.h * (R[1] + Math.random() * R[3])];
        }
        t -= ar;
      }
      return [b.x + b.w * 0.5, b.y + b.h * 0.5];
    }

    // 底膜不再是一整片均匀色：用斜向渐变，让上下厚薄不同
    var filmG = dctx.createLinearGradient(b.x, b.y, b.x + b.w * 0.4, b.y + b.h);
    filmG.addColorStop(0, fadeOf(rec.film));
    filmG.addColorStop(0.45, rec.film);
    filmG.addColorStop(1, rec.film);
    dctx.fillStyle = filmG;
    dctx.fillRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12);

    if (tex) {
      // 用"柔边版"贴图：边缘 alpha 渐变到 0，盖多少张都不会出现方块边界
      var stampTex = softTex(rec.tex || 'dirt_soft') || tex;
      var tw = imgW(stampTex);
      var th = imgH(stampTex);
      var tiers = [
        { rel: 0.46, n: 12, a0: 0.22, a1: 0.44 },  // 大块：只铺底色起伏
        { rel: 0.22, n: 30, a0: 0.28, a1: 0.58 },  // 中块：主体
        { rel: 0.090, n: 68, a0: 0.34, a1: 0.72 }  // 碎点：细节
      ];
      for (var t2 = 0; t2 < tiers.length; t2++) {
        var tr = tiers[t2];
        var n2 = Math.round(tr.n * density);
        for (i = 0; i < n2; i++) {
          var tp = pickPoint();
          var scale = (b.w * tr.rel * (0.7 + Math.random() * 0.6)) / tw;
          var dw = tw * scale, dh = th * scale;
          dctx.save();
          dctx.translate(tp[0], tp[1]);
          dctx.rotate(Math.random() * TAU);
          // 随机镜像 + 竖向压扁，同一张图也能盖出不同形状
          dctx.scale((Math.random() < 0.5 ? -1 : 1) * (0.85 + Math.random() * 0.3),
            0.55 + Math.random() * 0.9);
          dctx.globalAlpha = tr.a0 + Math.random() * (tr.a1 - tr.a0);
          dctx.drawImage(stampTex, -dw / 2, -dh / 2, dw, dh);
          dctx.restore();
        }
      }
      dctx.globalAlpha = 1;
    }

    // 大块污渍（没有纹理时靠这个撑起脏感）
    var count = tex ? Math.round(10 * density) : Math.round(46 * density);
    for (i = 0; i < count; i++) {
      var pt = pickPoint();
      var cx = pt[0], cy = pt[1];
      var rx = b.w * 0.025 + Math.random() * b.w * 0.085;
      var ry = rx * (0.45 + Math.random() * 0.95);
      var col = rec.palette[(i * 7 + 3) % rec.palette.length];

      dctx.save();
      dctx.translate(cx, cy);
      dctx.rotate(Math.random() * Math.PI);

      if (rec.soft) {
        // 一层深色虚边，让污渍有厚度，不像一块平涂
        var rg0 = dctx.createRadialGradient(0, 0, rx * 0.55, 0, 0, rx * 1.12);
        rg0.addColorStop(0, 'rgba(38,28,18,0.16)');
        rg0.addColorStop(1, 'rgba(38,28,18,0)');
        dctx.fillStyle = rg0;
        dctx.beginPath();
        dctx.ellipse(0, 0, rx * 1.12, ry * 1.12, 0, 0, TAU);
        dctx.fill();

        var rg = dctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        rg.addColorStop(0, col);
        rg.addColorStop(0.62, col);
        rg.addColorStop(1, fadeOf(col));
        dctx.fillStyle = rg;
      } else {
        dctx.fillStyle = col;
      }
      dctx.beginPath();
      dctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
      dctx.fill();
      dctx.restore();
    }

    // 泥点
    var specks = Math.round((cfg.specks || 160) * density);
    for (i = 0; i < specks; i++) {
      var sp = pickPoint();
      dctx.beginPath();
      dctx.arc(sp[0], sp[1], 0.6 + Math.random() * 2.8, 0, TAU);
      dctx.fillStyle = rec.palette[(i * 5 + 1) % rec.palette.length];
      dctx.fill();
    }

    // 流挂
    var streaks = Math.round((cfg.streaks || 10) * density);
    for (i = 0; i < streaks; i++) {
      var sk = pickPoint();
      var gx = sk[0];
      var gy = sk[1];
      var gh = b.h * (0.1 + Math.random() * 0.36);
      var base = rec.palette[i % rec.palette.length];
      var lg = dctx.createLinearGradient(0, gy, 0, gy + gh);
      lg.addColorStop(0, base);
      lg.addColorStop(1, fadeOf(base));
      dctx.fillStyle = lg;
      dctx.fillRect(gx - 1.6, gy, 3.2, gh);
    }

    dctx.restore();

    // 用噪声把密度打散，破掉「一整片平涂」的感觉
    applyDensityMask(dctx, b, 0.48, 1.0);
    maskToObject(dctx, b);
    applyCoverMask(dctx, b);
  }

  /** 车身遮罩：位图 alpha 加固后作为"污渍只能长在车上"的裁剪依据 */
  var maskCv = null;

  function buildBodyMask() {
    var im = imgOf(level.art.img);
    if (!im) { maskCv = null; return; }
    var c = document.createElement('canvas');
    c.width = cv.width; c.height = cv.height;
    var m = c.getContext('2d');
    // 画布是设备分辨率，必须按 DPR 缩放后再用 CSS 坐标绘制，否则遮罩会小一半并偏到左上
    m.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (!drawArt(m, bounds, level.art.img)) { maskCv = null; return; }

    // 键色抠像会留下低 alpha 散点（模型输出是 JPEG 压缩的，背景全是绿色噪声），
    // 不清零的话污渍会顺着散点长到车外的天空和草地上。
    try {
      var d = m.getImageData(0, 0, c.width, c.height);
      var p = d.data;
      for (var i = 3; i < p.length; i += 4) {
        var a = p[i];
        p[i] = a < 60 ? 0 : Math.min(255, a * 1.4);
      }
      m.putImageData(d, 0, 0);
    } catch (e) {}

    maskCv = c;
  }

  /** 覆盖范围遮罩：前几关只脏一块区域，不是全车 */
  var coverMaskCv = null;

  function buildCoverMask() {
    coverMaskCv = null;
    var cov = (level.dirt && level.dirt.cover != null) ? level.dirt.cover : 1;
    if (cov >= 0.98) return;

    var w = Math.max(2, Math.round(bounds.w * DPR));
    var h = Math.max(2, Math.round(bounds.h * DPR));
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var m = c.getContext('2d');

    var n = Math.round(2 + cov * 6);
    for (var i = 0; i < n; i++) {
      var cx = w * (0.10 + Math.random() * 0.80);
      var cy = h * (0.12 + Math.random() * 0.76);
      var base = Math.min(w, h) * (0.20 + Math.random() * 0.22);
      var r = base * (0.75 + cov * 0.85);
      var gr = m.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.58, 'rgba(255,255,255,1)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      m.fillStyle = gr;
      m.beginPath();
      m.arc(cx, cy, r, 0, Math.PI * 2);
      m.fill();
    }
    coverMaskCv = c;
  }

  function applyCoverMask(c, b) {
    if (!coverMaskCv) return;
    c.save();
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(coverMaskCv, b.x, b.y, b.w, b.h);
    c.restore();
  }

  /** 区域羽化遮罩：厚泥的区域边界从硬矩形变成渐变过渡 */
  var regionMaskCv = null;

  function buildRegionMask() {
    regionMaskCv = null;
    var cfg = level.heavy;
    if (!cfg || !cfg.region || !cfg.region.length) return;

    var c = document.createElement('canvas');
    c.width = Math.max(2, Math.round(bounds.w * DPR));
    c.height = Math.max(2, Math.round(bounds.h * DPR));
    var m = c.getContext('2d');
    var f = Math.min(c.width, c.height) * 0.18;

    for (var i = 0; i < cfg.region.length; i++) {
      var R = cfg.region[i];
      var x = R[0] * c.width, y = R[1] * c.height;
      var w = R[2] * c.width, h = R[3] * c.height;

      m.fillStyle = '#ffffff';
      m.fillRect(x, y, w, h);

      // 四边各挖一条渐变带：边缘 alpha 从 1 渐变到 0
      m.globalCompositeOperation = 'destination-out';
      var tg = m.createLinearGradient(0, y, 0, y + f);
      tg.addColorStop(0, 'rgba(0,0,0,1)'); tg.addColorStop(1, 'rgba(0,0,0,0)');
      m.fillStyle = tg; m.fillRect(x, y, w, f);
      var bg2 = m.createLinearGradient(0, y + h, 0, y + h - f);
      bg2.addColorStop(0, 'rgba(0,0,0,1)'); bg2.addColorStop(1, 'rgba(0,0,0,0)');
      m.fillStyle = bg2; m.fillRect(x, y + h - f, w, f);
      var lg = m.createLinearGradient(x, 0, x + f, 0);
      lg.addColorStop(0, 'rgba(0,0,0,1)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
      m.fillStyle = lg; m.fillRect(x, y, f, h);
      var rg2 = m.createLinearGradient(x + w, 0, x + w - f, 0);
      rg2.addColorStop(0, 'rgba(0,0,0,1)'); rg2.addColorStop(1, 'rgba(0,0,0,0)');
      m.fillStyle = rg2; m.fillRect(x + w - f, y, f, h);
      m.globalCompositeOperation = 'source-over';
    }
    regionMaskCv = c;
  }

  function applyRegionMask(c, b) {
    if (!regionMaskCv) return;
    c.save();
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(regionMaskCv, b.x, b.y, b.w, b.h);
    c.restore();
  }

  /** 硬垢精灵：预先裁到车身，绘制时只随 hp 淡出 —— 永远不会溢出车身 */
  var greaseSprites = [];

  function bakeGreaseSprites() {
    greaseSprites = [];
    if (!maskCv) return;
    for (var i = 0; i < grease.length; i++) {
      var s = grease[i];
      if (s.hp <= 0) continue;
      var sp = greaseSprites[i];
      if (sp) {
        // 预先裁到车身的精灵，随 hp 淡出 —— 硬垢永远不会溢出车身
        ctx.save();
        ctx.globalAlpha = clamp(s.hp, 0, 1);
        ctx.drawImage(sp.cv, sp.x, sp.y, sp.r * 2, sp.r * 2);
        ctx.restore();
      } else {
        var rg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
        rg.addColorStop(0, 'rgba(58,46,34,' + (0.88 * s.hp).toFixed(3) + ')');
        rg.addColorStop(0.55, 'rgba(80,64,46,' + (0.74 * s.hp).toFixed(3) + ')');
        rg.addColorStop(1, 'rgba(80,64,46,0)');
        ctx.fillStyle = rg;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
      }

      // 硬垢的高光点（很小，居中在垢上）
      var specX = s.x - s.r * 0.26, specY = s.y - s.r * 0.28, specR = s.r * 0.38;
      var sg = ctx.createRadialGradient(specX, specY, 0, specX, specY, specR);
      sg.addColorStop(0, 'rgba(255,255,255,' + (0.42 * s.hp).toFixed(3) + ')');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(specX, specY, specR, 0, TAU); ctx.fill();
    }
  }

  /** 选中工具时，把"这把工具能处理的目标"点亮 —— 让工具和污渍的对应关系不用记 */
  function drawToolHighlight() {
    if (state !== 'play' || finishing) return;
    var pulse = 0.55 + 0.45 * Math.sin(performance.now() / 300);

    if (tool === 'foam' && heavyLeftFrac > 0.02) {
      tctx.setTransform(1, 0, 0, 1, 0, 0);
      tctx.clearRect(0, 0, tintCv.width, tintCv.height);

      // 先画一圈投影光晕，再把内部挖掉 —— 只留外缘发光，不给物体染色
      tctx.save();
      tctx.shadowColor = 'rgba(120,228,255,' + (0.55 + 0.30 * pulse).toFixed(3) + ')';
      tctx.shadowBlur = 16 * DPR;
      tctx.shadowOffsetX = 0;
      tctx.shadowOffsetY = 0;
      tctx.drawImage(heavyCv, 0, 0);
      tctx.restore();

      tctx.globalCompositeOperation = 'destination-out';
      tctx.drawImage(heavyCv, 0, 0);
      tctx.globalCompositeOperation = 'source-over';

      ctx.drawImage(tintCv, 0, 0, W, H);
    }

    var i;
    if (tool === 'scrape') {
      for (i = 0; i < grease.length; i++) {
        var g = grease[i];
        if (g.hp <= 0) continue;
        ctx.save();
        ctx.strokeStyle = 'rgba(255,186,92,' + (0.55 + 0.35 * pulse).toFixed(3) + ')';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(g.x, g.y, g.r * 1.02, 0, TAU); ctx.stroke();
        ctx.restore();
      }
    }

    if (tool === 'paint') {
      for (i = 0; i < paintSpots.length; i++) {
        var s = paintSpots[i];
        if (s.hp <= 0) continue;
        ctx.save();
        ctx.strokeStyle = 'rgba(158,138,255,' + (0.6 + 0.35 * pulse).toFixed(3) + ')';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 1.08, 0, TAU); ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawShine() {
    if (shineT <= 0) return;
    var b = bounds;
    ctx.save();
    ctx.beginPath();
    level.art.silhouette(ctx, b);
    ctx.clip();
    var sweep = -1 + shineT * 3;
    var g = ctx.createLinearGradient(b.x + b.w * sweep, b.y, b.x + b.w * (sweep + 0.55), b.y + b.h);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.45, 'rgba(255,255,255,' + (0.55 * (1 - Math.abs(shineT - 0.5) * 1.4)).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.restore();
  }

  function nozzleColor() {
    var lv = save.up.pressure;
    return ['#5a6577', '#4f7fa8', '#3f9fc0', '#2fb7a0', '#2fc46a'][lv - 1];
  }

  function drawWater() {
    if (!pointer.down || state !== 'play' || finishing) return;

    // 刮刀不是水枪：只画一个金属环 + 火星，没有水柱
    if (tool === 'scrape') {
      var sr = brushRadius();
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(pointer.x, pointer.y, sr * 0.62, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,206,140,0.85)';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(pointer.x, pointer.y, sr * 0.5, 0, TAU); ctx.stroke();
      ctx.restore();
      return;
    }

    var nx = W * 0.90, ny = H - 108;
    var px = pointer.x, py = pointer.y;
    var midX = (nx + px) * 0.5 + 18;
    var midY = Math.min(ny, py) - 90;
    var r = brushRadius();

    // 水快没了，水流跟着变细
    var wl = waterMax > 0 ? water / waterMax : 1;
    var thin = wl < 0.25 ? (0.55 + 0.45 * (wl / 0.25)) : 1;
    var isFoam = tool === 'foam';
    var tt = performance.now() / 1000;

    // 沿贝塞尔生成一条带抖动的水带（比直线像多了）
    function jetRibbon(width, alpha, color, wob, phase) {
      var mx = (nx + px) * 0.5 + 20;
      var my = Math.min(ny, py) - 70;
      var N = 16, left = [], right = [], i;
      for (i = 0; i <= N; i++) {
        var t = i / N;
        var bx = (1 - t) * (1 - t) * nx + 2 * (1 - t) * t * mx + t * t * px;
        var by = (1 - t) * (1 - t) * ny + 2 * (1 - t) * t * my + t * t * py;
        var dx = 2 * (1 - t) * (mx - nx) + 2 * t * (px - mx);
        var dy = 2 * (1 - t) * (my - ny) + 2 * t * (py - my);
        var len = Math.hypot(dx, dy) || 1;
        var nxv = -dy / len, nyv = dx / len;
        var w = width * (1 - 0.6 * t) *
          (0.82 + 0.18 * Math.sin(tt * 17 + i * 1.5 + phase));
        var off = Math.sin(tt * 8 + i * 0.85 + phase) * wob;
        left.push([bx + nxv * (w + off), by + nyv * (w + off)]);
        right.push([bx - nxv * (w + off), by - nyv * (w + off)]);
      }
      ctx.beginPath();
      ctx.moveTo(left[0][0], left[0][1]);
      for (i = 1; i < left.length; i++) ctx.lineTo(left[i][0], left[i][1]);
      for (i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }

    ctx.save();

    // 三层水带：外层雾 → 中层 → 亮芯
    if (isFoam) {
      jetRibbon(32 * thin, 0.30, 'rgba(236,248,255,0.30)', 3, 0);
      jetRibbon(19 * thin, 0.55, 'rgba(255,255,255,0.55)', 2, 1.7);
      jetRibbon(10 * thin, 0.92, 'rgba(255,255,255,0.92)', 1.2, 3.1);
    } else {
      jetRibbon(26 * thin, 0.26, 'rgba(150,208,246,0.26)', 3.4, 0);
      jetRibbon(15 * thin, 0.52, 'rgba(206,238,255,0.52)', 2.2, 1.7);
      jetRibbon(6 * thin, 0.95, 'rgba(255,255,255,0.95)', 1.1, 3.1);
    }

    // 顺流的小水珠
    for (var q = 0; q < 5; q++) {
      var qt = ((tt * 2.4 + q * 0.21) % 1);
      var qx = (1 - qt) * (1 - qt) * nx + 2 * (1 - qt) * qt * ((nx + px) * 0.5 + 20) + qt * qt * px;
      var qy = (1 - qt) * (1 - qt) * ny + 2 * (1 - qt) * qt * (Math.min(ny, py) - 95) + qt * qt * py;
      var qr = (1 - qt) * 3.2 * thin + 0.8;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.5 * (1 - qt) + 0.1).toFixed(2) + ')';
      ctx.beginPath();
      ctx.arc(qx + rand(-4, 4), qy + rand(-4, 4), qr, 0, TAU);
      ctx.fill();
    }

    // 冲击点：光斑 + 两圈扩散环
    var r = brushRadius();
    var ig = ctx.createRadialGradient(px, py, 0, px, py, r * 1.3);
    ig.addColorStop(0, isFoam ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.46)');
    ig.addColorStop(0.42, isFoam ? 'rgba(240,250,255,0.26)' : 'rgba(206,238,255,0.22)');
    ig.addColorStop(1, 'rgba(206,238,255,0)');
    ctx.fillStyle = ig;
    ctx.beginPath(); ctx.arc(px, py, r * 1.3, 0, TAU); ctx.fill();

    for (var rg = 0; rg < 2; rg++) {
      var rt = ((tt * 2.2 + rg * 0.5) % 1);
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.34 * (1 - rt)).toFixed(3) + ')';
      ctx.lineWidth = 2.2 * (1 - rt) + 0.6;
      ctx.beginPath();
      ctx.ellipse(px, py, r * (0.45 + rt * 1.1), r * (0.3 + rt * 0.75), 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    // 水枪（随水压等级变色变粗）
    var lv = save.up.pressure;
    var ang = Math.atan2(ny - py, nx - px);
    ctx.save();
    ctx.translate(nx, ny);
    ctx.rotate(ang);
    ctx.fillStyle = '#3b4655';
    ctx.beginPath(); rr(ctx, -6 - lv, -22, 12 + lv * 2, 70, 5); ctx.fill();
    ctx.fillStyle = nozzleColor();
    ctx.beginPath(); rr(ctx, -4 - lv * 0.5, -14, 8 + lv, 20, 3); ctx.fill();
    ctx.restore();
  }

  /** 工具图标：全部用矢量画，不额外占资源 */
  function drawToolIcon(id, x, y, s, col) {
    ctx.save();
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 1.9;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (id === 'rinse') {
      // 水滴
      ctx.beginPath();
      ctx.moveTo(x, y - s * 0.52);
      ctx.bezierCurveTo(x + s * 0.40, y - s * 0.02, x + s * 0.34, y + s * 0.50, x, y + s * 0.50);
      ctx.bezierCurveTo(x - s * 0.34, y + s * 0.50, x - s * 0.40, y - s * 0.02, x, y - s * 0.52);
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(x - s * 0.10, y + s * 0.14, s * 0.09, 0, TAU);
      ctx.fill();
    } else if (id === 'foam') {
      // 三个泡
      ctx.beginPath(); ctx.arc(x - s * 0.16, y + s * 0.10, s * 0.30, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + s * 0.22, y - s * 0.12, s * 0.38, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(x - s * 0.02, y - s * 0.34, s * 0.16, 0, TAU); ctx.stroke();
    } else if (id === 'scrape') {
      // 斜刀片 + 手柄
      ctx.beginPath();
      ctx.moveTo(x - s * 0.46, y + s * 0.10);
      ctx.lineTo(x + s * 0.18, y + s * 0.10);
      ctx.lineTo(x + s * 0.34, y - s * 0.20);
      ctx.lineTo(x - s * 0.30, y - s * 0.20);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + s * 0.36, y - s * 0.16);
      ctx.lineTo(x + s * 0.52, y + s * 0.02);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - s * 0.40, y + s * 0.42);
      ctx.lineTo(x + s * 0.26, y + s * 0.42);
      ctx.stroke();
    } else {
      // 补漆：喷罐 + 喷点
      ctx.beginPath();
      rr(ctx, x - s * 0.30, y - s * 0.18, s * 0.46, s * 0.66, s * 0.10);
      ctx.stroke();
      ctx.beginPath();
      rr(ctx, x - s * 0.18, y - s * 0.40, s * 0.22, s * 0.20, s * 0.06);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + s * 0.34, y - s * 0.34, s * 0.07, 0, TAU); ctx.fill();
      ctx.beginPath();
      ctx.arc(x + s * 0.50, y - s * 0.16, s * 0.055, 0, TAU); ctx.fill();
      ctx.beginPath();
      ctx.arc(x + s * 0.38, y - s * 0.02, s * 0.045, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawHUD() {
    var pct = Math.round(progShown * 100);
    var wl = waterMax > 0 ? water / waterMax : 0;
    var low = wl < 0.25;

    // 顶部柔光遮罩
    var scrim = ctx.createLinearGradient(0, 0, 0, 132 + SAFE_TOP);
    scrim.addColorStop(0, 'rgba(12,30,44,0.28)');
    scrim.addColorStop(0.62, 'rgba(12,30,44,0.10)');
    scrim.addColorStop(1, 'rgba(12,30,44,0)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, W, 132 + SAFE_TOP);

    // ---- 玻璃信息卡 ----
    var cardX = 14, cardY = 12 + SAFE_TOP, cardW = W - 28, cardH = 96;
    ctx.save();
    ctx.shadowColor = 'rgba(10,26,40,0.20)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;
    var cardBg = ctx.createLinearGradient(0, cardY, 0, cardY + cardH);
    cardBg.addColorStop(0, 'rgba(255,255,255,0.30)');
    cardBg.addColorStop(1, 'rgba(255,255,255,0.13)');
    ctx.fillStyle = cardBg;
    ctx.beginPath(); rr(ctx, cardX, cardY, cardW, cardH, 22); ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(255,255,255,0.36)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    rr(ctx, cardX + 0.6, cardY + 0.6, cardW - 1.2, cardH - 1.2, 21.4);
    ctx.stroke();

    ctx.save();
    ctx.textBaseline = 'middle';

    // 左上：等级 + 单号
    ctx.textAlign = 'left';
    ctx.font = '600 10px ' + FONT;
    ctx.fillStyle = 'rgba(255,255,255,0.66)';
    ctx.fillText(
      'Lv.' + save.level + '  ·  第 ' + (levelIndex + 1) + '/' + LEVELS.length + ' 单' +
      (partTotal > 1 ? ' · ' + (partIdx + 1) + '/' + partTotal + ' 辆' : ''),
      cardX + 18, cardY + 21
    );

    // 右上：今日进度
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.66)';
    ctx.fillText(
      '今日 ' + save.daily.n + '/' + DAILY_GOAL + (save.daily.n >= DAILY_GOAL ? ' ✓' : ''),
      cardX + cardW - 18, cardY + 21
    );
    ctx.textAlign = 'left';

    // 左下：车名
    ctx.font = '700 17px ' + FONT;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(level.name, cardX + 18, cardY + 43);

    // 右上：大百分比
    ctx.textAlign = 'right';
    ctx.font = '800 26px ' + FONT;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(pct + '%', cardX + cardW - 18, cardY + 42);

    // 清洁度主条
    var pbX = cardX + 18, pbW = cardW - 36, pbY = cardY + 60, pbH = 9;
    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    ctx.beginPath(); rr(ctx, pbX, pbY, pbW, pbH, pbH / 2); ctx.fill();

    var fw = Math.max(pbH, pbW * progShown);
    var pg = ctx.createLinearGradient(pbX, 0, pbX + pbW, 0);
    pg.addColorStop(0, '#8af3c6');
    pg.addColorStop(1, '#1fae82');
    ctx.fillStyle = pg;
    ctx.beginPath(); rr(ctx, pbX, pbY, fw, pbH, pbH / 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); rr(ctx, pbX + 2, pbY + 1.5, Math.max(5, fw - 4), 3, 1.5); ctx.fill();

    // 水量细条（带水滴和星级刻度）
    if (!zen) {
      var wy = cardY + 78, wh = 5;
      ctx.fillStyle = low ? '#f0a95e' : '#8dd3f7';
      var dx = cardX + 21, dy = wy + wh / 2;
      ctx.beginPath();
      ctx.moveTo(dx, dy - 5);
      ctx.bezierCurveTo(dx + 4, dy - 1, dx + 3.2, dy + 4, dx, dy + 4);
      ctx.bezierCurveTo(dx - 3.2, dy + 4, dx - 4, dy - 1, dx, dy - 5);
      ctx.fill();

      var wbx = cardX + 31, wbw = cardW - 49;
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); rr(ctx, wbx, wy, wbw, wh, wh / 2); ctx.fill();

      var ww = Math.max(wh, wbw * wl);
      var wgd = ctx.createLinearGradient(wbx, 0, wbx + wbw, 0);
      if (low) { wgd.addColorStop(0, '#ffc98c'); wgd.addColorStop(1, '#e8853a'); }
      else { wgd.addColorStop(0, '#a9e0ff'); wgd.addColorStop(1, '#41a3dd'); }
      ctx.fillStyle = wgd;
      ctx.beginPath(); rr(ctx, wbx, wy, ww, wh, wh / 2); ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1;
      var marks = [0.25, 0.08];
      for (var mi = 0; mi < marks.length; mi++) {
        var mx = wbx + wbw * marks[mi];
        ctx.beginPath();
        ctx.moveTo(mx, wy - 2);
        ctx.lineTo(mx, wy + wh + 2);
        ctx.stroke();
      }
    } else {
      ctx.font = '600 11px ' + FONT;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.textAlign = 'right';
      ctx.fillText('禅模式', cardX + cardW - 18, cardY + 80);
    }
    ctx.restore();


    // 断水提示
    if (dryT > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(dryT / 0.9, 0, 1);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#b8551a';
      ctx.font = '700 18px ' + FONT;
      ctx.fillText('水用完了', W / 2, H * 0.5);
      ctx.restore();
    }

    if (firstSpray && state === 'play') {
      var a = 0.55 + 0.35 * Math.sin(performance.now() / 360);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#123c4d';
      ctx.font = '500 15px ' + FONT;
      ctx.fillText('按住屏幕，冲掉污渍', W / 2, H - 124);
      ctx.restore();
    }

    if (state === 'play' && !finishing && dryT <= 0 && progress > 0.9 && water > 0 && crustsLeft() === 0) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(18,60,77,0.55)';
      ctx.font = '500 13px ' + FONT;
      ctx.fillText('快好了，再冲一下', W / 2, H - 124);
      ctx.restore();
    }

    // 还差什么没处理
    if (state === 'play' && !finishing && (heavyLeftFrac > 0.06 || crustsLeft() > 0 || paintLeft() > 0)) {
      var need = [];
      if (heavyLeftFrac > 0.06) need.push('厚泥 · 泡沫');
      if (crustsLeft() > 0) need.push(crustsLeft() + ' 处硬垢 · 刮刀');
      if (paintShown() > 0) need.push(paintShown() + ' 处掉漆 · 补漆');
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#a8641b';
      ctx.font = '600 13px ' + FONT;
      ctx.fillText('还差 ' + need.join('  /  '), W / 2, H - 146);
      ctx.restore();
    }

    // 用错工具的提示
    if (toastT > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(toastT, 0, 1);
      ctx.font = '600 15px ' + FONT;
      var toastW = ctx.measureText(toastMsg).width + 34;
      ctx.fillStyle = 'rgba(28,36,46,0.80)';
      ctx.beginPath(); rr(ctx, W / 2 - toastW / 2, H - 182, toastW, 34, 17); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(toastMsg, W / 2, H - 165);
      ctx.restore();
    }

    // 音效开关（常驻小圆钮，压在工具栏左上方）
    if (state === 'play' && dryT <= 0) {
      var abx = 16, aby = H - 130, abs = 32, acx = abx + abs / 2, acy = aby + abs / 2;
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.76)';
      ctx.beginPath(); ctx.arc(acx, acy, abs / 2, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(24,54,74,0.16)';
      ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(acx, acy, abs / 2 - 0.6, 0, TAU); ctx.stroke();

      ctx.fillStyle = audioOn ? '#3d5a72' : '#b04a3a';
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineCap = 'round';
      // 喇叭主体
      ctx.beginPath();
      ctx.moveTo(acx - 7, acy - 3);
      ctx.lineTo(acx - 3, acy - 3);
      ctx.lineTo(acx + 2, acy - 7.5);
      ctx.lineTo(acx + 2, acy + 7.5);
      ctx.lineTo(acx - 3, acy + 3);
      ctx.lineTo(acx - 7, acy + 3);
      ctx.closePath();
      ctx.fill();
      if (audioOn) {
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(acx + 2, acy, 5, -0.9, 0.9); ctx.stroke();
        ctx.beginPath(); ctx.arc(acx + 2, acy, 9, -0.8, 0.8); ctx.stroke();
      } else {
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(acx + 6, acy - 6);
        ctx.lineTo(acx + 12, acy + 6);
        ctx.stroke();
      }
      ctx.restore();
      buttons.push({
        x: abx, y: aby, w: abs, h: abs,
        onClick: function () { setAudioEnabled(!audioOn); }
      });

      // 重来：随时重开当前这一单
      var rbx = abx + abs + 10, rby = aby, rbs = abs;
      var rcx = rbx + rbs / 2, rcy = rby + rbs / 2;
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.76)';
      ctx.beginPath(); ctx.arc(rcx, rcy, rbs / 2, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(24,54,74,0.16)';
      ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(rcx, rcy, rbs / 2 - 0.6, 0, TAU); ctx.stroke();

      // 循环箭头
      var ra0 = -Math.PI * 0.35, ra1 = Math.PI * 1.35, rrad = 7.4;
      ctx.strokeStyle = '#4a6a80';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(rcx, rcy, rrad, ra0, ra1);
      ctx.stroke();

      // 箭头三角
      var ex = rcx + rrad * Math.cos(ra1), ey = rcy + rrad * Math.sin(ra1);
      var tx = -Math.sin(ra1), ty = Math.cos(ra1);
      var nx = Math.cos(ra1), ny = Math.sin(ra1);
      ctx.fillStyle = '#4a6a80';
      ctx.beginPath();
      ctx.moveTo(ex + tx * 4.8, ey + ty * 4.8);
      ctx.lineTo(ex + nx * 3.4, ey + ny * 3.4);
      ctx.lineTo(ex - nx * 3.4, ey - ny * 3.4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      buttons.push({
        x: rbx, y: rby, w: rbs, h: rbs,
        onClick: function () { restartLevel(); }
      });
    }

    // 工具条
    if (state === 'play' && !finishing && dryT <= 0) {
      var tools = [
        { id: 'rinse', label: '冲洗', on: '#3d93d6' },
        { id: 'foam', label: '泡沫', on: '#3aa8c4' },
        { id: 'scrape', label: '刮刀', on: '#c98a3a' },
        { id: 'paint', label: '补漆', on: '#7d6fd0' }
      ];
      var barX = 14, barW = W - 28, barH = 76, barY = H - 92;
      var segW = barW / 4;

      // 底座
      ctx.save();
      ctx.shadowColor = 'rgba(10,26,40,0.24)';
      ctx.shadowBlur = 20;
      ctx.shadowOffsetY = 8;
      var barBg = ctx.createLinearGradient(0, barY, 0, barY + barH);
      barBg.addColorStop(0, 'rgba(255,255,255,0.96)');
      barBg.addColorStop(1, 'rgba(240,247,252,0.96)');
      ctx.fillStyle = barBg;
      ctx.beginPath(); rr(ctx, barX, barY, barW, barH, 24); ctx.fill();
      ctx.restore();

      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); rr(ctx, barX + 0.6, barY + 0.6, barW - 1.2, barH - 1.2, 23.4); ctx.stroke();

      for (var ti = 0; ti < tools.length; ti++) {
        var tl = tools[ti];
        var sx = barX + ti * segW;
        var cx = sx + segW / 2;
        var active = tool === tl.id;

        if (active) {
          ctx.save();
          ctx.shadowColor = tl.on + '88';
          ctx.shadowBlur = 14;
          ctx.shadowOffsetY = 4;
          var ag = ctx.createLinearGradient(0, barY + 8, 0, barY + barH - 8);
          ag.addColorStop(0, tl.on);
          ag.addColorStop(1, tl.on + 'dd');
          ctx.fillStyle = ag;
          ctx.beginPath(); rr(ctx, sx + 7, barY + 7, segW - 14, barH - 14, 18); ctx.fill();
          ctx.restore();
        }

        drawToolIcon(tl.id, cx, barY + 30, 20, active ? '#ffffff' : '#4a6a80');

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = (active ? '700 ' : '600 ') + '12px ' + FONT;
        ctx.fillStyle = active ? '#ffffff' : '#5d7488';
        ctx.fillText(tl.label, cx, barY + 58);

        buttons.push({
          x: sx, y: barY, w: segW, h: barH,
          onClick: (function (id) { return function () { setTool(id); }; })(tl.id)
        });
      }

      // 泡沫余量：贴在泡沫按钮顶部的一条细线
      if (tool === 'foam') {
        var fseg = barX + segW, fy = barY - 9;
        ctx.save();
        ctx.fillStyle = 'rgba(24,54,74,0.16)';
        ctx.beginPath(); rr(ctx, fseg + 10, fy, segW - 20, 5, 2.5); ctx.fill();
        ctx.fillStyle = '#6fd0ef';
        ctx.beginPath();
        rr(ctx, fseg + 10, fy, Math.max(5, (segW - 20) * foam / Math.max(1, foamMax)), 5, 2.5);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  /* ---- 结算 ---- */
  function drawDone() {
    var a = clamp((performance.now() - doneAt) / 280, 0, 1);
    if (a <= 0) return;

    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(10,22,34,0.42)';
    ctx.fillRect(0, 0, W, H);

    var cw = Math.min(W - 52, 320);
    var chh = 386;
    var cx = (W - cw) / 2;
    var cy = (H - chh) / 2 - 10;

    ctx.save();
    ctx.shadowColor = 'rgba(16,32,48,0.30)';
    ctx.shadowBlur = 32;
    ctx.shadowOffsetY = 14;
    var cardBg = ctx.createLinearGradient(0, cy, 0, cy + chh);
    cardBg.addColorStop(0, '#ffffff');
    cardBg.addColorStop(1, '#f2f7fb');
    ctx.fillStyle = cardBg;
    ctx.beginPath(); rr(ctx, cx, cy, cw, chh, 24); ctx.fill();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#182a3a';
    ctx.font = '700 23px ' + FONT;
    ctx.fillText(finishReason === 'dry' ? '水用完了 💧' : '洗好了 ✨', W / 2, cy + 50);

    var stars = starCount();
    var age = (performance.now() - doneAt) / 1000;

    if (!zen) for (var i = 0; i < 3; i++) {
      var sx = W / 2 + (i - 1) * 46, sy = cy + 100;

      ctx.save();
      ctx.translate(sx, sy);
      starPath(ctx, 0, 0, 17);
      ctx.fillStyle = '#e3e9f0';
      ctx.fill();
      ctx.restore();

      if (i < stars) {
        var t = clamp((age - 0.22 - i * 0.13) / 0.34, 0, 1);
        if (t > 0) {
          // 星星背后的一圈暖光
          var glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 30);
          glow.addColorStop(0, 'rgba(255,206,74,' + (0.55 * t).toFixed(3) + ')');
          glow.addColorStop(1, 'rgba(255,206,74,0)');
          ctx.fillStyle = glow;
          ctx.beginPath(); ctx.arc(sx, sy, 30, 0, TAU); ctx.fill();

          var sc = (1 + Math.sin(t * Math.PI) * 0.35) * t;
          ctx.save();
          ctx.translate(sx, sy);
          ctx.scale(sc, sc);
          starPath(ctx, 0, 0, 17);
          ctx.fillStyle = '#ffc53d';
          ctx.fill();
          ctx.restore();
        }
      }
    }

    ctx.fillStyle = '#7b8b9c';
    ctx.font = '500 14px ' + FONT;
    ctx.fillText(
      zen ? '禅模式 · 不计成绩'
        : finishReason === 'dry'
          ? '还差 ' + Math.round((1 - finalProgress) * 100) + '% 没洗完'
          : '剩水 ' + Math.round(finalWater / Math.max(1, waterMax) * 100) + '%',
      W / 2, cy + 142
    );

    // 金币 + 经验
    if (!zen) {
      var cp = coinTarget > 0 ? clamp(coinShown / coinTarget, 0, 1) : 1;
      ctx.font = '700 ' + (17 + 6 * (1 - cp)).toFixed(1) + 'px ' + FONT;
      ctx.fillStyle = '#e0a12a';
      ctx.fillText('💰 +' + Math.round(coinShown), W / 2 - 62, cy + 172);

      ctx.font = '700 16px ' + FONT;
      ctx.fillStyle = '#3f8fd0';
      ctx.fillText('✦ +' + lastXP, W / 2 + 66, cy + 172);

      // 等级经验条
      var need = xpForNext(save.level);
      var barW = 168, barX = W / 2 - barW / 2, barY = cy + 193, barH = 7;
      ctx.fillStyle = '#e6edf3';
      ctx.beginPath(); rr(ctx, barX, barY, barW, barH, barH / 2); ctx.fill();
      var lit = Math.max(barH, barW * clamp(save.xp / Math.max(1, need), 0, 1));
      var xg = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      xg.addColorStop(0, '#7ec8f5');
      xg.addColorStop(1, '#2f86c8');
      ctx.fillStyle = xg;
      ctx.beginPath(); rr(ctx, barX, barY, lit, barH, barH / 2); ctx.fill();

      ctx.font = '600 10px ' + FONT;
      ctx.fillStyle = '#8aa0b4';
      ctx.textAlign = 'left';
      ctx.fillText('Lv.' + save.level, barX - 32, barY + barH / 2);
      ctx.textAlign = 'right';
      ctx.fillText(save.xp + '/' + need, barX + barW + 40, barY + barH / 2);
      ctx.textAlign = 'center';
    }

    // 升级横幅
    if (levelUpTo && !zen) {
      var lg2 = ctx.createLinearGradient(0, cy - 18, 0, cy + 18);
      lg2.addColorStop(0, '#ffd76a');
      lg2.addColorStop(1, '#f0b21f');
      ctx.save();
      ctx.shadowColor = 'rgba(200,140,20,0.45)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 5;
      ctx.fillStyle = lg2;
      ctx.beginPath(); rr(ctx, W / 2 - 82, cy - 17, 164, 34, 17); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#6b4400';
      ctx.font = '800 15px ' + FONT;
      ctx.fillText('升级！ Lv.' + levelUpTo, W / 2, cy + 1);
    }

    buttons = [];

    var bw2 = cw - 64, bh2 = 46;
    var stars = starCount();
    var isLast = levelIndex >= LEVELS.length - 1;
    var retry = finishReason === 'dry';

    var b1 = {
      x: cx + 32, y: cy + 224, w: bw2, h: bh2,
      onClick: retry || isLast ? restartLevel : nextLevel
    };
    ctx.fillStyle = retry ? '#e08a2e' : '#24b98a';
    var b1g = ctx.createLinearGradient(0, b1.y, 0, b1.y + b1.h);
    if (retry) {
      b1g.addColorStop(0, '#f0a04a');
      b1g.addColorStop(1, '#d07a1e');
    } else {
      b1g.addColorStop(0, '#37c99a');
      b1g.addColorStop(1, '#1fa37a');
    }
    ctx.save();
    ctx.shadowColor = retry ? 'rgba(180,110,20,0.35)' : 'rgba(28,150,110,0.35)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = b1g;
    ctx.beginPath(); rr(ctx, b1.x, b1.y, b1.w, b1.h, 13); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 16px ' + FONT;
    ctx.fillText(retry ? '再试一次' : (isLast ? '再洗一次' : '下一单'), W / 2, b1.y + bh2 / 2);
    buttons.push(b1);

    var halfW = (bw2 - 10) / 2;
    // 左下：回上一单（水不够时可以去刷钱），第一关则是重洗
    var canPrev = levelIndex > 0;
    var b2 = {
      x: cx + 32, y: cy + 282, w: halfW, h: 40,
      onClick: canPrev ? function () { startLevel(levelIndex - 1); } : restartLevel
    };
    ctx.strokeStyle = '#d3dce6';
    ctx.lineWidth = 2;
    ctx.beginPath(); rr(ctx, b2.x, b2.y, b2.w, b2.h, 12); ctx.stroke();
    ctx.fillStyle = '#5b6c7d';
    ctx.font = '600 14px ' + FONT;
    ctx.fillText(canPrev ? '← 上一单' : '再洗一次', b2.x + halfW / 2, b2.y + 20);
    buttons.push(b2);

    var b3 = { x: cx + 32 + halfW + 10, y: cy + 282, w: halfW, h: 40, onClick: openUpgrade };
    ctx.fillStyle = '#eef6f2';
    ctx.beginPath(); rr(ctx, b3.x, b3.y, b3.w, b3.h, 12); ctx.fill();
    ctx.fillStyle = '#1e8f6b';
    ctx.font = '600 14px ' + FONT;
    ctx.fillText('升级水枪', b3.x + halfW / 2, b3.y + 20);
    buttons.push(b3);

    // 底部四个小入口：洗前洗后 / 好友排行 / 分享 / 禅模式
    var linkGap = 8;
    var linkW = (cw - 64 - linkGap * 3) / 4;
    var linkY = cy + 330;
    var l0x = cx + 32;

    var links = [
      { x: l0x, label: '洗前洗后', color: '#8a99a8', onClick: openCompare },
      { x: l0x + (linkW + linkGap), label: '好友排行', color: '#2f86c8', onClick: openRank },
      { x: l0x + (linkW + linkGap) * 2, label: '分享', color: '#e08a2e', onClick: shareNow },
      { x: l0x + (linkW + linkGap) * 3, label: zen ? '退出禅修' : '禅模式', color: zen ? '#2f8f6b' : '#8a99a8', onClick: toggleZen }
    ];

    ctx.font = '600 12px ' + FONT;
    ctx.textAlign = 'center';
    for (var li = 0; li < links.length; li++) {
      var lk = links[li];
      ctx.fillStyle = lk.color;
      ctx.fillText(lk.label, lk.x + linkW / 2, linkY + 15);
      buttons.push({ x: lk.x, y: linkY, w: linkW, h: 30, onClick: lk.onClick });
    }

    ctx.restore();
  }

  function toggleZen() {
    zen = !zen;
    startOrder(order);
    blip(zen ? 520 : 760);
  }

  /* ---- 洗前 / 洗后 对比 ---- */
  function drawCompare() {
    drawBackdrop();

    var sx = W * compareSplit;

    // 左：洗前
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, sx, H);
    ctx.clip();
    ctx.drawImage(cleanCv, 0, 0, W, H);
    ctx.drawImage(beforeCv, 0, 0, W, H);
    ctx.restore();

    // 右：洗后
    ctx.save();
    ctx.beginPath();
    ctx.rect(sx, 0, W - sx, H);
    ctx.clip();
    ctx.drawImage(cleanCv, 0, 0, W, H);
    ctx.restore();

    // 分割线 + 把手
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, H);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(sx, H * 0.52, 22, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#4a5a6e';
    ctx.font = '600 15px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('‹ ›', sx, H * 0.52);
    ctx.restore();

    // 标签
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.font = '600 13px ' + FONT;
    var chipW = 58, chipH = 26, chipY = 84;

    ctx.fillStyle = 'rgba(30,40,52,0.55)';
    ctx.beginPath(); rr(ctx, 20, chipY, chipW, chipH, 13); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('洗前', 20 + chipW / 2, chipY + chipH / 2 + 1);

    ctx.fillStyle = 'rgba(36,185,138,0.85)';
    ctx.beginPath(); rr(ctx, W - 20 - chipW, chipY, chipW, chipH, 13); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText('洗后', W - 20 - chipW / 2, chipY + chipH / 2 + 1);
    ctx.restore();

    // 底部提示 + 关闭
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(20,48,66,0.55)';
    ctx.font = '500 13px ' + FONT;
    ctx.fillText('左右拖动看对比', W / 2, H - 106);
    ctx.restore();

    var cb = { x: W / 2 - 70, y: H - 78, w: 140, h: 44 };
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath(); rr(ctx, cb.x, cb.y, cb.w, cb.h, 14); ctx.fill();
    ctx.fillStyle = '#3d4a5c';
    ctx.font = '600 15px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('关闭', W / 2, cb.y + cb.h / 2);
    ctx.restore();
    buttons.push({ x: cb.x, y: cb.y, w: cb.w, h: cb.h, onClick: closeCompare });
  }

  function openCompare() { state = 'compare'; compareSplit = 0.5; }
  function closeCompare() { state = 'done'; }

  /* ---- 好友排行（微信开放数据域） ---- */
  var rankCanvas = null;

  function openRank() {
    state = 'rank';
    try {
      if (typeof wx !== 'undefined') {
        if (wx.getSharedCanvas) rankCanvas = wx.getSharedCanvas();
        if (wx.getOpenDataContext) {
          wx.getOpenDataContext().postMessage({ type: 'rank:show' });
        }
      }
    } catch (e) { rankCanvas = null; }
  }

  function closeRank() {
    try {
      if (typeof wx !== 'undefined' && wx.getOpenDataContext) {
        wx.getOpenDataContext().postMessage({ type: 'rank:hide' });
      }
    } catch (e) {}
    state = 'done';
  }

  function drawRank() {
    ctx.fillStyle = 'rgba(10,22,34,0.55)';
    ctx.fillRect(0, 0, W, H);

    var availW = W - 36;
    var availH = H - 190;
    var cw = availW, chh = availH;
    var cx = (W - cw) / 2;
    var cy = (H - chh) / 2 - 18;

    var hasData = rankCanvas && rankCanvas.width > 0;
    if (hasData) {
      var sc = Math.min(availW / rankCanvas.width, availH / rankCanvas.height);
      var dw = rankCanvas.width * sc;
      var dh = rankCanvas.height * sc;
      ctx.save();
      ctx.shadowColor = 'rgba(10,26,40,0.35)';
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 12;
      ctx.fillStyle = '#f7fbff';
      ctx.beginPath(); rr(ctx, (W - dw) / 2, (H - dh) / 2 - 18, dw, dh, 26); ctx.fill();
      ctx.restore();
      ctx.drawImage(rankCanvas, (W - dw) / 2, (H - dh) / 2 - 18, dw, dh);
    } else {
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); rr(ctx, cx, cy, cw, chh, 24); ctx.fill();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#1d2b3a';
      ctx.font = '700 19px ' + FONT;
      ctx.fillText('好友排行', W / 2, cy + 56);
      ctx.fillStyle = '#8aa0b4';
      ctx.font = '500 13px ' + FONT;
      ctx.fillText('需要在微信小游戏里查看', W / 2, cy + 96);
      ctx.fillText('浏览器预览没有开放数据域', W / 2, cy + 120);
      ctx.restore();
    }

    // 关闭
    var cb = { x: W / 2 - 72, y: H - 92, w: 144, h: 48 };
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.22)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); rr(ctx, cb.x, cb.y, cb.w, cb.h, 16); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#3d4a5c';
    ctx.font = '700 15px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('关闭', W / 2, cb.y + cb.h / 2);
    buttons.push({ x: cb.x, y: cb.y, w: cb.w, h: cb.h, onClick: closeRank });
  }


  /* ---- 选车 ---- */
  function drawPick() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#22323f');
    g.addColorStop(1, '#0f1820');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '500 12px ' + FONT;
    ctx.fillText(order.name + ' · 还剩 ' + pickOptions.length + ' 辆', W / 2, 58);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 23px ' + FONT;
    ctx.fillText('先洗哪辆？', W / 2, 94);

    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.font = '500 13px ' + FONT;
    ctx.fillText('水箱共用 · 洗完一辆回补 15%', W / 2, 122);
    ctx.restore();

    var cardW = Math.min(W - 44, 366);
    var cardH = 168, gap = 14;
    var n = pickOptions.length;
    var totalH = n * cardH + (n - 1) * gap;
    var y0 = 168 + Math.max(0, (H - 250 - totalH) / 2);
    var cx = (W - cardW) / 2;

    for (var i = 0; i < n; i++) {
      var idx = pickOptions[i];
      var lv = NS.LEVEL_INDEX[order.fleet[idx]];
      if (!lv) continue;
      var cy = y0 + i * (cardH + gap);

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 8;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); rr(ctx, cx, cy, cardW, cardH, 20); ctx.fill();
      ctx.restore();

      var th = thumbs[idx];
      if (th) {
        var maxW = cardW - 36, maxH = 92;
        var sc = Math.min(maxW / th.w, maxH / th.h);
        var dw = th.w * sc, dh = th.h * sc;
        ctx.drawImage(th.cv, cx + (cardW - dw) / 2, cy + 16 + (maxH - dh) / 2, dw, dh);
      }

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#1d2b3a';
      ctx.font = '600 17px ' + FONT;
      ctx.fillText(lv.name, cx + cardW / 2, cy + 126);

      var chips = ['软泥'];
      if (lv.heavy) chips.push('厚泥');
      if (lv.grease && lv.grease.length) chips.push('硬垢×' + lv.grease.length);
      if (lv.paint && lv.paint.length) chips.push('漆损×' + lv.paint.length);

      ctx.font = '500 11px ' + FONT;
      var widths = [], totalChip = 0, c;
      for (c = 0; c < chips.length; c++) {
        var cw = ctx.measureText(chips[c]).width + 16;
        widths.push(cw);
        totalChip += cw + 6;
      }
      totalChip -= 6;

      var chipX = cx + (cardW - totalChip) / 2;
      for (c = 0; c < chips.length; c++) {
        ctx.fillStyle = '#eef3f7';
        ctx.beginPath(); rr(ctx, chipX, cy + 140, widths[c], 18, 9); ctx.fill();
        ctx.fillStyle = '#5a6b7c';
        ctx.fillText(chips[c], chipX + widths[c] / 2, cy + 150);
        chipX += widths[c] + 6;
      }
      ctx.restore();

      buttons.push({
        x: cx, y: cy, w: cardW, h: cardH,
        onClick: (function (id) { return function () { choosePart(id); }; })(idx)
      });
    }
  }

  function upgradeLayout() {
    var cw = Math.min(W - 32, 366);
    var rowH = 128, headH = 92, footH = 58;
    var chh = headH + rowH * UPGRADES.length + footH;
    var cx = (W - cw) / 2;
    var cy = (H - chh) / 2;
    var rows = [];
    for (var i = 0; i < UPGRADES.length; i++) {
      var ry = cy + headH + i * rowH;
      rows.push({
        i: i, x: cx, y: ry, w: cw, h: rowH,
        btn: { x: cx + 16, y: ry + 80, w: cw - 32, h: 36 }
      });
    }
    return {
      x: cx, y: cy, w: cw, h: chh, rows: rows,
      close: { x: cx + 16, y: cy + chh - footH + 8, w: cw - 32, h: 38 }
    };
  }

  function drawUpgrade() {
    var L = upgradeLayout();

    ctx.save();
    ctx.fillStyle = 'rgba(10,22,34,0.58)';
    ctx.fillRect(0, 0, W, H);

    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 12;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); rr(ctx, L.x, L.y, L.w, L.h, 22); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#182a3a';
    ctx.font = '700 20px ' + FONT;
    ctx.fillText('升级水枪', L.x + 22, L.y + 34);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#e0a12a';
    ctx.font = '700 17px ' + FONT;
    ctx.fillText('💰 ' + save.coins, L.x + L.w - 22, L.y + 34);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#9aa8b6';
    ctx.font = '500 12px ' + FONT;
    ctx.fillText('通关赚金币，洗得干净又快给得多', L.x + 22, L.y + 62);

    buttons = [];

    for (var i = 0; i < UPGRADES.length; i++) {
      var up = UPGRADES[i];
      var row = L.rows[i];
      var lv = save.up[up.key];
      var full = lv >= up.max;
      var cost = full ? 0 : up.costs[lv - 1];
      var canBuy = !full && save.coins >= cost;

      if (i > 0) {
        ctx.strokeStyle = '#eef2f6';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(row.x + 20, row.y);
        ctx.lineTo(row.x + row.w - 20, row.y);
        ctx.stroke();
      }

      // 购买闪光
      if (buyRow === i && buyFlash > 0) {
        ctx.save();
        ctx.globalAlpha = buyFlash * 0.5;
        ctx.fillStyle = '#b8f5dd';
        ctx.beginPath(); rr(ctx, row.x + 6, row.y + 4, row.w - 12, row.h - 8, 14); ctx.fill();
        ctx.restore();
      }

      ctx.textAlign = 'left';
      ctx.font = '20px ' + FONT;
      ctx.fillText(up.icon, row.x + 22, row.y + 32);

      ctx.fillStyle = '#1d2b3a';
      ctx.font = '600 16px ' + FONT;
      ctx.fillText(up.name, row.x + 54, row.y + 30);

      // 等级点
      for (var d = 0; d < up.max; d++) {
        ctx.beginPath();
        ctx.arc(row.x + 54 + 14 + d * 15, row.y + 47, 4.5, 0, TAU);
        ctx.fillStyle = d < lv ? '#24b98a' : '#e2e8ef';
        ctx.fill();
      }

      ctx.fillStyle = '#8a99a8';
      ctx.font = '500 12px ' + FONT;
      ctx.fillText(full ? up.effect(lv) : up.effect(lv) + '   ' + up.next(lv), row.x + 54, row.y + 66);

      // 按钮
      var b = row.btn;
      var label, bg, fg;
      if (full) { label = '已满级'; bg = '#eef2f6'; fg = '#9aa8b6'; }
      else if (canBuy) { label = '升级 · 💰' + cost; bg = '#24b98a'; fg = '#ffffff'; }
      else { label = '金币不足 · 还差 ' + (cost - save.coins); bg = '#eef2f6'; fg = '#a8b4c0'; }

      ctx.fillStyle = bg;
      ctx.beginPath(); rr(ctx, b.x, b.y, b.w, b.h, 11); ctx.fill();
      ctx.fillStyle = fg;
      ctx.font = '600 14px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2);

      if (canBuy) {
        buttons.push({
          x: b.x, y: b.y, w: b.w, h: b.h,
          onClick: (function (key, idx, price) {
            return function () { buyUpgrade(key, idx, price); };
          })(up.key, i, cost)
        });
      }
    }

    // 关闭
    var cb = L.close;
    ctx.strokeStyle = '#d3dce6';
    ctx.lineWidth = 2;
    ctx.beginPath(); rr(ctx, cb.x, cb.y, cb.w, cb.h, 12); ctx.stroke();
    ctx.fillStyle = '#5b6c7d';
    ctx.font = '600 15px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('完成', cb.x + cb.w / 2, cb.y + cb.h / 2);
    buttons.push({ x: cb.x, y: cb.y, w: cb.w, h: cb.h, onClick: closeUpgrade });

    ctx.restore();
  }

  function buyUpgrade(key, idx, price) {
    if (save.coins < price) return;
    if (save.up[key] >= 5) return;
    save.coins -= price;
    save.up[key] += 1;
    persist();
    buyRow = idx;
    buyFlash = 1;
    blip(880);
    blip(1180);
    vibrate(12);
  }

  function openUpgrade() {
    if (state !== 'done') return;
    state = 'upgrade';
  }

  function closeUpgrade() {
    state = 'done';
  }

  function restartLevel() { startOrder(order); }

  function render() {
    buttons = [];    if (state === 'compare') {
      drawCompare();
      return;
    }
    if (state === 'pick') {
      drawPick();
      return;
    }
    if (state === 'rank') {
      drawScene();
      drawGrade();
      drawRank();
      return;
    }
    drawScene();
    drawToolHighlight();
    drawFoam();
    drawShine();
    drawWater();
    drawParts();
    drawGroundGrass();
    drawForeground();
    drawGrade();
    drawHUD();
    if (state === 'done') drawDone();
    if (state === 'upgrade') drawUpgrade();
    drawSizeDebug();
  }

  /** 临时诊断：把运行时真实尺寸打在屏幕右上角 */
  function drawSizeDebug() {
    try {
      var i2 = {};
      try {
        if (typeof wx !== 'undefined' && wx.getSystemInfoSync) i2 = wx.getSystemInfoSync() || {};
      } catch (e) {}
      var lines = [
        'scr ' + (i2.screenWidth || '?') + 'x' + (i2.screenHeight || '?') + ' @' + (i2.pixelRatio || '?'),
        'win ' + (i2.windowWidth || '?') + 'x' + (i2.windowHeight || '?'),
        'buf ' + cv.width + 'x' + cv.height,
        'use ' + Math.round(W) + 'x' + Math.round(H) + ' d' + DPR.toFixed(2)
      ];
      var bw2 = 158, lh = 15;
      ctx.save();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = '11px monospace';
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      ctx.fillRect(W - bw2 - 4, SAFE_TOP + 116, bw2, 8 + lines.length * lh);
      ctx.fillStyle = '#6ff0b4';
      for (var i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], W - bw2, SAFE_TOP + 120 + i * lh);
      }
      ctx.restore();
    } catch (e) {}
  }

  /* ---------------------------------------------------------------
   * 11. 输入
   * ------------------------------------------------------------- */
  function toLocal(e) {
    var r = cv.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width * W,
      y: (e.clientY - r.top) / r.height * H
    };
  }

  function hit(p, b) {
    return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  }

  cv.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    initAudio();
    var p = toLocal(e);

    if (state === 'rank') {
      for (var ri = 0; ri < buttons.length; ri++) {
        if (hit(p, buttons[ri])) { buttons[ri].onClick(); return; }
      }
      return;
    }

    if (state === 'pick') {
      for (var ki = 0; ki < buttons.length; ki++) {
        if (hit(p, buttons[ki])) { buttons[ki].onClick(); return; }
      }
      return;
    }

    if (state === 'compare') {
      for (var ci = 0; ci < buttons.length; ci++) {
        if (hit(p, buttons[ci])) { buttons[ci].onClick(); return; }
      }
      compareDrag = true;
      compareSplit = clamp(p.x / W, 0.03, 0.97);
      return;
    }

    if (state === 'done' || state === 'upgrade') {
      for (var i = 0; i < buttons.length; i++) {
        if (hit(p, buttons[i])) { buttons[i].onClick(); return; }
      }
      if (state === 'upgrade') {
        var L = upgradeLayout();
        if (!hit(p, { x: L.x, y: L.y, w: L.w, h: L.h })) closeUpgrade();
      }
      return;
    }

    // 玩的时候先看有没有点中按钮（收工）
    for (var j = 0; j < buttons.length; j++) {
      if (hit(p, buttons[j])) { buttons[j].onClick(); return; }
    }

    pointer.x = p.x;
    pointer.y = p.y;
    lastX = p.x;
    lastY = p.y;
    pointer.down = true;
    try { if (cv.setPointerCapture) cv.setPointerCapture(e.pointerId); } catch (err) {}
    setWater(false);
  });

  cv.addEventListener('pointermove', function (e) {
    if (compareDrag) {
      var cp = toLocal(e);
      compareSplit = clamp(cp.x / W, 0.03, 0.97);
      return;
    }
    if (!pointer.down) return;
    var p = toLocal(e);
    pointer.x = p.x;
    pointer.y = p.y;
  });

  function pointerUp() {
    compareDrag = false;
    pointer.down = false;
    setWater(false);
  }
  cv.addEventListener('pointerup', pointerUp);
  cv.addEventListener('pointercancel', pointerUp);
  cv.addEventListener('pointerleave', pointerUp);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { pointer.down = false; setWater(false); }
  });

  window.addEventListener('resize', function () {
    clearTimeout(window.__rz);
    window.__rz = setTimeout(resize, 160);
  });

  /* ---------------------------------------------------------------
   * 12. 主循环
   * ------------------------------------------------------------- */
  var lastT = 0;
  var frameCount = 0, lastErr = '';
  var fatalShown = false;

  /** 出错了就把信息画在画布上 —— 真机/模拟器里看不见 console */
  function fatal(e) {
    try {
      var m0 = (e && (e.message || e)) || 'unknown';
      console.error('[fatal]', (e && e.stack) || m0);
      // 画布可能不可用，原生弹窗是最后一道保险
      if (typeof wx !== 'undefined' && wx.showModal) {
        wx.showModal({ title: '亮车计划启动失败', content: String(m0).slice(0, 180), showCancel: false });
      }
    } catch (e3) {}
    try {
      var msg = (e && (e.stack || e.message)) || String(e);
      console.error('[fatal]', msg);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#101820';
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = '#ff7a7a';
      ctx.font = '18px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      var lines = String(msg).split('\n');
      for (var i = 0; i < lines.length && i < 18; i++) {
        ctx.fillText(lines[i].slice(0, 46), 16, 24 + i * 24);
      }
    } catch (e2) {}
  }

  function frame(t) {
    frameCount++;
    // 每帧核对缓冲区：运行时可能在我们设置之后又改掉它
    if (hasLayout && cv.width && cv.height) {
      var ex = Math.round(W * DPR), ey = Math.round(H * DPR);
      if (Math.abs(cv.width - ex) > 2 || Math.abs(cv.height - ey) > 2) {
        try {
          if (adoptBuffer()) applyLayout();
        } catch (e) {}
      }
    }
    var dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0.016;
    lastT = t;
    try {
      bootDone = true;
      update(dt);
      render();
    } catch (e) {
      if (!fatalShown) {
        fatalShown = true;
        fatal(e);
      }
      return;
    }
    requestAnimationFrame(frame);
  }

  // 只在 ?debug=1 时暴露，供截图回归脚本点击按钮
  if (QS.has('debug')) {
    window.__cw = {
      get buttons() { return buttons; },
      get state() { return state; },
      get save() { return save; },
      get water() { return water; },
      get waterMax() { return waterMax; },
      get waterSpent() { return waterSpent; },
      get progress() { return progress; },
      get level() { return level; },
      get brush() { return brushRadius(); },
      get tool() { return tool; },
      get crusts() { return crustsLeft(); },
      get paint() { return paintLeft(); },
      get paintVisible() { return paintShown(); },
      get playerLevel() { return save.level; },
      get xp() { return save.xp; },
      get washes() { return save.washes; },
      get daily() { return save.daily; },
      openRank: openRank,
      openCompare: openCompare,
      startLevel: startLevel,
      openUpgrade: openUpgrade,
      setTool: setTool,
      syncRank: syncRank,
      share: shareNow,
      get pointerDown() { return pointer.down; },
      get frames() { return frameCount; },
      get pointerXY() { return [pointer.x, pointer.y]; },
      get crustPos() {
        var a = [];
        for (var i = 0; i < grease.length; i++) {
          if (grease[i].hp > 0) a.push({ x: grease[i].x, y: grease[i].y, r: grease[i].r });
        }
        return a;
      },
      get paintPos() {
        var a = [];
        for (var i = 0; i < paintSpots.length; i++) {
          a.push({ x: paintSpots[i].x, y: paintSpots[i].y, r: paintSpots[i].r, hp: paintSpots[i].hp, rev: paintSpots[i].revealed });
        }
        return a;
      },
      get heavy() { return heavyLeftFrac; },
      get audio() {
        return ac ? {
          state: ac.state,
          hasWater: !!waterVoice,
          freq: waterVoice ? Math.round(waterVoice.bp2.frequency.value) : 0,
          gain: waterVoice ? +waterVoice.body.gain.value.toFixed(4) : 0,
          churn: waterVoice ? +waterVoice.churn.gain.value.toFixed(3) : 0,
          on: waterOn
        } : 'none';
      },
      get imgs() {
        return Object.keys(IMAGES).filter(function (k) { return !!imgOf(k); });
      },
      debugCanvas: function (n) { return n === 'dirt' ? dirtCv : n === 'heavy' ? heavyCv : n === 'mask' ? maskCv : n === 'cover' ? coverMaskCv : n === 'clean' ? cleanCv : null; },
      refill: function () { water = waterMax; }
    };
  }

  try {
    bootMark('canvas ' + (ctx ? 'ok' : 'NULL'));
    if (!ctx) {
      try {
        if (typeof wx !== 'undefined' && wx.showModal) {
          wx.showModal({
            title: '画布初始化失败',
            content: 'getContext 返回 null，可能是基础库版本不兼容',
            showCancel: false
          });
        }
      } catch (e4) {}
      return;
    }
    makeGrain();
    bootMark('grain');
    setupShare();
    setupRecorder();
    bootMark('share/recorder');
    resize();
    bootMark('resize ' + W + 'x' + H + ' dpr' + DPR);
    startOrder(LEVELS[clamp(levelIndex, 0, LEVELS.length - 1)]);
    bootMark('startOrder');
    loadImages(function () {
      bootMark('images ' + Object.keys(IMAGES).length);
      configureLevel();
    });
    requestAnimationFrame(frame);
  } catch (e) {
    fatal(e);
  }
})();
