// 生成 jobs.json（批量素材任务）
import { writeFileSync } from 'node:fs';

const STYLE = 'Hand-painted game illustration, thick visible brush strokes, oil-painting texture with soft canvas grain, no black outlines, single clean silhouette.';
const ISO = 'Isolated on a flat uniform green background, single complete object, no ground plane, no cast shadow, no vignette, no text, no watermark, no logos.';
const VIEW = 'pure side view, facing right, orthogonal view with no perspective distortion, chunky rounded proportions';

const car = (body, extra = '') => `${STYLE} A cute cartoon ${body}, ${VIEW}. ${extra} Isolated on a flat uniform green background, single complete object, no ground plane, no cast shadow, no vignette, no text, no watermark, no logos, no door handles, no license plate, no mirrors.`;

const jobs = [
  {
    name: 'car_van', w: 1216, h: 832, seed: 771210,
    prompt: car('small delivery van with a boxy tall body and a flat roof',
      'Body: soft butter yellow with a brush-blended vertical gradient down to golden mustard, warm highlights from the upper left. Cabin: three tall rectangular side windows in a row, pale ice-blue glass with soft diagonal painted reflections, body-colored pillars. Wheels: two dark charcoal tires with hand-painted silver five-spoke rims and bright crescent highlights, soft shadow inside each wheel arch. Lights: a small rounded warm-yellow headlight at the front corner.')
  },
  {
    name: 'car_coupe', w: 1216, h: 832, seed: 771211,
    prompt: car('low sleek two-door sports coupe with a fastback roof sloping to a short rear deck',
      'Body: soft sky blue with a brush-blended vertical gradient down to deeper cobalt, warm highlights from the upper left. Cabin: one long side window split by a single body-colored B-pillar, pale ice-blue glass with a bold diagonal reflection. Wheels: two wide dark charcoal tires with hand-painted silver five-spoke rims, slightly larger than a sedan, bright crescent highlights. Lights: a slim angular warm-yellow headlight at the front.')
  },
  {
    name: 'car_jeep', w: 1216, h: 832, seed: 771212,
    prompt: car('tall boxy off-road SUV with high ground clearance and a slim roof rack',
      'Body: muted dusty olive green with a brush-blended vertical gradient, matte finish, chunky darker olive plastic wheel arch flares. Cabin: two upright rectangular side windows in pale ice-blue glass with soft reflections. Wheels: two oversized chunky dark charcoal tires with hand-painted silver five-spoke rims and visible tread. Lights: a small squared warm-yellow headlight at the front.')
  },
  {
    name: 'car_truck', w: 1216, h: 832, seed: 771213,
    prompt: car('long box truck with a tall rectangular cargo compartment and a short cab',
      'Body: soft off-white with subtle cool gray brush shading, a wide horizontal dusty teal-blue decorative stripe running along the middle of the cargo box. Cabin: a short cab with one large side window in pale ice-blue glass. Wheels: two dark charcoal tires with hand-painted silver five-spoke rims and bright crescent highlights. Lights: a small rounded warm-yellow headlight at the front bumper.')
  },
  {
    name: 'car_black', w: 1216, h: 832, seed: 771214,
    prompt: car('low athletic dark charcoal black sedan',
      'Body: deep charcoal gray with a subtle cool blue sheen, brush-blended vertical gradient from lighter graphite on top to near-black at the bottom, a thin pale-gray crease line along the side catching light. Cabin: two side windows with dark blue tinted glass and faint pale reflections. Wheels: two dark charcoal tires with hand-painted silver five-spoke rims and bright white crescent highlights to separate the tire from the dark body. Lights: a slim warm-yellow headlight at the front.')
  },

  // ---- 污渍贴图 ----
  {
    name: 'dirt_heavy', w: 1024, h: 1024, seed: 771220,
    prompt: `${STYLE} A single irregular patch of dried cracked mud crust, cool gray-brown, thick and chunky with visible depth along the edges, a dense network of fine cracks across the surface, small lifted flakes and curled edges, matte dry surface. Lumpy irregular blob covering about 60 percent of the frame with generous empty margin. Isolated on a flat uniform green background, one single patch only, no other objects, no shadow, no vignette, no text, no watermark.`
  },
  {
    name: 'grime_hard', w: 1024, h: 1024, seed: 771221,
    prompt: `${STYLE} A single blob of hard black tar-like grime, glossy and reflective, uneven raised surface with sharp painted specular highlights, irregular jagged edges, a few small hardened droplets around the border, wet black sheen with a strong highlight on the upper left. Roughly circular blob covering about 50 percent of the frame with empty margin. Isolated on a flat uniform green background, one single blob only, no other objects, no shadow, no vignette, no text, no watermark.`
  },
  {
    name: 'paint_damage', w: 1024, h: 1024, seed: 771222,
    prompt: `${STYLE} A single patch of chipped car paint exposing gray primer underneath, irregular flaking edges with thin cracked paint lips curling outward, small hairline cracks radiating from the chip, gray primer core with a thin lighter edge where the paint layer is exposed. Irregular blob covering about 45 percent of the frame with empty margin. Isolated on a flat uniform green background, one single patch only, no other objects, no shadow, no vignette, no text, no watermark.`
  },

  // ---- 器物 ----
  {
    name: 'brick_wall', w: 1024, h: 1024, seed: 771230,
    prompt: `${STYLE} A flat front-facing view of a clean empty brick wall filling most of the frame, orthogonal, no perspective. Warm cream-beige bricks laid in a regular running bond pattern, thin light-gray mortar lines, subtle per-brick color variation, softly rounded corners on the outer edges, a few subtle worn spots and tiny chips on the surface, even front lighting. Isolated on a flat uniform green background, single complete object, no cast shadow, no vignette, no text, no watermark.`
  },
  {
    name: 'vase', w: 832, h: 1216, seed: 771231,
    prompt: `${STYLE} A front-facing celadon ceramic vase, symmetrical, orthogonal view, no perspective. Rounded full belly at the widest point tapering to a narrow neck with a slightly flared rim and a small flat foot. Soft teal celadon glaze with a gentle painted sheen, a broad soft highlight on the left side, two shallow horizontal decorative bands incised around the belly, faint crackle texture in the glaze. ${ISO}`
  },
  {
    name: 'window', w: 832, h: 1216, seed: 771232,
    prompt: `${STYLE} A front-facing old wooden window, tall vertical rectangle, orthogonal view, no perspective. Warm dark-brown wood frame with visible grain, a chunky outer frame and a cross-shaped mullion dividing the glass into four panes, a small sill protruding at the bottom. Pale ice-blue glass with a soft diagonal reflection and slight unevenness. ${ISO}`
  },
  {
    name: 'hub', w: 1024, h: 1024, seed: 771233,
    prompt: `${STYLE} A front-facing car wheel, perfectly circular, orthogonal view, centered. Thick dark charcoal rubber tire ring with a subtle painted tread pattern on the edge. Inside: a silver-gray five-spoke alloy rim, each spoke a tapered triangular blade radiating from the center, a round center cap with five small bolts, a thin machined outer lip, soft bright highlight on the upper left, metal sheen. ${ISO}`
  },

  // ---- 特效 ----
  {
    name: 'fx_foam', w: 1024, h: 1024, seed: 771240,
    prompt: `${STYLE} A single cluster of white soap foam, fluffy and soft, made of many overlapping round bubbles of different sizes, a few bubbles popping at the edges, soft painted blue-gray shading in the crevices giving volume, matte white with gentle highlights. Rounded irregular cluster covering about 60 percent of the frame. Isolated on a flat uniform green background, one single cluster only, no other objects, no shadow, no vignette, no text, no watermark.`
  },
  {
    name: 'fx_splash', w: 1024, h: 1024, seed: 771241,
    prompt: `${STYLE} A burst of white water splashing outward, dozens of droplets of varied sizes flying radially, thin translucent painted streaks, fine mist at the edges, bright white core fading to transparent tips, semi-transparent with no outline. Radial burst covering about 70 percent of the frame. Isolated on a flat uniform green background, one single burst only, no other objects, no shadow, no vignette, no text, no watermark.`
  },

  // ---- 背景（整屏，不需要绿幕）----
  {
    name: 'bg_dawn', w: 832, h: 1216, seed: 771250,
    prompt: `Hand-painted storybook game background, thick visible brush strokes, oil-painting texture with soft canvas grain, warm gentle light, muted pastel palette. Portrait orientation, wide open outdoor scene. Sky: a smooth painted gradient from pale pink at the top to soft lavender near the horizon with a cool blue-gray band. Distance: two layers of rolling hills, the far layer muted blue-green, the near layer slightly lighter, soft rounded painterly silhouettes. Ground: a broad smooth fresh mint green meadow filling the lower third with a faint cool tint, soft light haze at the horizon line. The middle-lower area is intentionally empty and clean so an object can be placed there. No characters, no vehicles, no buildings, no text, no watermark.`
  },
  {
    name: 'bg_dusk', w: 832, h: 1216, seed: 771251,
    prompt: `Hand-painted storybook game background, thick visible brush strokes, oil-painting texture with soft canvas grain, warm golden light, muted palette. Portrait orientation, wide open outdoor scene. Sky: a smooth painted gradient from warm orange at the top to pale gold near the horizon, a large soft painted sun glow low on the right side. Distance: two layers of rolling hills, the far layer warm olive-green, the near layer with amber highlights on the left-facing slopes. Ground: a broad smooth golden-green meadow filling the lower third with warm light pooling across it, soft haze at the horizon line. The middle-lower area is intentionally empty and clean so an object can be placed there. No characters, no vehicles, no buildings, no text, no watermark.`
  }
];

writeFileSync('D:/AI/project/littlegame/tools/jobs.json', JSON.stringify(jobs, null, 2), 'utf8');
console.log('jobs.json 写入', jobs.length, '个任务');
