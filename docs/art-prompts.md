# 《亮车计划》素材提示词 · 详细版（本地 MiniMax H3 实测通过）

> 本文所有提示词都在本机 ComfyUI 的 **MiniMax H3 文生图** 上跑过，参数一致，可直接复制使用。
> 单张耗时约 **44 秒**，分辨率 1216×832。

---

## 0. 实测结论（先看这段，能省很多试错）

| 项 | 实测值 | 说明 |
|---|---|---|
| 模型 | `minimax_h3_fl2va_pruned_int8_convrot` | 工作流用的是 fl2va 版，实测可出静图 |
| 文本编码器 | `qwen3vl_32b_minimax_h3_nvfp4_awq` | 中英文都吃，英文更稳 |
| VAE | `minimax_h3_video_vae_fp16` | 音频 VAE 不需要 |
| LoRA | `minimax_h3_fl2v_turbo_8step_v1.0` | **必须开**，8 步就够 |
| 采样 | `res_multistep` + `simple` | 模板默认 |
| 步数 | **8** | 开 Turbo LoRA 的前提 |
| 尺寸 | **1216×832** | 横向，适合车 |
| 耗时 | **44 秒** | 一张 |

### ⚠️ 两个实测踩到的坑

**坑 1：模型不听「纯绿 #00FF00」。**

我在提示词里明确写了 `plain solid bright green background (#00FF00)`，实际产出是 **rgb(85,227,132)** —— 一个莫兰迪薄荷绿，还带轻微暗角。

所以**不要指望生成纯绿**，抠像要用**色相判定**，不是"到纯绿的距离"。我已经把抠像改成：

```js
const mx = Math.max(r, b);
const diff = g - mx;          // 绿色比红蓝高多少
if (diff > 40)  alpha = 0;    // 绿得明显 → 全透明
else if (diff > 12) alpha = (40 - diff) / 28;   // 边缘过渡
g = Math.min(g, mx);          // 去绿边
```

按这个判定，背景（85,227,132）的 `diff = 95` → 直接透明；车身红（200,60,60）的 `diff = -140` → 完全保留。实测角落 alpha=0，主体 255，边缘无绿边。

**坑 2：会加暗角。**

提示词里写 `no vignette` 也没用，它会给背景加一圈更暗的绿。色相判定不受影响，但如果素材要当背景用，得注意。

---

## 1. 通用规范（所有素材）

### 1.1 画面规格

```
Game asset illustration, a single complete object, centered,
isolated on a flat uniform green background,
no ground plane, no cast shadow, no reflection, no vignette,
no text, no watermark, no logos, no border, no frame.
```

这一段是**每条提示词的开头和结尾**，不要省。它解决三件事：只有一个主体、没有地面和投影、没有文字水印。

### 1.2 风格锚（决定所有素材像不像一套）

**英文（生图用这个）**

```
Cute cartoon game illustration style, chunky rounded shapes, soft matte flat
shading with gentle gradients, no black outlines, low-saturation pastel palette,
soft rim light from the upper-left, orthogonal view with no perspective distortion,
clean crisp edges, high-quality vector-like rendering.
```

**中文（对照理解，不用贴进提示词）**

> 可爱的卡通插画风，圆润厚重的造型，柔和的哑光平涂加渐变，没有黑色描边，
> 低饱和马卡龙配色，左上方柔和轮廓光，正交视角无透视变形，边缘干净，接近矢量质感。

### 1.3 视角约定（**最重要的一条**）

所有车的**车头一律朝右、纯侧面、同一机位、同一高度**。

一批素材如果视角不统一，摆在一起就会像"从不同游戏里抠来的"，比风格不统一更糟。

---

## 2. 车辆（6 张）

通用参数：`1216×832` · `8 steps` · 车头朝右 · 纯侧面。

### 2.1 小红轿车 sedan

```
Game asset illustration, a single complete object, isolated on a flat uniform green background, no ground plane, no cast shadow, no vignette, no text, no watermark.

A cute cartoon red sedan car, pure side view, facing right, orthogonal view with no perspective distortion, chunky rounded proportions, four-door sedan silhouette.

Body: soft matte red, with a gentle vertical gradient from warm coral red on the roof and upper body down to deep crimson at the lower body and bumpers. A single thin pale-salmon crease line runs horizontally along the side. No black outlines.

Cabin: two large side windows and a small triangular rear quarter window, pale ice-blue tinted glass with two thin diagonal white reflection streaks. Windows separated by body-colored pillars. A soft cream-colored highlight runs along the top edge of the roof.

Wheels: two dark charcoal tires, each with a silver five-spoke star-pattern rim, a thin silver outer ring, and a soft white crescent highlight on the sidewall. Matching wheel arches cut into the body.

Lights: a small rounded trapezoid warm-yellow headlight at the upper front corner, a slim pale rear light at the back.

Style: cute cartoon game illustration, chunky rounded shapes, soft matte flat shading with gentle gradients, no black outlines, low-saturation pastel palette, soft rim light from the upper-left, crisp clean edges, high-quality vector-like rendering.

no text, no watermark, no logos, no background scenery.
```

