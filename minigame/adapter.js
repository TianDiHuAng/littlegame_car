/* =====================================================================
 * 微信小游戏适配层
 * 把游戏用到的浏览器 API（document / canvas / pointer / storage / audio）
 * 映射到 wx.*。只"补装"当前环境缺失的全局，已有的不动。
 * =================================================================== */
(function () {
  'use strict';

  var info = wx.getSystemInfoSync();
  var SW = info.screenWidth || 375;
  var SH = info.screenHeight || 667;
  var DPR = Math.min(info.pixelRatio || 1, 2);
  var G = (typeof GameGlobal !== 'undefined') ? GameGlobal : this;

  function install(name, value) {
    if (typeof G[name] !== 'undefined') return;
    try { G[name] = value; } catch (e) { /* 只读就算了 */ }
  }

  /* ---------------- 主画布 ---------------- */
  var mainCanvas = wx.createCanvas();
  mainCanvas.width = Math.round(SW * DPR);
  mainCanvas.height = Math.round(SH * DPR);
  mainCanvas.style = { width: SW + 'px', height: SH + 'px' };

  mainCanvas.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: SW, height: SH, right: SW, bottom: SH };
  };

  var stageEl = {
    style: {},
    getBoundingClientRect: function () {
      return { left: 0, top: 0, width: SW, height: SH, right: SW, bottom: SH };
    }
  };

  /* ---------------- 触摸 → pointer ---------------- */
  var handlers = { down: [], move: [], up: [] };

  function emit(kind, e) {
    var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!t) return;
    var ev = {
      clientX: t.clientX,
      clientY: t.clientY,
      pointerId: (t.identifier != null ? t.identifier : 1),
      pointerType: 'touch',
      isPrimary: true,
      preventDefault: function () {},
      stopPropagation: function () {}
    };
    var list = handlers[kind];
    for (var i = 0; i < list.length; i++) {
      try { list[i](ev); } catch (err) { /* 单个监听器出错不能拖垮整局 */ }
    }
  }

  wx.onTouchStart(function (e) { emit('down', e); });
  wx.onTouchMove(function (e) { emit('move', e); });
  wx.onTouchEnd(function (e) { emit('up', e); });
  wx.onTouchCancel(function (e) { emit('up', e); });

  // 实例级覆盖：即使底层是 DOM canvas，也走 wx 触摸通道
  mainCanvas.addEventListener = function (type, fn) {
    if (type === 'pointerdown') handlers.down.push(fn);
    else if (type === 'pointermove') handlers.move.push(fn);
    else handlers.up.push(fn);
  };
  mainCanvas.removeEventListener = function () {};
  mainCanvas.setPointerCapture = function () {};
  mainCanvas.releasePointerCapture = function () {};

  /* ---------------- document ---------------- */
  var docEl = {
    hidden: false,
    getElementById: function (id) {
      if (id === 'game') return mainCanvas;
      if (id === 'stage') return stageEl;
      return null;
    },
    createElement: function (tag) {
      if (tag === 'canvas') {
        var c = wx.createCanvas();      // 第二次以后调用拿到的是离屏画布
        c.style = {};
        return c;
      }
      return { style: {}, appendChild: function () {}, setAttribute: function () {} };
    },
    addEventListener: function (type, fn) {
      if (type === 'visibilitychange') {
        wx.onHide(function () { docEl.hidden = true; try { fn(); } catch (e) {} });
        wx.onShow(function () { docEl.hidden = false; try { fn(); } catch (e) {} });
      }
    },
    removeEventListener: function () {},
    body: { style: {}, appendChild: function () {} }
  };

  /* ---------------- 全局 ---------------- */
  install('document', docEl);
  install('location', { search: '', href: 'minigame:///', origin: '' });
  install('innerWidth', SW);
  install('innerHeight', SH);
  install('devicePixelRatio', DPR);
  install('addEventListener', function () {});
  install('removeEventListener', function () {});

  /* ---------------- 存储 ---------------- */
  install('localStorage', {
    getItem: function (k) {
      try {
        var v = wx.getStorageSync(k);
        return (v === '' || v === undefined || v === null) ? null : v;
      } catch (e) { return null; }
    },
    setItem: function (k, v) {
      try { wx.setStorageSync(k, String(v)); } catch (e) {}
    },
    removeItem: function (k) {
      try { wx.removeStorageSync(k); } catch (e) {}
    }
  });

  /* ---------------- 震动 ---------------- */
  function shortVibe(strong) {
    try {
      wx.vibrateShort({ type: strong ? 'medium' : 'light', fail: function () {} });
    } catch (e) {}
  }

  install('navigator', {
    userAgent: 'minigame',
    vibrate: function (pattern) {
      if (typeof pattern === 'number') { shortVibe(pattern > 20); return true; }
      if (Object.prototype.toString.call(pattern) === '[object Array]' && pattern.length) {
        var strong = false, j, t = 0;
        for (j = 1; j < pattern.length; j += 2) if (pattern[j] > 20) strong = true;
        for (j = 1; j < pattern.length && j < 9; j += 2) {
          t += (pattern[j - 1] || 0) + 30;
          (function (delay, st) {
            setTimeout(function () { shortVibe(st); }, delay);
          })(t, strong);
        }
        return true;
      }
      return false;
    }
  });

  /* ---------------- 时间 / 动画帧 ---------------- */
  if (typeof G.performance === 'undefined') {
    G.performance = { now: function () { return Date.now(); } };
  }
  if (typeof G.requestAnimationFrame === 'undefined') {
    G.requestAnimationFrame = function (cb) {
      return setTimeout(function () { cb(Date.now()); }, 16);
    };
  }
  if (typeof G.URLSearchParams === 'undefined') {
    // 真正解析一遍，别做成永远返回 false 的空壳 —— 否则 ?debug / ?mute 全部失效
    G.URLSearchParams = function (search) {
      var map = {};
      var s = String(search == null ? '' : search).replace(/^\?/, '');
      if (s) {
        var parts = s.split('&');
        for (var i = 0; i < parts.length; i++) {
          if (!parts[i]) continue;
          var kv = parts[i].split('=');
          var k = decodeURIComponent(kv[0] || '');
          var v = decodeURIComponent(kv.slice(1).join('=') || '');
          map[k] = v;
        }
      }
      this.has = function (k) { return Object.prototype.hasOwnProperty.call(map, k); };
      this.get = function (k) { return this.has(k) ? map[k] : null; };
      this.append = function (k, v) { map[k] = String(v); };
    };
  }

  /* ---------------- 图片 ---------------- */
  // 游戏里的 loadImages 已被构建脚本改写成 wx.createImage()
  install('Image', function () { return wx.createImage(); });

  /* ---------------- 音频 ---------------- */
  // 小游戏基础库 2.19.0+ 才有 WebAudio；不支持时游戏自动静音
  try {
    if (typeof G.AudioContext === 'undefined' && wx.createWebAudioContext) {
      G.AudioContext = function () { return wx.createWebAudioContext(); };
    }
  } catch (e) {}

  /* ---------------- 刘海屏安全区 ---------------- */
  try {
    G.__SAFE_TOP = (info.safeArea && info.safeArea.top) || info.statusBarHeight || 0;
  } catch (e) { G.__SAFE_TOP = 0; }

  /* ---------------- 导出给入口包装函数 ---------------- */
  // 小游戏全局里可能已有一个残缺的 document（没有 getElementById），
  // 所以不依赖全局解析，改为由构建时包一层函数把这两个对象注入进去。
  try {
    G.__DOC__ = docEl;
    G.__WIN__ = G;
  } catch (e) {}

  /* ---------------- 调试信息 ---------------- */
  try {
    G.__WX_ENV = {
      screenWidth: SW,
      screenHeight: SH,
      pixelRatio: DPR,
      safeArea: info.safeArea || null,
      statusBarHeight: info.statusBarHeight || 0
    };
  } catch (e) {}
})();
