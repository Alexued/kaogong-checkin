<template>
  <div class="mini-camera" role="dialog" aria-modal="true" aria-label="离线扫描心愿二维码" @keydown.esc="emit('close')">
    <section class="mini-camera-panel">
      <header><h2>扫一扫小心愿</h2><button ref="closeButton" class="btn ghost" type="button" @click="emit('close')">关闭</button></header>
      <p>镜头对准另一台设备的完整二维码，不访问网络。</p>
      <video ref="video" autoplay muted playsinline aria-label="相机扫描画面"></video>
      <p role="status">{{ message }}</p>
      <button class="btn" type="button" :disabled="opening || !!stream" @click="start">{{ opening ? '正在请求相机…' : '打开相机' }}</button>
      <label class="btn ghost mini-image-picker">或识别二维码图片<input type="file" accept="image/png,image/jpeg,image/webp" :disabled="decoding" @change="readImage"></label>
    </section>
  </div>
</template>
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { decodeQrFile, decodeQrFrame } from './qr';
import { readableError } from './platform';
const emit = defineEmits<{ (event: 'close'): void; (event: 'decoded', text: string): void }>();
const video = ref<HTMLVideoElement>(); const closeButton = ref<HTMLButtonElement>();
const stream = shallowRef<MediaStream>(); const opening = ref(false); const decoding = ref(false);
const message = ref('点击打开相机，首次使用需要你授权。');
let alive = true; let generation = 0; let timeout: ReturnType<typeof setTimeout> | undefined;
let lastFocus: HTMLElement | null = null;
function stop() { generation++; if (timeout) clearTimeout(timeout); stream.value?.getTracks().forEach(track => track.stop()); stream.value = undefined; if (video.value) video.value.srcObject = null; opening.value = false; }
function frame(token: number) {
  if (!alive || token !== generation || document.hidden || !stream.value) return;
  const element = video.value;
  if (element && element.readyState >= 2) {
    try { const value = decodeQrFrame(element, element.videoWidth, element.videoHeight); stop(); emit('decoded', value); return; } catch { message.value = '请让二维码完整出现在镜头中，保持片刻。'; }
  }
  timeout = setTimeout(() => frame(token), 300);
}
async function start() {
  if (opening.value || stream.value) return;
  if (!navigator.mediaDevices?.getUserMedia) { message.value = '当前容器不支持相机，请选择二维码图片，或关闭后使用本地文本。'; return; }
  const token = ++generation; opening.value = true;
  try {
    const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 1280 } } });
    if (!alive || token !== generation || document.hidden) { media.getTracks().forEach(track => track.stop()); return; }
    stream.value = media;
    await nextTick();
    if (!video.value) { stop(); return; }
    video.value.srcObject = media; await video.value.play(); frame(token);
  } catch { if (alive && token === generation) { stop(); message.value = '相机未打开，请检查授权，或使用二维码图片和本地文本。'; } }
  finally { if (token === generation) opening.value = false; }
}
async function readImage(event: Event) {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]; input.value = '';
  if (!file || decoding.value) return;
  stop(); const token = generation; decoding.value = true;
  try { const text = await decodeQrFile(file); if (alive && token === generation) emit('decoded', text); }
  catch (error) { if (alive && token === generation) message.value = readableError(error); }
  finally { decoding.value = false; }
}
function visibility() { if (document.hidden) { stop(); message.value = '相机已暂停，返回后请重新打开。'; } }
onMounted(() => { lastFocus = document.activeElement as HTMLElement; closeButton.value?.focus(); document.addEventListener('visibilitychange', visibility); });
onBeforeUnmount(() => { alive = false; stop(); document.removeEventListener('visibilitychange', visibility); lastFocus?.focus(); });
</script>