### 2.2 小黄面包车 van

```
[通用规范]
A cute cartoon small delivery van, pure side view, facing right, orthogonal view,
boxy tall silhouette with a flat roof and a nearly vertical front.

Body: soft butter yellow with a gentle vertical gradient from pale lemon on the roof
to golden mustard at the lower body. A single horizontal crease line along the side.

Cabin: three tall rectangular side windows in a row, pale ice-blue tinted glass with
thin diagonal white reflections, separated by two body-colored pillars.

Wheels: two dark charcoal tires with silver five-spoke rims and white sidewall highlights.

Lights: a small rectangular warm-yellow headlight at the upper front.

[风格锚]
```

### 2.3 蓝跑车 coupe

```
[通用规范]
A cute cartoon two-door sports coupe, pure side view, facing right, orthogonal view,
low sleek silhouette with a fastback roof sloping down to a short rear deck.

Body: soft sky blue with a gentle vertical gradient from light periwinkle on the roof
to deeper cobalt at the bottom. A thin silver side crease line.

Cabin: one long side window split by a single body-colored B-pillar, pale ice-blue glass
with a bold diagonal white reflection streak.

Wheels: two wide dark charcoal tires with silver five-spoke rims, slightly larger than
a sedan's, with white crescent sidewall highlights.

Lights: a slim angular warm-yellow headlight at the front, a thin red tail light strip.

[风格锚]
```

### 2.4 绿越野车 jeep

```
[通用规范]
A cute cartoon off-road SUV, pure side view, facing right, orthogonal view,
tall boxy silhouette with a high ground clearance and a roof rack.

Body: muted olive green with a gentle vertical gradient, matte finish, chunky plastic
wheel arch flares in darker olive. **Avoid bright pure green.**

Cabin: two upright rectangular side windows in pale ice-blue glass.

Wheels: two oversized chunky dark charcoal tires with five-spoke silver rims and deep
tread pattern visible on the sidewall.

Extras: a slim roof rack on top, a small squared warm-yellow headlight.

[风格锚]
```

> ⚠️ 这是唯一有绿色车身的，提示词里已经写了 muted olive，**不要改成 bright green**，否则会被色相抠像误伤。

### 2.5 白货车 truck

```
[通用规范]
A cute cartoon box truck, pure side view, facing right, orthogonal view,
very long boxy body with a tall rectangular cargo compartment.

Body: soft off-white with very subtle cool gray shading, a wide horizontal teal-blue
decorative stripe running along the middle of the cargo box, slightly darker gray at
the bottom edge.

Cabin: a short cab with one large side window and a small windshield visible at an
angle, pale ice-blue glass.

Wheels: two dark charcoal tires with silver five-spoke rims.

Lights: a small warm-yellow headlight at the front bumper.

[风格锚]
```

### 2.6 黑武士 black sedan

```
[通用规范]
A cute cartoon dark charcoal black sedan, pure side view, facing right, orthogonal view,
low athletic silhouette.

Body: deep charcoal gray with a subtle cool blue sheen, gentle vertical gradient from
lighter graphite on top to near-black at the bottom, a thin light-gray side crease line.

Cabin: two side windows with dark blue tinted glass and faint white reflections.

Wheels: two dark charcoal tires with silver five-spoke rims and bright white crescent
highlights to separate the tire from the dark body.

Lights: a slim warm-yellow headlight at the front.

[风格锚]
```

---

## 3. 器物（4 张）

### 3.1 涂鸦墙 brick wall

```
[通用规范]
A flat front-facing view of a clean empty brick wall, rectangular, filling most of the
frame, orthogonal, no perspective.

Warm cream-beige bricks laid in a regular running bond pattern, thin light-gray mortar
lines, subtle per-brick color variation, softly rounded corners on the outer edges,
a few subtle worn spots and tiny chips on the surface.

Even front lighting, no cast shadows.

[风格锚]
```
> **这张墙必须是干净的。** 涂鸦是"污渍"，由贴图层负责，墙本身不要画任何图案。

### 3.2 陶罐 vase

```
[通用规范]
A front-facing celadon ceramic vase, symmetrical, orthogonal view, no perspective.

Silhouette: a rounded full belly at the widest point, tapering to a narrow neck with a
slightly flared rim, a small flat foot.

Surface: soft teal celadon glaze with a gentle sheen, a broad soft highlight on the left
side, two shallow horizontal decorative bands incised around the belly, faint crackle
texture in the glaze.

[风格锚]
```

