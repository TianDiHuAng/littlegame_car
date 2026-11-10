/* =====================================================================
 * 关卡数据 + 升级表
 * 每个关卡 = 一个剪影 + 一个绘制函数 + 一组污渍配方
 * 换新关卡只需要在这里加一坨数据
 * =================================================================== */
(function (root) {
  'use strict';
  var NS = root.CW = root.CW || {};
  var TAU = Math.PI * 2;

  /* ---------- 画布小工具 ---------- */
  function rr(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function polyPath(c, pts) {
    c.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
  }

  function mapPts(pts, x, y, w, h) {
    var out = [];
    for (var i = 0; i < pts.length; i++) out.push([x + w * pts[i][0], y + h * pts[i][1]]);
    return out;
  }

  function polyBBox(pts) {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (var i = 0; i < pts.length; i++) {
      x0 = Math.min(x0, pts[i][0]); x1 = Math.max(x1, pts[i][0]);
      y0 = Math.min(y0, pts[i][1]); y1 = Math.max(y1, pts[i][1]);
    }
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  }

  /** 朝中心收缩，用来从车厢轮廓得到玻璃轮廓 */
  function insetPoly(pts, kx, ky) {
    var b = polyBBox(pts);
    var cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      out.push([cx + (pts[i][0] - cx) * kx, cy + (pts[i][1] - cy) * ky]);
    }
    return out;
  }

  function lighten(hex, k) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.min(255, Math.round(((n >> 16) & 255) * k));
    var g = Math.min(255, Math.round(((n >> 8) & 255) * k));
    var b = Math.min(255, Math.round((n & 255) * k));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /* ---------- 车辆：一套参数画所有车 ---------- */
  function vehicleSilhouette(c, b, s) {
    var x = b.x, y = b.y, w = b.w, h = b.h;
    rr(c, x, y + h * s.bodyTop, w, h * (s.bodyBottom - s.bodyTop), h * s.bodyR);
    polyPath(c, mapPts(s.cabin, x, y, w, h));
    for (var i = 0; i < s.wheels.length; i++) {
      var cx = x + w * s.wheels[i], cy = y + h * (1 - s.wheelR), rad = h * s.wheelR;
      c.moveTo(cx + rad, cy);
      c.arc(cx, cy, rad, 0, TAU);
    }
  }

  function vehiclePaint(c, b, s) {
    var x = b.x, y = b.y, w = b.w, h = b.h, i;
    var bt = y + h * s.bodyTop, bb = y + h * s.bodyBottom, bh = bb - bt;

    // 接地阴影：用径向渐变，比一块平椭圆柔和很多
    c.save();
    var sh = c.createRadialGradient(x + w * 0.5, y + h * 0.99, 0, x + w * 0.5, y + h * 0.99, w * 0.52);
    sh.addColorStop(0, 'rgba(16,38,26,0.30)');
    sh.addColorStop(0.62, 'rgba(16,38,26,0.14)');
    sh.addColorStop(1, 'rgba(16,38,26,0)');
    c.fillStyle = sh;
    c.beginPath();
    c.ellipse(x + w * 0.5, y + h * 0.99, w * 0.52, h * 0.085, 0, 0, TAU);
    c.fill();
    c.restore();

    for (i = 0; i < s.wheels.length; i++) {
      var cx = x + w * s.wheels[i], cy = y + h - h * s.wheelR, rad = h * s.wheelR;
      c.beginPath(); c.arc(cx, cy, rad, 0, TAU); c.fillStyle = '#2a2f37'; c.fill();
      // 胎侧高光
      c.strokeStyle = 'rgba(255,255,255,0.10)';
      c.lineWidth = rad * 0.16;
      c.beginPath();
      c.arc(cx, cy, rad * 0.84, Math.PI * 1.12, Math.PI * 1.72);
      c.stroke();
      c.beginPath(); c.arc(cx, cy, rad * 0.46, 0, TAU); c.fillStyle = '#cfd9e4'; c.fill();
      c.beginPath(); c.arc(cx, cy, rad * 0.16, 0, TAU); c.fillStyle = '#95a3b1'; c.fill();
    }

    var g = c.createLinearGradient(0, bt, 0, bb);
    g.addColorStop(0, lighten(s.color, 1.14));
    g.addColorStop(0.45, s.color);
    g.addColorStop(1, s.color2);
    c.beginPath(); rr(c, x, bt, w, bh, h * s.bodyR);
    c.fillStyle = g; c.fill();

    // 车身上沿的高光带：一下就有"车漆"的质感
    c.save();
    c.beginPath(); rr(c, x, bt, w, bh, h * s.bodyR); c.clip();
    var hl = c.createLinearGradient(0, bt, 0, bt + bh * 0.34);
    hl.addColorStop(0, 'rgba(255,255,255,0.40)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = hl;
    c.fillRect(x, bt, w, bh * 0.34);
    c.restore();

    var cabPts = mapPts(s.cabin, x, y, w, h);
    c.beginPath(); polyPath(c, cabPts);
    var g2 = c.createLinearGradient(0, y + h * s.bodyTop * 0.1, 0, bt);
    g2.addColorStop(0, lighten(s.color, 1.08));
    g2.addColorStop(1, s.color);
    c.fillStyle = g2; c.fill();

    var glassN = insetPoly(s.cabin, 0.93, 0.74);
    var glassPts = mapPts(glassN, x, y, w, h);
    var gb = polyBBox(glassN);
    c.beginPath(); polyPath(c, glassPts);
    var gg = c.createLinearGradient(0, y + h * gb.y0, 0, y + h * gb.y1);
    gg.addColorStop(0, '#D9EEFF');
    gg.addColorStop(0.5, '#A6CDF0');
    gg.addColorStop(1, '#7FB3E2');
    c.fillStyle = gg; c.fill();

    c.save();
    c.beginPath(); polyPath(c, glassPts); c.clip();
    c.strokeStyle = 'rgba(255,255,255,0.30)';
    c.lineWidth = h * 0.022;
    c.beginPath();
    c.moveTo(x + w * 0.32, y + h * (gb.y1 + 0.01));
    c.lineTo(x + w * 0.38, y + h * (gb.y0 - 0.01));
    c.stroke();
    c.beginPath();
    c.moveTo(x + w * 0.60, y + h * (gb.y1 + 0.01));
    c.lineTo(x + w * 0.66, y + h * (gb.y0 - 0.01));
    c.stroke();
    c.restore();

    var pil = s.pillars || [];
    for (i = 0; i < pil.length; i++) {
      var px = x + w * (gb.x0 + (gb.x1 - gb.x0) * pil[i]);
      c.fillStyle = s.color2;
      c.fillRect(px - w * 0.017, y + h * gb.y0, w * 0.034, h * (gb.y1 - gb.y0));
    }

    if (s.headlight !== false) {
      c.beginPath();
      rr(c, x + w * 0.895, bt + bh * 0.28, w * 0.055, bh * 0.26, h * 0.025);
      c.fillStyle = '#ffeec2'; c.fill();
    }

    if (s.stripe) {
      c.save();
      c.beginPath(); rr(c, x, bt, w, bh, h * s.bodyR); c.clip();
      c.fillStyle = s.stripe;
      c.fillRect(x, bt + bh * 0.52, w, bh * 0.16);
      c.restore();
    }

    if (s.line !== false) {
      c.beginPath();
      c.moveTo(x + w * 0.06, bt + bh * 0.66);
      c.lineTo(x + w * 0.94, bt + bh * 0.66);
      c.strokeStyle = 'rgba(255,255,255,0.32)';
      c.lineWidth = Math.max(1, h * 0.012);
      c.stroke();
    }

    c.save();
    c.beginPath(); rr(c, x, bt, w, bh, h * s.bodyR); c.clip();
    c.fillStyle = 'rgba(0,0,0,0.13)';
    c.fillRect(x, bb - bh * 0.16, w, bh * 0.16);
    c.restore();

    if (s.rack) {
      c.strokeStyle = '#3d4652';
      c.lineWidth = Math.max(2, h * 0.018);
      c.beginPath();
      c.moveTo(x + w * 0.22, y + h * 0.035);
      c.lineTo(x + w * 0.74, y + h * 0.035);
      c.stroke();
      c.beginPath();
      c.moveTo(x + w * 0.30, y + h * 0.035);
      c.lineTo(x + w * 0.30, y + h * 0.075);
      c.moveTo(x + w * 0.66, y + h * 0.035);
      c.lineTo(x + w * 0.66, y + h * 0.075);
      c.stroke();
    }
  }

  function vehicle(s) {
    return {
      silhouette: function (c, b) { vehicleSilhouette(c, b, s); },
      paint: function (c, b) { vehiclePaint(c, b, s); }
    };
  }

  /* ---------- 砖墙 ---------- */
  function brickWall() {
    return {
      silhouette: function (c, b) { rr(c, b.x, b.y, b.w, b.h, 8); },
      paint: function (c, b) {
        var x = b.x, y = b.y, w = b.w, h = b.h;
        c.save();
        c.beginPath(); rr(c, x, y, w, h, 8); c.clip();
        c.fillStyle = '#efe0c8';
        c.fillRect(x, y, w, h);

        var rows = 8, cols = 5;
        var bh = h / rows, bw = w / cols;
        for (var r = 0; r < rows; r++) {
          var off = (r % 2) ? -bw / 2 : 0;
          for (var i = -1; i <= cols; i++) {
            var bx = x + i * bw + off + 2;
            var by = y + r * bh + 2;
            var v = 0.9 + Math.random() * 0.1;
            c.fillStyle = 'rgb(' + ((212 * v) | 0) + ',' + ((178 * v) | 0) + ',' + ((146 * v) | 0) + ')';
            c.beginPath(); rr(c, bx, by, bw - 4, bh - 4, 3); c.fill();
          }
        }
        c.restore();

        c.strokeStyle = 'rgba(150,118,88,0.55)';
        c.lineWidth = 2;
        c.beginPath(); rr(c, x, y, w, h, 8); c.stroke();
      }
    };
  }

  /* ---------- 陶罐 ---------- */
  var VASE = {
    silhouette: function (c, b) {
      var x = b.x, y = b.y, w = b.w, h = b.h;
      c.moveTo(x + w * 0.5, y + h * 0.16);
      c.bezierCurveTo(x - w * 0.05, y + h * 0.26, x + w * 0.02, y + h * 0.92, x + w * 0.5, y + h * 0.99);
      c.bezierCurveTo(x + w * 0.98, y + h * 0.92, x + w * 1.05, y + h * 0.26, x + w * 0.5, y + h * 0.16);
      c.closePath();
      c.moveTo(x + w * 0.33, y + h * 0.055);
      c.lineTo(x + w * 0.67, y + h * 0.055);
      c.lineTo(x + w * 0.60, y + h * 0.20);
      c.lineTo(x + w * 0.40, y + h * 0.20);
      c.closePath();
    },
    paint: function (c, b) {
      var x = b.x, y = b.y, w = b.w, h = b.h;

      c.save();
      c.globalAlpha = 0.15;
      c.fillStyle = '#1d3346';
      c.beginPath(); c.ellipse(x + w * 0.5, y + h * 0.99, w * 0.38, h * 0.04, 0, 0, TAU); c.fill();
      c.restore();

      c.beginPath();
      c.moveTo(x + w * 0.5, y + h * 0.16);
      c.bezierCurveTo(x - w * 0.05, y + h * 0.26, x + w * 0.02, y + h * 0.92, x + w * 0.5, y + h * 0.99);
      c.bezierCurveTo(x + w * 0.98, y + h * 0.92, x + w * 1.05, y + h * 0.26, x + w * 0.5, y + h * 0.16);
      c.closePath();
      var g = c.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, '#2b8492');
      g.addColorStop(0.32, '#5cbfcb');
      g.addColorStop(0.58, '#8adde2');
      g.addColorStop(1, '#26707e');
      c.fillStyle = g; c.fill();

      c.beginPath();
      c.moveTo(x + w * 0.33, y + h * 0.055);
      c.lineTo(x + w * 0.67, y + h * 0.055);
      c.lineTo(x + w * 0.60, y + h * 0.20);
      c.lineTo(x + w * 0.40, y + h * 0.20);
      c.closePath();
      c.fillStyle = '#3f9dab'; c.fill();

      c.beginPath();
      c.ellipse(x + w * 0.5, y + h * 0.055, w * 0.17, h * 0.02, 0, 0, TAU);
      c.fillStyle = '#96e6e8'; c.fill();

      c.strokeStyle = 'rgba(255,255,255,0.55)';
      c.lineWidth = Math.max(2, h * 0.012);
      c.beginPath(); c.ellipse(x + w * 0.5, y + h * 0.56, w * 0.30, h * 0.04, 0, 0, Math.PI); c.stroke();
      c.beginPath(); c.ellipse(x + w * 0.5, y + h * 0.72, w * 0.24, h * 0.03, 0, 0, Math.PI); c.stroke();

      c.save();
      c.globalAlpha = 0.35;
      c.fillStyle = '#ffffff';
      c.beginPath(); c.ellipse(x + w * 0.34, y + h * 0.46, w * 0.05, h * 0.15, -0.2, 0, TAU); c.fill();
      c.restore();
    }
  };

  /* ---------- 老窗户 ---------- */
  var WINDOW = {
    silhouette: function (c, b) { rr(c, b.x, b.y, b.w, b.h, 6); },
    paint: function (c, b) {
      var x = b.x, y = b.y, w = b.w, h = b.h;
      var fr = Math.min(w, h) * 0.07;

      c.beginPath(); rr(c, x, y, w, h, 6);
      c.fillStyle = '#8d6e4e'; c.fill();

      var gx = x + fr, gy = y + fr, gw = w - fr * 2, gh = h - fr * 2;
      var g = c.createLinearGradient(gx, gy, gx + gw, gy + gh);
      g.addColorStop(0, '#cfe9ff');
      g.addColorStop(0.5, '#a9d3f0');
      g.addColorStop(1, '#8bbde4');
      c.fillStyle = g;
      c.fillRect(gx, gy, gw, gh);

      c.fillStyle = '#8d6e4e';
      c.fillRect(x + w * 0.5 - fr * 0.32, gy, fr * 0.64, gh);
      c.fillRect(gx, y + h * 0.44 - fr * 0.32, gw, fr * 0.64);

      c.save();
      c.beginPath(); c.rect(gx, gy, gw, gh); c.clip();
      c.strokeStyle = 'rgba(255,255,255,0.5)';
      c.lineWidth = fr * 0.5;
      c.beginPath();
      c.moveTo(gx + gw * 0.15, gy + gh);
      c.lineTo(gx + gw * 0.45, gy);
      c.stroke();
      c.restore();

      c.fillStyle = '#77593c';
      c.fillRect(x - w * 0.04, y + h, w * 1.08, Math.max(6, h * 0.05));
    }
  };

  /* ---------- 轮毂 ---------- */
  var HUB = {
    silhouette: function (c, b) {
      var r = Math.min(b.w, b.h) * 0.5;
      var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      c.moveTo(cx + r, cy);
      c.arc(cx, cy, r, 0, TAU);
    },
    paint: function (c, b) {
      var r = Math.min(b.w, b.h) * 0.5;
      var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      var i;

      c.beginPath(); c.arc(cx, cy, r, 0, TAU);
      c.fillStyle = '#2a2f37'; c.fill();

      c.strokeStyle = '#3d434e';
      c.lineWidth = r * 0.03;
      for (i = 0; i < 28; i++) {
        var a = i / 28 * TAU;
        c.beginPath();
        c.moveTo(cx + Math.cos(a) * r * 0.86, cy + Math.sin(a) * r * 0.86);
        c.lineTo(cx + Math.cos(a) * r * 0.96, cy + Math.sin(a) * r * 0.96);
        c.stroke();
      }

      c.beginPath(); c.arc(cx, cy, r * 0.72, 0, TAU);
      c.fillStyle = '#cfd9e4'; c.fill();

      c.save();
      c.fillStyle = '#aab6c4';
      for (i = 0; i < 5; i++) {
        var ang = i / 5 * TAU - Math.PI / 2;
        c.save();
        c.translate(cx, cy);
        c.rotate(ang);
        c.beginPath();
        c.moveTo(-r * 0.10, -r * 0.22);
        c.lineTo(r * 0.10, -r * 0.22);
        c.lineTo(r * 0.16, -r * 0.68);
        c.lineTo(-r * 0.16, -r * 0.68);
        c.closePath();
        c.fill();
        c.restore();
      }
      c.restore();

      c.beginPath(); c.arc(cx, cy, r * 0.26, 0, TAU);
      c.fillStyle = '#8b98a8'; c.fill();
      c.beginPath(); c.arc(cx, cy, r * 0.12, 0, TAU);
      c.fillStyle = '#cfd9e4'; c.fill();

      c.fillStyle = '#6d7a8a';
      for (i = 0; i < 5; i++) {
        var a2 = i / 5 * TAU + 0.3;
        c.beginPath();
        c.arc(cx + Math.cos(a2) * r * 0.19, cy + Math.sin(a2) * r * 0.19, r * 0.045, 0, TAU);
        c.fill();
      }
    }
  };

  /* ---------- 污渍配方 ---------- */
  var MUD = {
    palette: ['rgba(96,76,50,0.72)', 'rgba(122,98,64,0.62)', 'rgba(70,58,44,0.78)',
      'rgba(142,118,82,0.52)', 'rgba(58,48,38,0.66)'],
    film: 'rgba(92,74,52,0.68)',
    soft: true
  };
  var DUST = {
    palette: ['rgba(140,132,118,0.55)', 'rgba(110,104,94,0.5)', 'rgba(160,152,138,0.42)',
      'rgba(92,88,80,0.55)'],
    film: 'rgba(120,114,104,0.60)',
    soft: true
  };
  var GRAFFITI = {
    palette: ['rgba(255,77,141,0.85)', 'rgba(77,210,255,0.8)', 'rgba(182,255,61,0.8)',
      'rgba(255,217,61,0.85)', 'rgba(166,107,255,0.8)', 'rgba(255,138,61,0.8)'],
    film: 'rgba(120,110,100,0.54)',
    soft: false
  };
  var GREASE = {
    palette: ['rgba(48,44,40,0.9)', 'rgba(62,54,44,0.85)', 'rgba(38,36,32,0.9)',
      'rgba(84,70,50,0.7)'],
    film: 'rgba(60,54,46,0.66)',
    soft: true
  };

  /* ---------- 10 个关卡 ---------- */
  NS.LEVELS = [
    {
      id: 'sedan', name: '小红轿车', water: 620,
      sky: ['#d6efff', '#a2d5f3'], groundY: 0.745, ground: ['#93d7ab', '#5cb27f'],
      bounds: { x: 0.05, y: 0.33, w: 0.90, h: 0.37 },
      art: vehicle({
        color: '#f2634d', color2: '#c9402e',
        bodyTop: 0.36, bodyBottom: 0.86, bodyR: 0.13,
        cabin: [[0.19, 0.38], [0.25, 0.13], [0.29, 0.04], [0.43, 0.02],
          [0.57, 0.02], [0.69, 0.04], [0.75, 0.13], [0.81, 0.38]],
        wheels: [0.27, 0.73], wheelR: 0.14, pillars: [0.5]
      }),
      dirt: { density: 0.3, cover: 0.4, recipe: MUD, streaks: 8, specks: 150 },
      grease: []
    },

    {
      id: 'van', name: '小黄面包', water: 540,
      sky: ['#e8f7ff', '#b9e2f7'], groundY: 0.745, ground: ['#a6dcb8', '#69bf8c'],
      bounds: { x: 0.05, y: 0.30, w: 0.90, h: 0.40 },
      art: vehicle({
        color: '#f7c948', color2: '#d9a521',
        bodyTop: 0.30, bodyBottom: 0.86, bodyR: 0.09,
        cabin: [[0.07, 0.32], [0.09, 0.05], [0.13, 0.02], [0.86, 0.02], [0.92, 0.05], [0.94, 0.32]],
        wheels: [0.22, 0.78], wheelR: 0.13, pillars: [0.38, 0.62]
      }),
      dirt: { density: 0.38, cover: 0.5, recipe: MUD, streaks: 12, specks: 180 },
      grease: [[0.30, 0.62, 0.05]]
    },


    {
      id: 'coupe', name: '蓝跑车', water: 430,
      sky: ['#e6f0ff', '#b7cdf5'], groundY: 0.75, ground: ['#9ec9e8', '#6aa3cd'],
      bounds: { x: 0.04, y: 0.34, w: 0.92, h: 0.36 },
      art: vehicle({
        color: '#4a86e8', color2: '#2f5fb0',
        bodyTop: 0.42, bodyBottom: 0.87, bodyR: 0.16,
        cabin: [[0.24, 0.44], [0.30, 0.20], [0.34, 0.09], [0.46, 0.06],
          [0.58, 0.06], [0.68, 0.10], [0.72, 0.20], [0.75, 0.44]],
        wheels: [0.26, 0.74], wheelR: 0.15, pillars: [0.5]
      }),
      dirt: { density: 0.46, cover: 0.6, recipe: MUD, streaks: 10, specks: 200 },
      grease: [[0.28, 0.60, 0.05], [0.70, 0.58, 0.055]]
    },


    {
      id: 'jeep', name: '绿越野车', water: 300,
      sky: ['#f3f7e6', '#d6e6bd'], groundY: 0.76, ground: ['#b3a972', '#8a8250'],
      bounds: { x: 0.04, y: 0.31, w: 0.92, h: 0.40 },
      art: vehicle({
        color: '#5fa86f', color2: '#3f7d52',
        bodyTop: 0.34, bodyBottom: 0.84, bodyR: 0.07,
        cabin: [[0.16, 0.36], [0.17, 0.08], [0.21, 0.04], [0.71, 0.04], [0.77, 0.08], [0.80, 0.36]],
        wheels: [0.25, 0.75], wheelR: 0.17, pillars: [0.46], rack: true
      }),
      dirt: { density: 0.54, cover: 0.7, recipe: MUD, streaks: 18, specks: 240 },
      grease: [[0.25, 0.58, 0.055], [0.62, 0.62, 0.06]]
    },


    {
      id: 'truck', name: '白货车', water: 265,
      sky: ['#e9f3ff', '#bfd8f2'], groundY: 0.76, ground: ['#a9c4b6', '#7c9c8c'],
      bounds: { x: 0.03, y: 0.30, w: 0.94, h: 0.40 },
      art: vehicle({
        color: '#eef2f7', color2: '#c9d2dd',
        bodyTop: 0.28, bodyBottom: 0.86, bodyR: 0.05,
        cabin: [[0.05, 0.30], [0.06, 0.03], [0.89, 0.03], [0.94, 0.30]],
        wheels: [0.19, 0.81], wheelR: 0.13, pillars: [0.32, 0.62],
        stripe: '#4f9dc4', line: false
      }),
      dirt: { density: 0.6, cover: 0.78, recipe: MUD, streaks: 22, specks: 260 },
      grease: [[0.22, 0.60, 0.055], [0.52, 0.55, 0.05], [0.78, 0.62, 0.06]]
    },

    {
      id: 'hub', name: '脏轮毂', water: 165,
      sky: ['#f0f4f8', '#cdd9e5'], groundY: 0.74, ground: ['#c3cedb', '#9aa8b8'],
      bounds: { x: 0.20, y: 0.29, w: 0.60, h: 0.42 },
      art: HUB,
      dirt: { density: 0.66, cover: 0.85, recipe: GREASE, streaks: 8, specks: 200 },
      grease: [[0.42, 0.45, 0.07], [0.58, 0.58, 0.06]]
    },

    {
      id: 'black', name: '黑武士', water: 215,
      sky: ['#dfe6f0', '#9fb0c8'], groundY: 0.755, ground: ['#8f9aa8', '#6b7482'],
      bounds: { x: 0.04, y: 0.33, w: 0.92, h: 0.37 },
      art: vehicle({
        color: '#3f4551', color2: '#23272f',
        bodyTop: 0.38, bodyBottom: 0.87, bodyR: 0.10,
        cabin: [[0.20, 0.40], [0.26, 0.14], [0.31, 0.04], [0.45, 0.02],
          [0.58, 0.02], [0.70, 0.05], [0.76, 0.15], [0.81, 0.40]],
        wheels: [0.26, 0.74], wheelR: 0.15, pillars: [0.5]
      }),
      dirt: { density: 0.74, cover: 0.92, recipe: MUD, streaks: 26, specks: 280 },
      grease: [[0.24, 0.58, 0.06], [0.50, 0.62, 0.055], [0.74, 0.56, 0.06]]
    }
  ];

  /* ---------- 区域化脏污 ----------
   * 同一张图，只脏某个部位，就是新关卡。零新增美术。
   * 想加关：在这下面再补一条 region(...) 即可。 */
  (function () {
    var byId = {};
    for (var i = 0; i < NS.LEVELS.length; i++) byId[NS.LEVELS[i].id] = NS.LEVELS[i];

    function region(base, id, name, regions, density, water, grease) {
      return {
        id: id, name: name, water: water,
        sky: base.sky, groundY: base.groundY, ground: base.ground,
        bounds: base.bounds, art: base.art,
        dirt: {
          density: density, recipe: base.dirt.recipe,
          streaks: base.dirt.streaks, specks: base.dirt.specks,
          regions: regions
        },
        grease: grease || []
      };
    }

    NS.LEVELS.push(
      region(byId.sedan, 'sedan_wheel', '轮毂精洗',
        [[0.16, 0.58, 0.26, 0.42], [0.60, 0.58, 0.26, 0.42]], 1.05, 150,
        [[0.30, 0.78, 0.055]]),

      region(byId.coupe, 'coupe_top', '只洗上半身',
        [[0.05, 0.0, 0.90, 0.52]], 0.80, 220,
        [[0.30, 0.30, 0.05]]),

      region(byId.truck, 'truck_glass', '只擦玻璃',
        [[0.04, 0.02, 0.92, 0.32]], 0.95, 130, []),

      region(byId.black, 'black_bottom', '只剩下半身',
        [[0.0, 0.46, 1.0, 0.54]], 0.90, 150,
        [[0.30, 0.70, 0.055], [0.66, 0.72, 0.05]]),

      region(byId.van, 'van_lower', '面包车下半身',
        [[0.0, 0.44, 1.0, 0.56]], 0.78, 175,
        [[0.34, 0.74, 0.05]]),

      region(byId.jeep, 'jeep_side', '越野车侧面',
        [[0.0, 0.30, 1.0, 0.52]], 0.82, 190,
        [[0.30, 0.62, 0.05], [0.68, 0.60, 0.045]]),

      region(byId.black, 'black_top', '黑武士车顶',
        [[0.0, 0.0, 1.0, 0.46]], 0.88, 165,
        [[0.28, 0.28, 0.05]])
    );
  })();

  /* ---------- 污渍类型分布 ----------
   * 软泥 → 冲洗   厚泥 → 泡沫   硬垢 → 刮刀   漆损 → 补漆
   * 一种脏只认一把工具，这样每把工具才有存在感 */
  (function () {
    var HEAVY = {
      van: 0.9, jeep: 1.05, truck: 1.1, black: 1.2,
      black_bottom: 1.2, sedan_wheel: 1.2
    };
    var PAINT = {
      coupe: [[0.34, 0.56, 0.05], [0.62, 0.52, 0.045]],
      jeep: [[0.30, 0.62, 0.045], [0.66, 0.58, 0.05]],
      black: [[0.28, 0.60, 0.05], [0.55, 0.55, 0.045], [0.74, 0.62, 0.04]],
      sedan_wheel: [[0.28, 0.80, 0.05]],
      black_bottom: [[0.30, 0.70, 0.05], [0.66, 0.72, 0.045]],
      truck: [[0.30, 0.55, 0.045], [0.62, 0.60, 0.05]]
    };

    for (var i = 0; i < NS.LEVELS.length; i++) {
      var lv = NS.LEVELS[i];
      if (HEAVY[lv.id]) {
        lv.heavy = {
          density: HEAVY[lv.id],
          region: [[0.02, 0.46, 0.96, 0.54]]
        };
      }
      if (PAINT[lv.id]) lv.paint = PAINT[lv.id];
    }
  })();

  /* ---------- 一单多车 ----------
   * fleet 里按顺序放关卡 id，共用一个水箱。
   * 第一辆省下来的水，就是第二辆的余量。 */
  NS.LEVELS.push(
    {
      id: 'combo_sedan_van', name: '双车套餐', water: 780,
      fleet: ['sedan', 'van']
    },
    {
      id: 'combo_jeep_truck', name: '大活：两辆车', water: 480,
      fleet: ['jeep', 'truck']
    }
  );

  /* ---------- id 索引（多车订单要按 id 找子关卡） ---------- */
  NS.LEVEL_INDEX = {};
  for (var li = 0; li < NS.LEVELS.length; li++) {
    NS.LEVEL_INDEX[NS.LEVELS[li].id] = NS.LEVELS[li];
  }

  /* ---------- 位图素材（assets.js 生成后才有） ----------
   * art.img：用位图替换矢量绘制，位图的 alpha 直接当污渍遮罩
   * bg：整屏背景图；dirt.tex：污渍贴图 */
  (function () {
    var ART = {
      sedan: 'car_sedan', van: 'car_van', coupe: 'car_coupe',
      jeep: 'car_jeep', truck: 'car_truck', black: 'car_black',
      wall: 'brick_wall', vase: 'vase', window: 'window', hub: 'hub'
    };
    var BG = {
      sedan: 'bg_outdoor', van: 'bg_outdoor', truck: 'bg_outdoor',
      black: 'bg_outdoor', wall: 'bg_outdoor',
      coupe: 'bg_dawn', vase: 'bg_dawn',
      jeep: 'bg_dusk', window: 'bg_dusk', hub: 'bg_dusk'
    };

    for (var i = 0; i < NS.LEVELS.length; i++) {
      var lv = NS.LEVELS[i];
      if (ART[lv.id]) lv.art.img = ART[lv.id];
      if (BG[lv.id]) lv.bg = BG[lv.id];
    }

    // 污渍贴图按配方挂上
    MUD.tex = 'dirt_soft';
    DUST.tex = 'dirt_soft';
    GREASE.tex = 'grime_hard';
    // GRAFFITI 保持程序化：涂鸦要的是硬边色块，贴图反而糊
  })();

  /* ---------- 升级表 ----------
   * 幅度刻意保守：满级约等于两倍效率。
   * 幅度太大会让"升满"直接吃掉游戏内容。 */
  NS.UPGRADES = [
    {
      key: 'pressure', name: '水压', icon: '💦', max: 5,
      costs: [60, 130, 240, 400],
      effect: function (lv) {
        return '冲洗范围 ' + (7.6 + 0.7 * (lv - 1)).toFixed(1) + '% 屏宽';
      },
      next: function (lv) {
        return '→ ' + (7.6 + 0.7 * lv).toFixed(1) + '%';
      }
    },
    {
      key: 'nozzle', name: '喷嘴', icon: '🔫', max: 5,
      costs: [60, 130, 240, 400],
      effect: function (lv) {
        return '顺滑度 ' + lv + '/5 · 快划不留断点';
      },
      next: function (lv) {
        return '→ ' + (lv + 1) + '/5';
      }
    },
    {
      key: 'detergent', name: '刮刀头', icon: '🔧', max: 5,
      costs: [60, 130, 240, 400],
      effect: function (lv) {
        return '硬垢刮除 ×' + [0.55, 0.9, 1.3, 1.8, 2.4][lv - 1];
      },
      next: function (lv) {
        return '→ ×' + [0.55, 0.9, 1.3, 1.8, 2.4][lv];
      }
    }
  ];

})(typeof window !== 'undefined' ? window : this);
