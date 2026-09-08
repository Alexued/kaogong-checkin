<template>
  <Teleport to="body">
    <div v-if="open" class="star-modal" role="presentation" @click.self="close">
      <section ref="panel" class="star-panel" role="dialog" aria-modal="true" aria-labelledby="star-title" tabindex="-1" @keydown="handleKey">
        <header><span class="star-stamp" aria-hidden="true">✧</span><button ref="closeButton" type="button" class="btn ghost" data-back-dismiss data-back-priority="80" aria-label="关闭星星工具" @click="close">关闭</button></header>
        <h2 id="star-title">{{ unlocked ? '星星小工坊' : '打开星星小工坊' }}</h2>
        <p>{{ unlocked ? (pet.debugMode ? '测试沙盒' : '真实钱包') + ' · 当前 ' + pet.data.stars + ' 颗星' : '输入六位密码，开启开发者工具。' }}</p>
        <nav v-if="unlocked" class="star-modes" aria-label="调星方式"><button v-for="mode in modes" :key="mode.id" type="button" :aria-pressed="operation === mode.id" @click="operation = mode.id">{{ mode.label }}</button></nav>
        <output class="star-digits" :aria-label="unlocked ? '星星数量 ' + (digits || '0') : '已输入 ' + digits.length + ' 位密码'">{{ unlocked ? digits || '0' : Array.from({ length: 6 }, (_, index) => index < digits.length ? '●' : '○').join(' ') }}</output>
        <p v-if="error" class="star-error" role="alert">{{ error }}</p>
        <div class="star-keypad" aria-label="自制数字键盘"><button v-for="digit in ['1','2','3','4','5','6','7','8','9','清空','0','删除']" :key="digit" type="button" :aria-label="'数字键盘' + digit" @click="press(digit)">{{ digit }}</button></div>
        <button class="btn star-submit" type="button" :disabled="busy || !digits" @click="submit">{{ unlocked ? '确认调整' : '解锁小工坊' }}</button>
        <p class="star-footnote">{{ unlocked ? '只调整余额，不改变学习成绩。收到的心愿仍需对方的小钥匙。' : '仅限本次前台会话，离开应用会重新锁定。' }}</p>
        <details v-if="unlocked && pet.starAdjustments.length"><summary>最近调整记录</summary><p v-for="entry in pet.starAdjustments.slice(-5).reverse()" :key="entry.id">{{ entry.before }} → {{ entry.after }} ☆ · {{ new Date(entry.at).toLocaleTimeString() }}</p></details>
      </section>
    </div>
  </Teleport>