### 3.3 老窗户 window

```
[通用规范]
A front-facing old wooden window, tall vertical rectangle, orthogonal view, no perspective.

Frame: warm dark-brown wood with visible grain, a chunky outer frame and a cross-shaped
mullion dividing the glass into four panes, a small sill protruding at the bottom.

Glass: pale ice-blue with a soft diagonal reflection and slight unevenness, a couple of
tiny imperfections.

[风格锚]
```

### 3.4 轮毂 hubcap

```
[通用规范]
A front-facing car wheel, perfectly circular, orthogonal view, centered.

Outside: a thick dark charcoal rubber tire ring with a subtle tread pattern on the edge.

Inside: a silver-gray five-spoke alloy rim, each spoke a tapered triangular blade radiating
from the center, a round center cap with five small bolts around it, a thin machined outer lip.

Soft bright highlight on the upper-left, metal sheen.

[风格锚]
```

---

## 4. 污渍贴图（4 张）—— 最影响爽感的一组

这四张决定"脏 → 净"的对比强度。要求：**不规则、边缘柔和、能任意缩放叠加、不要填满画面**。

### 4.1 软泥 mud_soft

```
[通用规范]
A single irregular splatter of wet mud, warm brown to deep umber,
soft feathered edges with uneven density, darker in the thick center and lighter
toward the edges, with dozens of tiny satellite specks and a few thin splatter tails
radiating outward.

Shape: roughly horizontal, organic, asymmetric, covering about 60% of the frame with
generous empty margin around it.

Slightly glossy wet highlights on the thickest parts.

[风格锚]
```

### 4.2 厚泥壳 mud_heavy

```
[通用规范]
A single irregular patch of dried cracked mud crust, cool gray-brown,
thick and chunky with visible depth along the edges, a dense network of fine cracks
across the surface, small lifted flakes and curled edges.

Shape: a lumpy irregular blob covering about 60% of the frame with empty margin.

Matte, dry, no gloss.

[风格锚]
```

### 4.3 硬垢 grime_hard

```
[通用规范]
A single blob of hard black tar-like grime, glossy and reflective,
uneven raised surface with sharp specular highlights, irregular jagged edges,
a few small hardened droplets around the border.

Shape: roughly circular, covering about 50% of the frame with empty margin.

Wet black sheen, strong highlight on the upper-left.

[风格锚]
```

### 4.4 漆损 paint_damage

```
[通用规范]
A single patch of chipped car paint, exposing gray primer underneath,
irregular flaking edges with thin cracked paint lips curling outward,
small hairline cracks radiating from the chip.

Colors: gray primer core, thin lighter edge where the paint layer is exposed.

Shape: irregular blob covering about 45% of the frame with empty margin.

[风格锚]
```

---

## 5. 特效（3 张）

### 5.1 水花 splash

```
[通用规范]
A burst of white water splashing outward, dozens of droplets of varied sizes flying
radially, thin translucent streaks, fine mist at the edges,
bright white core fading to transparent tips.

Shape: a radial burst covering about 70% of the frame.

Semi-transparent, no outline.

[风格锚]
```

### 5.2 泡沫 foam

```
[通用规范]
A single cluster of white soap foam, fluffy and soft,
made of many overlapping round bubbles of different sizes, a few bubbles popping at
the edges, soft shadowed crevices between bubbles giving volume.

Shape: a rounded irregular cluster covering about 60% of the frame.

Soft matte white, subtle blue-gray shading in the crevices.

[风格锚]
```

### 5.3 水柱 jet

```
[通用规范]
A straight high-pressure water jet, a long tapered white streak from upper-right to
lower-left, a dense bright core with a soft translucent halo, dozens of tiny droplets
peeling off along its length, a fine mist spray at the impact end.

Semi-transparent, no outline, no hard edges.

[风格锚]
```

---

## 6. 背景（4 张）

**整屏铺满，不需要绿幕**，参数 `832×1216`（竖版）。

### 6.1 户外通用户外 outdoor_day

```
A soft cartoon game background, portrait orientation 9:16, wide open outdoor scene.

Sky: a smooth vertical gradient from pale sky blue at the top to slightly warmer light
blue near the horizon, a few large soft white clouds with gentle shading, a warm glow
in the upper right.

Distance: two layers of rolling hills, the far layer a muted blue-green, the near layer
a slightly lighter green-blue, both with soft rounded silhouettes.

Ground: a broad smooth green meadow filling the lower third, gentle gradient from
fresh green at the horizon to a slightly deeper green at the bottom, a soft light haze
band right at the horizon line.

Composition: the middle-lower area is intentionally empty and clean so a large object
can be placed there.

No characters, no vehicles, no buildings, no text, no watermark.
Cute cartoon game background, soft gradients, low-saturation palette, no hard outlines,
orthogonal view, clean and airy.
```

