<template>
  <div class="page mini-poster">
    <header><router-link class="btn ghost" to="/settings">‹ 我的</router-link><h1>把努力留成一张图</h1><p>今日完成 {{ summary.done }}/{{ summary.total }} · 连续 {{ streak }} 天</p></header>
    <section class="card mini-card"><canvas ref="canvas" width="720" height="960" aria-label="今日打卡海报预览"></canvas><p>只展示完成数量和连续天数，不包含任务名称、心愿或密钥。</p><div class="mini-links"><button class="btn" :disabled="busy || !image" @click="save">存到相册</button><button class="btn ghost" :disabled="busy || !image" @click="share">发一篇笔记</button></div><p role="status">{{ message }}</p></section>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useAppStore } from '../../web/src/stores/app';
import { completionForDate } from '../../web/src/lib/completion';
import { streakDays } from '../../web/src/lib/stats';
import { todayStr } from '../../web/src/lib/date';
import { effectivePlanEnd } from '../../web/src/lib/appMode';
import { readableError, saveImage, shareImage } from './platform';
const store = useAppStore(); const canvas = ref<HTMLCanvasElement>(); const image = ref(''); const message = ref(''); const busy = ref(false);
const date = todayStr();
const summary = computed(() => completionForDate(store.tasks, store.checkins, date, effectivePlanEnd(store.settings)));
const streak = computed(() => streakDays(store.checkins, date));
function draw() {
  try {
    const context = canvas.value?.getContext('2d'); if (!context || !canvas.value) throw new Error('当前环境无法生成海报。');
    context.fillStyle = '#edf4ec'; context.fillRect(0, 0, 720, 960);
    context.fillStyle = '#166356'; context.fillRect(40, 40, 640, 880);
    context.fillStyle = '#f7f4e8'; context.fillRect(68, 220, 584, 570);
    context.textAlign = 'left'; context.fillStyle = '#edf4ec'; context.font = 'bold 42px sans-serif'; context.fillText('格记', 72, 120);
    context.font = '22px sans-serif'; context.fillText(date.replaceAll('-', ' / '), 72, 169);
    context.fillStyle = '#166356'; context.font = '26px sans-serif'; context.fillText('每一点努力，都算数。', 105, 302);
    context.font = 'bold 100px sans-serif'; context.fillText(`${summary.value.done} / ${summary.value.total}`, 102, 443);
    context.font = '28px sans-serif'; context.fillText('今日完成', 108, 500);
    context.fillStyle = '#d3a54c'; context.beginPath(); context.arc(526, 614, 62, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#166356'; context.font = 'bold 42px sans-serif'; context.fillText(`连续 ${streak.value} 天`, 108, 636);
    context.font = '20px sans-serif'; context.fillText('有打卡的一天，就是前进的一天。', 108, 726);
    context.fillStyle = '#edf4ec'; context.font = '23px sans-serif'; context.fillText('慢慢来，我们每天见。', 74, 854);
    image.value = canvas.value.toDataURL('image/png');
  } catch (error) { image.value = ''; message.value = readableError(error); }
}
async function action(callback: () => Promise<void>) { if (busy.value) return; busy.value = true; message.value = ''; try { await callback(); } catch (error) { message.value = readableError(error); } finally { busy.value = false; } }
function save() { return action(async () => { await saveImage(image.value); message.value = '海报已保存到相册。'; }); }
function share() { return action(async () => { await shareImage(image.value, '格记 · 今日小进步', `今日完成 ${summary.value.done}/${summary.value.total} · 连续 ${streak.value} 天。慢慢来，我们每天见。`); message.value = '已交给小红书笔记编辑页，请自行确认发布。'; }); }
onMounted(draw); watch([summary, streak], draw);
</script>
