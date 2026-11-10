/* =====================================================================
 * 开放数据域 · 好友排行榜
 *
 * 这个目录是独立运行的：只能访问 wx.getFriendCloudStorage 等开放接口，
 * 没有 DOM，也不能碰主域的画布。它只往 sharedCanvas 上画，
 * 主域再用 drawImage 把这张画布贴到界面上。
 * =================================================================== */
'use strict';

var sharedCanvas = wx.getSharedCanvas();
var ctx = sharedCanvas.getContext('2d');

// 固定逻辑尺寸，主域按比例缩放到自己的界面里
var W = 640;
var H = 840;
sharedCanvas.width = W;
sharedCanvas.height = H;

var rows = [];
var loading = true;
var avatarCache = {};
var lastError = '';

/* ---------------- 头像 ---------------- */
function avatar(url) {
  if (!url) return null;
  if (avatarCache[url]) return avatarCache[url].ok ? avatarCache[url].img : null;

  var img = wx.createImage();
  avatarCache[url] = { ok: false, img: img };
  img.onload = function () {
    avatarCache[url].ok = true;
    render();
  };
  img.onerror = function () { avatarCache[url].ok = false; };
  img.src = url;
  return null;
}

/* ---------------- 圆形裁剪 ---------------- */
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

var MEDAL = ['#f2b21f', '#b9c4d1', '#c98a3a'];

/* ---------------- 绘制 ---------------- */
function render() {
  ctx.clearRect(0, 0, W, H);

  // 背景
  var bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#f7fbff');
  bg.addColorStop(1, '#eaf3fa');
  ctx.fillStyle = bg;
  roundRect(0, 0, W, H, 28);
  ctx.fill();

  // 标题
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1d2b3a';
  ctx.font = '700 30px sans-serif';
  ctx.fillText('好友排行', 32, 52);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#8aa0b4';
  ctx.font = '500 20px sans-serif';
  ctx.fillText('按等级排序', W - 32, 54);

  if (loading) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8aa0b4';
    ctx.font = '500 22px sans-serif';
    ctx.fillText('读取好友数据…', W / 2, H / 2);
    return;
  }

  if (!rows.length) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8aa0b4';
    ctx.font = '500 22px sans-serif';
    ctx.fillText(lastError || '还没有好友玩过这个游戏', W / 2, H / 2 - 16);
    ctx.font = '400 18px sans-serif';
    ctx.fillStyle = '#a8b8c8';
    ctx.fillText('邀请好友一起来洗车吧', W / 2, H / 2 + 22);
    return;
  }

  // 行
  var top = 96;
  var rowH = 96;
  var maxRows = Math.floor((H - top - 20) / rowH);
  for (var i = 0; i < Math.min(rows.length, maxRows); i++) {
    var r = rows[i];
    var y = top + i * rowH;

    // 卡片底
    ctx.fillStyle = i === 0 ? 'rgba(255,247,224,0.95)' : 'rgba(255,255,255,0.86)';
    roundRect(24, y, W - 48, rowH - 12, 20);
    ctx.fill();

    // 名次
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (i < 3) {
      ctx.fillStyle = MEDAL[i];
      ctx.beginPath();
      ctx.arc(72, y + (rowH - 12) / 2, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 22px sans-serif';
      ctx.fillText(String(i + 1), 72, y + (rowH - 12) / 2 + 1);
    } else {
      ctx.fillStyle = '#9aabbc';
      ctx.font = '700 22px sans-serif';
      ctx.fillText(String(i + 1), 72, y + (rowH - 12) / 2 + 1);
    }

    // 头像
    var av = avatar(r.avatar);
    var ax = 118, ay = y + (rowH - 12) / 2, ar = 28;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (av) {
      ctx.drawImage(av, ax - ar, ay - ar, ar * 2, ar * 2);
    } else {
      ctx.fillStyle = '#dbe6ef';
      ctx.fillRect(ax - ar, ay - ar, ar * 2, ar * 2);
    }
    ctx.restore();

    // 名字
    ctx.textAlign = 'left';
    ctx.fillStyle = '#1d2b3a';
    ctx.font = '600 24px sans-serif';
    var name = r.name || '玩家';
    if (name.length > 8) name = name.slice(0, 8) + '…';
    ctx.fillText(name, 164, y + (rowH - 12) / 2 - 12);

    ctx.fillStyle = '#8aa0b4';
    ctx.font = '400 18px sans-serif';
    ctx.fillText('洗了 ' + r.washes + ' 辆', 164, y + (rowH - 12) / 2 + 16);

    // 等级
    ctx.textAlign = 'right';
    ctx.fillStyle = '#2f86c8';
    ctx.font = '700 26px sans-serif';
    ctx.fillText('Lv.' + r.level, W - 44, y + (rowH - 12) / 2 + 1);
  }
}

/* ---------------- 拉取数据 ---------------- */
function fetchRank() {
  loading = true;
  lastError = '';
  render();

  if (!wx.getFriendCloudStorage) {
    loading = false;
    lastError = '当前环境不支持好友数据';
    render();
    return;
  }

  wx.getFriendCloudStorage({
    keyList: ['level', 'washes'],
    success: function (res) {
      var list = (res && res.data) || [];
      rows = list.map(function (d) {
        var kv = {};
        var kvs = d.KVDataList || [];
        for (var i = 0; i < kvs.length; i++) kv[kvs[i].key] = kvs[i].value;
        return {
          name: d.nickname || '玩家',
          avatar: d.avatarUrl || '',
          level: parseInt(kv.level, 10) || 1,
          washes: parseInt(kv.washes, 10) || 0
        };
      }).sort(function (a, b) {
        return (b.level - a.level) || (b.washes - a.washes);
      });
      loading = false;
      render();
    },
    fail: function (err) {
      loading = false;
      lastError = '读取失败，稍后再试';
      render();
    }
  });
}

/* ---------------- 消息 ---------------- */
wx.onMessage(function (msg) {
  if (!msg || !msg.type) return;
  if (msg.type === 'rank:show') fetchRank();
  if (msg.type === 'rank:hide') {
    /* 主域不再显示时不用做任何事 */
  }
});

render();
