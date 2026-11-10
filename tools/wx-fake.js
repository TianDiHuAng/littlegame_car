/* 极简假 wx：只提供小游戏真有的 API，不含任何 DOM 便利
 * 目的：让 minigame/adapter.js 在它真正面对的"残缺环境"里跑起来
 */
(function () {
  var store = {};
  var touch = { start: [], move: [], end: [] };
  var resizeCbs = [];
  var mainCanvas = null;
  var info = {
    screenWidth: 375, screenHeight: 812,
    windowWidth: 375, windowHeight: 812,
    pixelRatio: 2, statusBarHeight: 0,
    safeArea: { top: 0, left: 0, right: 375, bottom: 812, width: 375, height: 812 }
  };

  window.GameGlobal = window;   // 小游戏一定有 GameGlobal

  window.__FAKE__ = {
    store: function () { return store; },
    setInfo: function (o) { for (var k in o) info[k] = o[k]; },
    touch: function (kind, x, y) {
      var t = { clientX: x, clientY: y, pageX: x, pageY: y, identifier: 0 };
      var e = kind === 'end'
        ? { touches: [], changedTouches: [t], timeStamp: Date.now() }
        : { touches: [t], changedTouches: [t], timeStamp: Date.now() };
      var list = touch[kind] || [];
      for (var i = 0; i < list.length; i++) list[i](e);
    },
    resize: function () {
      for (var i = 0; i < resizeCbs.length; i++) resizeCbs[i]({});
    },
    canvas: function () { return mainCanvas; }
  };

  window.wx = {
    getSystemInfoSync: function () { return info; },
    getSystemInfo: function (o) { if (o && o.success) o.success(info); },

    createCanvas: function () {
      var c = document.createElement('canvas');
      if (!mainCanvas) {
        mainCanvas = c;
        c.width = Math.round(info.windowWidth * Math.min(info.pixelRatio, 2));
        c.height = Math.round(info.windowHeight * Math.min(info.pixelRatio, 2));
        c.style.cssText = 'position:absolute;left:0;top:0;'
          + 'width:' + info.windowWidth + 'px;height:' + info.windowHeight + 'px;';
        document.body.appendChild(c);
        window.__TEST_CANVAS__ = c;
      }
      return c;
    },

    createImage: function () {
      var im = new Image();
      // 真机图片对象没有 naturalWidth / naturalHeight
      try {
        Object.defineProperty(im, 'naturalWidth', { configurable: true, get: function () { return undefined; } });
        Object.defineProperty(im, 'naturalHeight', { configurable: true, get: function () { return undefined; } });
      } catch (e) {}
      return im;
    },

    getStorageSync: function (k) { return store[k] === undefined ? '' : store[k]; },
    setStorageSync: function (k, v) { store[k] = v; },
    removeStorageSync: function (k) { delete store[k]; },
    clearStorageSync: function () { for (var k in store) delete store[k]; },

    onTouchStart: function (f) { touch.start.push(f); },
    onTouchMove: function (f) { touch.move.push(f); },
    onTouchEnd: function (f) { touch.end.push(f); },
    onTouchCancel: function (f) { touch.end.push(f); },
    createWebAudioContext: undefined,
    onWindowResize: function (f) { resizeCbs.push(f); },
    onHide: function () {},
    onShow: function () {},

    vibrateShort: function () {},
    shareAppMessage: function (o) { window.__lastShare = o; },
    onShareAppMessage: function () {},
    showModal: function (o) { window.__lastModal = o; if (o && o.success) o.success({ confirm: true }); },
    getOpenDataContext: function () { return { postMessage: function () {} }; },
    getSharedCanvas: function () { return null; },
    getRecordManager: function () { return null; },
    setUserCloudStorage: function (o) { if (o && o.success) o.success({}); }
  };

  /* 预置一份"脏"的 Web localStorage：idx=3（第 4 单）
   * 适配层如果没强制接管，游戏就会从第 4 单开始 —— 这正是线上那个 bug。 */
  var webStore = {
    'chongyichong.save.v2': JSON.stringify({ coins: 999, idx: 3, level: 9, best: {} })
  };
  try {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: function (k) { return webStore[k] === undefined ? null : webStore[k]; },
        setItem: function (k, v) { webStore[k] = String(v); },
        removeItem: function (k) { delete webStore[k]; },
        clear: function () { for (var k in webStore) delete webStore[k]; }
      }
    });
  } catch (e) {}

  window.__WEBSTORE__ = function () { return webStore; };

  /* 关键：模拟"带参数的 getContext 返回 null"
   * 新版基础库会这样，游戏里没有回退就会整屏黑。 */
  var origGet = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type) {
    if (arguments.length > 1) return null;
    return origGet.call(this, type);
  };
})();