</template>
<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { App } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { developerSession, adjustedStars, type StarOperation } from '../domain/developerStars';
import { usePetStore } from '../stores/pet';
import { confirmDialog } from '../lib/appDialog';
const props = defineProps<{ trigger: number }>();
const pet = usePetStore();
const open = ref(false); const unlocked = ref(false); const digits = ref(''); const error = ref(''); const busy = ref(false);
const panel = ref<HTMLElement>(); const closeButton = ref<HTMLButtonElement>();
const operation = ref<StarOperation>('set');
const modes = [{ id: 'set', label: '设置为' }, { id: 'add', label: '增加' }, { id: 'subtract', label: '减少' }] as const;
let lastFocus: HTMLElement | null = null;
let listener: PluginListenerHandle | undefined;
let disposed = false;
function close() { open.value = false; digits.value = ''; error.value = ''; developerSession.lock(); unlocked.value = false; lastFocus?.focus(); }
watch(() => props.trigger, async () => {
  if (!developerSession.tap()) return;
  lastFocus = document.activeElement as HTMLElement;
  open.value = true; unlocked.value = developerSession.unlocked; digits.value = ''; error.value = '';
  await nextTick(); closeButton.value?.focus();
});
watch(() => pet.debugMode, close);
function press(value: string) {
  if (busy.value) return;
  if (value === '清空') digits.value = '';
  else if (value === '删除') digits.value = digits.value.slice(0, -1);
  else if (digits.value.length < (unlocked.value ? 9 : 6)) digits.value += value;
}
function handleKey(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); close(); return; }
  if (/^[0-9]$/.test(event.key)) { event.preventDefault(); press(event.key); }
  if (event.key === 'Backspace') { event.preventDefault(); press('删除'); }
  if (event.key === 'Tab') {
    const buttons = Array.from(panel.value?.querySelectorAll<HTMLElement>('button:not(:disabled), summary') || []);
    const index = buttons.indexOf(document.activeElement as HTMLElement);
    if ((event.shiftKey && index <= 0) || (!event.shiftKey && index === buttons.length - 1)) { event.preventDefault(); buttons[event.shiftKey ? buttons.length - 1 : 0]?.focus(); }
  }
}
async function submit() {
  if (busy.value) return;
  error.value = '';
  try {
    if (!unlocked.value) { developerSession.unlock(digits.value); unlocked.value = true; digits.value = ''; return; }
    const amount = Number(digits.value); const before = pet.data.stars; const scope = pet.debugMode ? 'sandbox' : 'real'; const mode = operation.value;
    const after = adjustedStars(before, amount, mode); busy.value = true;
    if (await confirmDialog({ title: '调整这份星星余额？', message: (scope === 'real' ? '真实钱包' : '测试沙盒') + '：' + before + ' → ' + after + ' 颗星', details: ['学习记录和累计学习奖励不变。'], confirmLabel: '保存星星', cancelLabel: '再想想' })) {
      if (!open.value || !developerSession.unlocked) throw new Error('小工坊已锁定，请重新解锁。');
      if (!pet.adjustStars(amount, mode, crypto.randomUUID(), before, scope)) throw new Error(pet.message);
      digits.value = ''; error.value = '已保存，学习记录未改变。';
    }
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '调整失败'; digits.value = ''; }
  finally { busy.value = false; }
}
function visibility() { if (document.hidden) close(); }
document.addEventListener('visibilitychange', visibility);
if (Capacitor.isNativePlatform()) void App.addListener('appStateChange', state => { if (!state.isActive) close(); }).then(handle => { if (disposed) void handle.remove(); else listener = handle; });
onBeforeUnmount(() => { disposed = true; close(); document.removeEventListener('visibilitychange', visibility); void listener?.remove(); });
</script>
<style scoped>
.star-modal{position:fixed;inset:0;z-index:180;background:#102b3277;display:grid;place-items:center;padding:calc(12px + env(safe-area-inset-top)) 16px calc(12px + env(safe-area-inset-bottom));overflow:auto;backdrop-filter:blur(5px)}
.star-panel{width:min(100%,360px);max-height:100%;overflow:auto;background:var(--bg-elev);border:1px solid var(--card-border);border-radius:26px;padding:22px;box-shadow:0 20px 65px #102b3233;color:var(--text);outline:none}
header{display:flex;justify-content:space-between;align-items:center}.star-stamp{font-size:35px;color:var(--accent-solid)}h2{font-size:23px;margin:12px 0 8px}p{font-size:13px;line-height:1.6;color:var(--text-2);overflow-wrap:anywhere}
.star-digits{display:block;text-align:center;border:2px solid var(--accent-solid);border-radius:16px;padding:16px 4px;font-size:27px;margin:14px 0;font-variant-numeric:tabular-nums;min-height:66px}
.star-keypad{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.star-keypad button,.star-modes button{border:1px solid var(--card-border);border-radius:14px;background:var(--bg);color:var(--text);font:inherit;min-height:45px}.star-keypad button{font-size:19px}.star-keypad button:active{background:var(--accent-soft)}
.star-modes{display:flex;gap:6px}.star-modes button{flex:1;font-size:13px}.star-modes [aria-pressed=true]{border-color:var(--accent-solid);color:var(--accent-solid)}.star-submit{width:100%;margin-top:12px}.star-error{color:var(--accent-solid)}.star-footnote{font-size:12px}.star-panel details{font-size:12px}
@media(max-height:570px){.star-panel{padding:14px}.star-digits{padding:6px;min-height:46px;margin:8px 0}.star-keypad{gap:4px}h2{font-size:19px;margin:4px 0}}
</style>
