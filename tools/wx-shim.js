/* =====================================================================
 * 浏览器里的 wx 模拟层
 * 只用于在浏览器验证 minigame/game.js 的适配层，不参与小游戏打包。
 * 故意把 AudioContext 关掉 —— 验证期间全程静音。
 * =================================================================== */
(function () {
  'use strict';

  // 静音：让游戏找不到任何可用的 AudioContext
  try {
    window.AudioContext = undefined;
    window.webkitAudioContext = undefined;
  } catch (e) {}

  var W = window.innerWidth;
  var H = window.innerHeight;
  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  var touchCb = { start: null, move: null, end: null };
  var shareCb = null;
  var timelineCb = null;
  var made = 0;

  window.GameGlobal = window;

  // 和真实小游戏一样的舞台结构，方便适配层按 id 找到元素
  var stage = document.createElement('div');
  stage.id = 'stage';
  stage.style.cssText = 'position:fixed;inset:0;overflow:hidden;';
  document.body.appendChild(stage);

  function fwd(kind) {
    return function (e) {
      e.preventDefault();
      var t = { clientX: e.clientX, clientY: e.clientY, identifier: 1 };
      var cb = touchCb[kind];
      if (cb) cb({ touches: kind === 'end' ? [] : [t], changedTouches: [t] });
    };
  }

  /* ================= 开放数据域模拟 =================
   * 真机上是独立子包在跑；这里画一张假榜单，
   * 用来验证主域的缩放、遮罩和关闭按钮排版。 */
  var sharedCanvas = document.createElement('canvas');
  sharedCanvas.width = 640;
  sharedCanvas.height = 840;

  function roundRectPath(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function drawMockRank() {
    var g = sharedCanvas.getContext('2d');
    var CW = sharedCanvas.width;
    var CH = sharedCanvas.height;
    g.clearRect(0, 0, CW, CH);

    var bg = g.createLinearGradient(0, 0, 0, CH);
    bg.addColorStop(0, '#f7fbff');
    bg.addColorStop(1, '#eaf3fa');
    g.fillStyle = bg;
    roundRectPath(g, 0, 0, CW, CH, 28);
    g.fill();

    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillStyle = '#1d2b3a';
    g.font = '700 30px sans-serif';
    g.fillText('好友排行', 32, 52);

    g.textAlign = 'right';
    g.fillStyle = '#8aa0b4';
    g.font = '500 20px sans-serif';
    g.fillText('按等级排序', CW - 32, 54);

    var mock = [
      { name: '洗车小王子', level: 12, washes: 96 },
      { name: 'Lin', level: 9, washes: 71 },
      { name: '一只咸鱼', level: 7, washes: 55 },
      { name: '你', level: 4, washes: 23 },
      { name: '老王', level: 3, washes: 18 },
      { name: '阿May', level: 2, washes: 9 },
      { name: '新手上路', level: 1, washes: 2 }
    ];
    var medal = ['#f2b21f', '#b9c4d1', '#c98a3a'];
    var top = 96;
    var rowH = 96;

    for (var i = 0; i < mock.length; i++) {
      var r = mock[i];
      var y = top + i * rowH;
      var cyr = y + (rowH - 12) / 2;

      g.fillStyle = i === 0 ? 'rgba(255,247,224,0.95)' : 'rgba(255,255,255,0.86)';
      roundRectPath(g, 24, y, CW - 48, rowH - 12, 20);
      g.fill();

      g.textAlign = 'center';
      g.textBaseline = 'middle';
      if (i < 3) {
        g.fillStyle = medal[i];
        g.beginPath();
        g.arc(72, cyr, 22, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#ffffff';
        g.font = '700 22px sans-serif';
        g.fillText(String(i + 1), 72, cyr + 1);
      } else {
        g.fillStyle = '#9aabbc';
        g.font = '700 22px sans-serif';
        g.fillText(String(i + 1), 72, cyr + 1);
      }

      g.fillStyle = '#dbe6ef';
      g.beginPath();
      g.arc(118, cyr, 28, 0, Math.PI * 2);
      g.fill();

      g.textAlign = 'left';
      g.fillStyle = '#1d2b3a';
      g.font = '600 24px sans-serif';
      g.fillText(r.name, 164, cyr - 12);

      g.fillStyle = '#8aa0b4';
      g.font = '400 18px sans-serif';
      g.fillText('洗了 ' + r.washes + ' 辆', 164, cyr + 16);

      g.textAlign = 'right';
      g.fillStyle = '#2f86c8';
      g.font = '700 26px sans-serif';
      g.fillText('Lv.' + r.level, CW - 44, cyr + 1);
    }
  }

  drawMockRank();

  var openDataContext = {
    postMessage: function (msg) {
      if (msg && msg.type === 'rank:show') drawMockRank();
    }
  };

  /* ================= wx ================= */
  window.wx = {
    getSystemInfoSync: function () {
      return {
        screenWidth: W,
        screenHeight: H,
        pixelRatio: DPR,
        safeArea: { top: 0, left: 0, right: W, bottom: H, width: W, height: H },
        statusBarHeight: 0,
        platform: 'devtools'
      };
    },

    createCanvas: function () {
      var c = document.createElement('canvas');
      if (made === 0) {
        made++;
        c.id = 'game';
        window.__TEST_CANVAS__ = c;
        c.style.cssText = 'position:absolute;left:0;top:0;width:' + W + 'px;height:' + H + 'px;display:block;touch-action:none;';
        stage.appendChild(c);
        c.addEventListener('pointerdown', fwd('start'));
        c.addEventListener('pointermove', fwd('move'));
        c.addEventListener('pointerup', fwd('end'));
        c.addEventListener('pointercancel', fwd('end'));
        return c;
      }
      made++;
      return c;
    },

    createImage: function () {
      var im = new Image();
      // 真实小游戏的图片对象没有 naturalWidth / naturalHeight，
      // 严苛模式下模拟这一点，防止代码又依赖 DOM 专有属性
      if (window.__HARSH__) {
        try {
          Object.defineProperty(im, 'naturalWidth', { configurable: true, get: function () { return undefined; } });
          Object.defineProperty(im, 'naturalHeight', { configurable: true, get: function () { return undefined; } });
        } catch (e) {}
      }
      return im;
    },

    onTouchStart: function (cb) { touchCb.start = cb; },
    onTouchMove: function (cb) { touchCb.move = cb; },
    onTouchEnd: function (cb) { touchCb.end = cb; },
    onTouchCancel: function () {},

    onHide: function (cb) {
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) cb();
      });
    },
    onShow: function (cb) {
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) cb();
      });
    },

    getStorageSync: function (k) {
      try {
        var v = window.localStorage.getItem(k);
        return v === null ? '' : v;
      } catch (e) { return ''; }
    },
    setStorageSync: function (k, v) {
      try { window.localStorage.setItem(k, v); } catch (e) {}
    },
    removeStorageSync: function (k) {
      try { window.localStorage.removeItem(k); } catch (e) {}
    },

    vibrateShort: function () {},

    getSharedCanvas: function () { return sharedCanvas; },
    getOpenDataContext: function () { return openDataContext; },

    setUserCloudStorage: function (opt) {
      try {
        var kv = {};
        (opt.KVDataList || []).forEach(function (d) { kv[d.key] = d.value; });
        window.localStorage.setItem('mockCloud', JSON.stringify(kv));
      } catch (e) {}
      if (opt.success) setTimeout(opt.success, 0);
    },

    showShareMenu: function () {},
    onShareAppMessage: function (cb) { shareCb = cb; },
    onShareTimeline: function (cb) { timelineCb = cb; },
    shareAppMessage: function (opt) {
      var payload = { title: opt.title, imageUrl: opt.imageUrl };
      if (opt.channel === 'video') {
        console.log('[shim] 分享录像:', opt.extra && opt.extra.videoPath);
        payload = { video: opt.extra && opt.extra.videoPath };
      }
      window.__lastShare = payload;
      console.log('[shim] 分享:', JSON.stringify(payload));
    },

    // 浏览器里没有录屏能力，故意不提供 getGameRecorderManager

    createWebAudioContext: undefined
  };
  /* ================= 严苛模式 =================
   * 模拟真实小游戏环境的"残缺"：全局 document 没有 getElementById / createElement，
   * 也没有 requestAnimationFrame / performance / localStorage。
   * 专门用来抓适配层"以为全局已有就跳过安装"的那类 bug。 */
  if (window.__HARSH__) {
    try {
      Object.defineProperty(window, 'document', {
        configurable: true,
        writable: true,
        value: {
          hidden: false,
          addEventListener: function () {},
          removeEventListener: function () {}
          // 故意不提供 getElementById / createElement / body
        }
      });
    } catch (e) {}

    try { delete window.requestAnimationFrame; } catch (e) { window.requestAnimationFrame = undefined; }
    try { delete window.performance; } catch (e) { window.performance = undefined; }
    try { Object.defineProperty(window, 'localStorage', { configurable: true, value: undefined }); } catch (e) {}
    try { Object.defineProperty(window, 'navigator', { configurable: true, value: undefined }); } catch (e) {}
    try { delete window.URLSearchParams; } catch (e) {}
    console.log('[shim] 严苛模式已开启');
  }
})();