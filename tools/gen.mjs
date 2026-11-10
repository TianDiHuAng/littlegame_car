// 批量生成素材：node tools/gen.mjs <jobsFile.json>
// 直连本机 ComfyUI HTTP 接口，顺序执行，每张出图后自动拷到 prototype/assets/
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';

const API = 'http://127.0.0.1:8188';
const OUT_DIR = 'D:/Comfy-Desktop/ComfyUI-Shared/output';
const DEST = 'D:/AI/project/littlegame/prototype/assets';
const jobsFile = process.argv[2] || 'D:/AI/project/littlegame/tools/jobs.json';
const only = process.argv[3];   // 可选：只跑某个 name

if (!existsSync(DEST)) mkdirSync(DEST, { recursive: true });

const jobs = JSON.parse(readFileSync(jobsFile, 'utf8'));
const clientId = 'chongyichong-' + Math.random().toString(36).slice(2);

function workflowFor(job) {
  return {
    '6': { class_type: 'UNETLoader', inputs: { unet_name: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors', weight_dtype: 'default' } },
    '41': { class_type: 'LoraLoaderModelOnly', inputs: { model: ['6', 0], lora_name: 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors', strength_model: 1 } },
    '44': { class_type: 'ModelAttentionBackend', inputs: { model: ['41', 0], attention: 'comfy kitchen attention' } },
    '13': { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors', type: 'minimax', device: 'default' } },
    '12': { class_type: 'CLIPTextEncode', inputs: { clip: ['13', 0], text: job.prompt } },
    '46': { class_type: 'EmptyLatentImage', inputs: { width: job.w || 1216, height: job.h || 832, batch_size: 1 } },
    '15': { class_type: 'RandomNoise', inputs: { noise_seed: job.seed || Math.floor(Math.random() * 1e9) } },
    '17': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'res_multistep' } },
    '9': { class_type: 'BasicScheduler', inputs: { model: ['44', 0], scheduler: 'simple', steps: 8, denoise: 1 } },
    '16': { class_type: 'BasicGuider', inputs: { model: ['44', 0], conditioning: ['12', 0] } },
    '14': { class_type: 'SamplerCustomAdvanced', inputs: { noise: ['15', 0], guider: ['16', 0], sampler: ['17', 0], sigmas: ['9', 0], latent_image: ['46', 0] } },
    '39': { class_type: 'LTXVSeparateAVLatent', inputs: { av_latent: ['14', 0] } },
    '11': { class_type: 'VAELoader', inputs: { vae_name: 'minimax_h3_video_vae_fp16.safetensors' } },
    '10': { class_type: 'VAEDecode', inputs: { samples: ['39', 0], vae: ['11', 0] } },
    '48': { class_type: 'SaveImage', inputs: { filename_prefix: 'gen_' + job.name, images: ['10', 0] } }
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function submit(job) {
  const res = await fetch(`${API}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflowFor(job), client_id: clientId })
  });
  const j = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(j));
  return j.prompt_id;
}

async function waitFor(id, timeoutMs = 600000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = await fetch(`${API}/history/${id}`);
    const h = await r.json();
    const entry = h[id];
    if (entry && entry.outputs) {
      for (const nodeId of Object.keys(entry.outputs)) {
        const imgs = entry.outputs[nodeId].images;
        if (imgs && imgs.length) return imgs[0];
      }
      if (entry.status && entry.status.status_str === 'error') throw new Error('generation error');
    }
    await sleep(2500);
  }
  throw new Error('timeout');
}

const list = only ? jobs.filter((j) => j.name === only) : jobs;
const tAll = Date.now();

for (let i = 0; i < list.length; i++) {
  const job = list[i];
  const t0 = Date.now();
  try {
    const id = await submit(job);
    const img = await waitFor(id);
    const src = `${OUT_DIR}/${img.subfolder ? img.subfolder + '/' : ''}${img.filename}`;
    const dst = `${DEST}/raw_${job.name}.png`;
    copyFileSync(src, dst);
    console.log(`[${i + 1}/${list.length}] ${job.name}  ${((Date.now() - t0) / 1000).toFixed(0)}s  -> raw_${job.name}.png`);
  } catch (e) {
    console.log(`[${i + 1}/${list.length}] ${job.name}  FAILED: ${e.message}`);
  }
}

console.log(`全部完成，用时 ${((Date.now() - tAll) / 1000 / 60).toFixed(1)} 分钟`);