### 6.2 清晨 outdoor_dawn

```
[同上构图，替换色彩描述]
Sky: pale pink to soft lavender gradient, a cool blue-gray horizon.
Hills: cool blue-green, slightly desaturated.
Ground: fresh mint green with a faint cool tint.
Light: soft, diffuse, cool daylight from the left, very gentle shadows.
```

### 6.3 黄昏 outdoor_dusk

```
[同上构图，替换色彩描述]
Sky: warm orange to pale gold gradient, a large low sun glow on the right side.
Hills: warm olive-green with amber highlights on the left-facing slopes.
Ground: golden-green with warm light pooling.
Light: warm directional light from the lower right, longer soft shadows.
```

### 6.4 室内车间 indoor_bay

```
A soft cartoon game background, portrait orientation 9:16, a clean indoor car wash bay.

Back wall: smooth light gray concrete with a subtle horizontal seam, a row of soft
rectangular ceiling lights casting gentle pools of light down the wall.
Floor: wet light-gray concrete with a faint reflective sheen and a very subtle puddle
reflection, a drainage groove running horizontally.
Composition: the middle-lower area is empty and clean for the subject.
No characters, no vehicles, no text, no watermark.
Cute cartoon game background, soft gradients, low-saturation palette, clean and airy.
```

---

## 7. 批量生成流程

### 7.1 工作流（已验证可跑）

`comfyui_run` 用的最小图（去掉模板里的开关节点，直接串 Turbo LoRA）：

```
UNETLoader(minimax_h3_fl2va_pruned_int8_convrot)
  → LoraLoaderModelOnly(minimax_h3_fl2v_turbo_8step_v1.0, 1.0)
  → ModelAttentionBackend("comfy kitchen attention")
      ├→ BasicGuider.model
      └→ BasicScheduler(steps=8, scheduler=simple, denoise=1).model

CLIPLoader(qwen3vl_32b_minimax_h3_nvfp4_awq, type=minimax)
  → CLIPTextEncode(prompt) → BasicGuider.conditioning

EmptyLatentImage(1216×832) → SamplerCustomAdvanced.latent_image
RandomNoise(seed) → .noise
KSamplerSelect(res_multistep) → .sampler
BasicScheduler → .sigmas
BasicGuider → .guider

SamplerCustomAdvanced → LTXVSeparateAVLatent → VAEDecode(vae=minimax_h3_video_vae_fp16) → SaveImage
```

### 7.2 顺序

```
第 1 张  小红轿车      ← 验证画风（已跑，见下）
第 2 张  户外背景      ← 验证色调搭配
第 3 张  软泥贴图      ← 验证脏污质感
        ↓ 三张都满意再往下，不满意改风格锚重来
第 4–8 张  其余 5 辆车
第 9–11 张 其余 3 种污渍
第 12–14 张 器物 + 特效
第 15–17 张 背景变体
```

**20 张全部跑完约 15 分钟**（44 秒/张），成本为零。

### 7.3 抠像

生成图 → `tools/keyer.html`（改一下 `img.src` 指向新图）→ Chrome 无头截图（带
`--default-background-color=00000000`）→ 透明 PNG。

单张约 2 秒。

---

## 8. 验收清单

- [ ] 车头是不是都朝右？侧视角是否一致？
- [ ] 抠像后边缘有没有绿边？（看车轮和车顶的高光边缘）
- [ ] 背景是否纯净？有没有意外出现的地面/投影？
- [ ] 有没有冒出来的文字、logo、奇怪符号？
- [ ] 颜色是不是低饱和？有没有刺眼的纯色？
- [ ] 和上一张摆在一起，像不像同一个游戏？

---

## 9. 已知问题与对策

| 问题 | 现象 | 对策 |
|---|---|---|
| 绿色车身被误抠 | 绿越野车的轮眉发虚 | 车身用 olive/muted green，提示词已注明；抠像阈值 `diff > 40` 可上调到 55 |
| 暗角 | 背景四角偏暗 | 色相判定不受影响；如果要当背景用，后期用渐变盖掉 |
| 轮子左右不等大 | 侧视图偶发透视不统一 | 提示词加 `both wheels exactly the same size` |
| 出现地面投影 | 车底有一层影子 | 加 `no ground shadow`；抠像后底部边缘会不干净，需要手工修 |
| 细节过多 | 出现门把手、牌照、后视镜 | 提示词写 `no door handles, no license plate, no mirrors, no badges`（干净风格更适合这游戏） |
