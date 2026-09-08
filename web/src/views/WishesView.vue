<template>
  <div class="page wishes-page">
    <header class="wish-heading"><button class="btn ghost" type="button" @click="router.push('/rewards')">‹ 奖励</button><div><h1>星星心愿券</h1><p>一份小期待，一把小钥匙。</p></div></header>
    <section class="card wish-intro"><PetAvatar compact :active="false" /><div><strong>{{ pet.debugMode ? '测试信箱' : '心意不需要联网' }}</strong><p>扫码收下 · 请对方送出钥匙 · 兑换享用</p><small>☆ {{ pet.data.stars }} · {{ pet.debugMode ? '与真实钱包隔离' : '与你的奖励共用星星' }}</small></div></section>
    <p v-if="notice" class="wish-notice" role="status">{{ notice }}</p>
    <section v-if="wishImageTestAllowed" class="card wish-transfer"><p>独立测试版 · 从本地截图识别二维码，不代表相机实扫验收。</p><button class="btn ghost" type="button" :disabled="busy" @click="scanImage">测试：识别二维码图片</button></section>
    <div class="wish-tools"><button class="btn" type="button" :disabled="busy" @click="scan">扫一扫心愿 / 小钥匙</button><button class="btn ghost" type="button" :disabled="busy" @click="manual = !manual">本地文本</button></div>
    <section v-if="manual" class="card wish-transfer"><h2>本地传递</h2><p>可粘贴心愿文本，或选择另一台设备给你的本地文件。不访问网络。</p><textarea v-model="incoming" class="input" rows="4" maxlength="2800" aria-label="心愿传递文本" placeholder="GEJI-WISH:1:…"></textarea><div class="wish-tools"><button class="btn" type="button" :disabled="busy || !incoming" @click="inspect(incoming)">读取文本</button><label class="btn ghost">选择本地文件<input type="file" accept=".txt,text/plain" :disabled="busy" @change="readFile"></label></div></section>
    <section v-if="staged" ref="preview" class="card wish-preview">
      <span class="wish-eyebrow">{{ staged.body.kind === 'offer' ? '✉ 有一份心意给你' : staged.body.kind === 'request' ? '✧ 有人期待这份奖励' : '🗝 收到一把小钥匙' }}</span>
      <h2>{{ previewOffer?.body.name || '确认本次心愿' }}</h2><strong v-if="previewOffer" class="wish-price">☆ {{ previewOffer.body.cost }}</strong><p>{{ previewOffer?.body.description }}</p>
      <p v-if="staged.body.kind === 'offer'">来自 {{ staged.body.nickname }} · 来源 {{ staged.body.issuer.slice(-8) }}</p>
      <p v-if="staged.body.kind === 'request'">{{ staged.body.nickname }} 的这次请求 · 设备 {{ staged.body.recipient.slice(-8) }}</p>
      <p class="wish-help">{{ staged.body.kind === 'offer' ? '请当面确认送出者。收下不扣星，内容与价格由对方决定。' : staged.body.kind === 'request' ? '钥匙只用于这次请求。离线签发后无法远程撤回，也不会获知对方是否已使用。' : '核对后才扣星。相同钥匙不会重复结算。' }}</p>
      <div class="wish-tools"><button class="btn" type="button" :disabled="busy" @click="accept">{{ staged.body.kind === 'offer' ? '收下心愿' : staged.body.kind === 'request' ? '送出小钥匙' : '确认兑换' }}</button><button class="btn ghost" type="button" @click="staged = null">暂时不用</button></div>
    </section>
    <section v-if="displayed && qrUrl" ref="codePanel" class="card wish-code">
      <span class="wish-eyebrow">{{ displayed.body.kind === 'offer' ? '01 · 把心愿送给你' : displayed.body.kind === 'request' ? '02 · 等一把小钥匙' : '03 · 这次的小钥匙' }}</span>
      <h2>{{ displayed.body.kind === 'offer' ? displayed.body.name : displayed.body.kind === 'request' ? '请送出者扫描这个码' : '请兑换者扫回这个码' }}</h2>
      <img :src="qrUrl" :alt="displayed.body.kind === 'offer' ? '离线心愿券二维码' : displayed.body.kind === 'request' ? '离线兑换请求二维码' : '一次性小钥匙二维码'" width="320" height="320">
      <p>{{ displayed.body.kind === 'request' ? '现在没有扣星。返回后仍可继续这次请求。' : displayed.body.kind === 'key' ? '钥匙已签发，不代表对方已经兑换。' : '无需网络或热点，直接用格记扫一扫。' }}</p>
      <details><summary>复制或保存传递文本</summary><textarea class="input" rows="4" readonly :value="outgoing" aria-label="当前心愿二维码文本"></textarea><div class="wish-tools"><button class="btn ghost" type="button" @click="copy">复制文本</button><button class="btn ghost" type="button" @click="download">保存文本</button></div></details>
      <button class="btn ghost" type="button" @click="displayed = null">收起二维码</button>
    </section>
    <section class="card wish-compose"><h2>✉ 送出一份心愿</h2><p>从自己的奖励中选一份，送给另一台设备。</p><label>送出昵称<input v-model="nickname" class="input" maxlength="40" placeholder="例如：星星伙伴"></label><label>选择奖励<select v-model="selectedReward" class="input"><option value="">请选择自己的奖励</option><option v-for="reward in pet.data.customRewards.filter(item => item.enabled)" :key="reward.id" :value="reward.id">{{ reward.name }} · {{ reward.cost }} 星</option></select></label><button class="btn" type="button" :disabled="busy || !selectedReward" @click="share">生成心愿券</button></section>
    <nav class="wish-tabs" aria-label="心愿分类"><button v-for="tab in tabs" :key="tab.id" type="button" :aria-pressed="section === tab.id" @click="section = tab.id">{{ tab.label }}</button></nav>
    <template v-if="section === 'received'">
      <label class="wish-filter"><input v-model="showHidden" type="checkbox">显示收起的心愿</label>
      <p v-if="!pet.data.wishes.received.length" class="card wish-empty">信箱空空的，扫一张心愿券，收下小期待。</p>
      <article v-for="row in pet.data.wishes.received.filter(item => showHidden || !item.hidden)" :key="row.offer.body.id" class="card wish-ticket">
        <span class="wish-eyebrow">✉ {{ row.offer.body.nickname }} 送来的心愿</span><div class="wish-ticket-title"><h2>{{ row.offer.body.name }}</h2><strong>☆ {{ row.offer.body.cost }}</strong></div><p>{{ row.offer.body.description }}</p><small>每次兑换需要对方的小钥匙 · 价格不可修改</small>
        <div class="wish-tools"><button class="btn" type="button" :disabled="busy || row.hidden" @click="request(row.offer.body.id)">请求小钥匙</button><button class="btn ghost" type="button" :disabled="busy" @click="hide(row.offer.body.id)">{{ row.hidden ? '恢复' : '收起' }}</button></div>
      </article>
    </template>
    <template v-else-if="section === 'waiting'">
      <p v-if="!waiting.length" class="card wish-empty">没有等待中的请求，星星会在确认兑换时才扣除。</p>
      <article v-for="row in waiting" :key="row.request.body.id" class="card wish-ticket"><h2>等一把小钥匙</h2><p>请求 {{ row.request.body.id.slice(0, 8) }} · 未扣星</p><div class="wish-tools"><button class="btn" type="button" :disabled="busy" @click="show(row.request)">继续出示请求</button><button class="btn ghost" type="button" :disabled="busy" @click="cancel(row.request.body.id)">取消请求</button></div></article>
    </template>
    <template v-else>
      <p class="wish-help">这里仅记录本机送出的心愿和钥匙，不追踪另一台手机的使用状态。</p>
      <article v-for="offer in [...pet.data.wishes.offers].reverse()" :key="offer.body.id" class="card wish-ticket"><h2>{{ offer.body.name }}</h2><p>{{ offer.body.cost }} 星 · 第 {{ offer.body.revision }} 版</p><button class="btn ghost" type="button" :disabled="busy" @click="show(offer)">再次展示心愿券</button></article>
      <article v-for="key in [...pet.data.wishes.approvals].reverse()" :key="key.body.id" class="card wish-ticket"><h2>🗝 已送出小钥匙</h2><p>请求 {{ key.body.requestId.slice(0, 8) }} · 是否兑换由对方设备记录</p><button class="btn ghost" type="button" :disabled="busy" @click="show(key)">再次展示钥匙</button></article>
    </template>
    <p class="wish-help">私钥只在本机。换手机后需要重新收下心愿；请不要把本地备份当作身份迁移。</p>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Capacitor, registerPlugin } from '@capacitor/core';
import QRCode from 'qrcode';
import { usePetStore } from '../stores/pet';
import { getWishIdentity } from '../storage/wishIdentity';
import { approveWish, decodeWish, encodeWish, issueOffer, offerForRequest, receiveOffer, redeemWish, requestWish, verifyWish, wishHash, type SignedWish, type WishOffer, type WishRequest, type WishKey } from '../domain/wishes';
import { confirmDialog } from '../lib/appDialog';
import PetAvatar from '../components/PetAvatar.vue';
import { NativePetDebug, wishImageTestAllowed } from '../lib/petDebug';
const pet = usePetStore(); const router = useRouter(); const route = useRoute();
const NativeScanner = registerPlugin<{ scanWishQr(): Promise<{ cancelled: boolean; value?: string }> }>('DeviceSync');
const busy = ref(false); const notice = ref(''); const manual = ref(false); const incoming = ref('');
const displayed = ref<SignedWish | null>(null); const staged = ref<SignedWish | null>(null); const previewOffer = ref<SignedWish<WishOffer> | null>(null);
const qrUrl = ref(''); const outgoing = ref(''); const nickname = ref(pet.data.name); const selectedReward = ref('');
const preview = ref<HTMLElement>(); const codePanel = ref<HTMLElement>();
const showHidden = ref(false); const section = ref('received');
const tabs = [{ id: 'received', label: '收到的心愿' }, { id: 'waiting', label: '等小钥匙' }, { id: 'sent', label: '送出记录' }];
const waiting = computed(() => pet.data.wishes.requests.filter(row => row.status === 'waiting'));
let alive = true; let epoch = 0;
const scope = () => pet.debugMode ? 'sandbox' as const : 'real' as const;
function named() { const value = nickname.value.trim(); if (!value || Array.from(value).length > 20) throw new Error('昵称需要 1 至 20 个字符。'); return value; }
async function action(callback: () => Promise<void>) { if (busy.value) return; busy.value = true; notice.value = ''; try { await callback(); } catch (error) { notice.value = error instanceof Error ? error.message : '没能完成，请重试。'; } finally { busy.value = false; } }
async function show(message: SignedWish) {
  const token = epoch;
  const value = encodeWish(message);
  const image = await QRCode.toDataURL(value, { width: 1024, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#17383b', light: '#ffffff' } });
  if (!alive || token !== epoch) return;
  outgoing.value = value; qrUrl.value = image; displayed.value = message;
  await nextTick(); codePanel.value?.scrollIntoView({ block: 'start', behavior: 'instant' });
}
async function share() { await action(async () => {
  const sender = named();
  const offer = await pet.wish(async (wallet, _used, area) => issueOffer(wallet, selectedReward.value, await getWishIdentity(area), area, sender));
  await show(offer);
}); }
async function parse(source: string) {
  const token = epoch; const area = scope(); const wallet = pet.data;
  const message = decodeWish(source); await verifyWish(message, area);
  let offer: SignedWish<WishOffer> | null = null;
  if (message.body.kind === 'offer') offer = message as SignedWish<WishOffer>;
  if (message.body.kind === 'request') offer = await offerForRequest(wallet, message as SignedWish<WishRequest>, await getWishIdentity(area), area);
  if (message.body.kind === 'key') {
    for (const row of wallet.wishes.received) if (await wishHash(row.offer) === message.body.offerHash) offer = row.offer;
    if (!offer) throw new Error('请先在这台设备收下对应的心愿券。');
  }
  if (!alive || epoch !== token || area !== scope()) return;
  previewOffer.value = offer; staged.value = message; manual.value = false;
  await nextTick(); preview.value?.scrollIntoView({ block: 'start', behavior: 'instant' });
}
async function inspect(source: string) { await action(() => parse(source)); }
async function scanImage() { await action(async () => {
  if (!wishImageTestAllowed.value) return;
  const token = epoch;
  const result = await NativePetDebug.scanWishImageQr();
  if (!alive || token !== epoch || result.cancelled || !result.value) return;
  await parse(result.value);
}); }
async function scan() { await action(async () => {
  if (!Capacitor.isNativePlatform()) { manual.value = true; notice.value = '浏览器请使用本地文本；安卓应用可离线扫码。'; return; }
  const token = epoch;
  const result = await NativeScanner.scanWishQr();
  if (!alive || token !== epoch || result.cancelled || !result.value) return;
  await parse(result.value);
}); }
async function accept() { await action(async () => {
  const message = staged.value; if (!message) return;
  const token = epoch;
  if (message.body.kind === 'key' && !await confirmDialog({ title: '用小钥匙兑换心愿？', message: (previewOffer.value?.body.name || '') + ' · ' + (previewOffer.value?.body.cost || 0) + ' 颗星', confirmLabel: '确认兑换', cancelLabel: '再等等' })) return;
  if (!alive || token !== epoch) return;
  const result = await pet.wish(async (wallet, consumed, area) => {
    if (message.body.kind === 'offer') { await receiveOffer(wallet, message as SignedWish<WishOffer>, area); return null; }
    const identity = await getWishIdentity(area);
    if (message.body.kind === 'request') return approveWish(wallet, message as SignedWish<WishRequest>, identity, area);
    await redeemWish(wallet, message as SignedWish<WishKey>, identity, area, consumed, new Date().toISOString()); return null;
  });
  staged.value = null;
  if (message.body.kind === 'key') displayed.value = null;
  notice.value = message.body.kind === 'offer' ? '心愿已收进信箱，没有扣星。' : message.body.kind === 'request' ? '小钥匙已保存，请对方扫回。' : '兑换成功！去“我的奖励 → 待使用”享用吧。';
  if (result) await show(result);
}); }
async function request(offerId: string) { await action(async () => {
  const receiver = named();
  const result = await pet.wish(async (wallet, _used, area) => requestWish(wallet, offerId, await getWishIdentity(area), area, receiver));
  await show(result);
}); }
async function cancel(id: string) { await action(async () => {
  if (!await confirmDialog({ title: '收回这次请求？', message: '尚未扣星。取消后，已经签发给这次请求的钥匙将不能兑换。', confirmLabel: '取消请求', cancelLabel: '继续等待' })) return;
  await pet.wish(async wallet => { const row = wallet.wishes.requests.find(entry => entry.request.body.id === id); if (row?.status === 'waiting') row.status = 'cancelled'; });
  displayed.value = null; notice.value = '请求已收回，没有扣星。';
}); }
async function hide(id: string) { await action(async () => { await pet.wish(async wallet => { const row = wallet.wishes.received.find(entry => entry.offer.body.id === id); if (row) row.hidden = !row.hidden; }); }); }
async function copy() { try { await navigator.clipboard.writeText(outgoing.value); notice.value = '传递文本已复制。'; } catch { notice.value = '可长按文本手动复制。'; } }
function download() {
  const url = URL.createObjectURL(new Blob([outgoing.value], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'geji-wish.txt'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000); notice.value = '已请求保存文本；若设备不支持，请使用复制文本。';
}
async function readFile(event: Event) { const input = event.target as HTMLInputElement; const file = input.files?.[0]; input.value = ''; if (!file) return; await action(async () => { if (file.size > 2800) throw new Error('文件太大，请选择心愿传递文本。'); await parse((await file.text()).trim()); }); }
watch(() => pet.debugMode, () => { epoch++; staged.value = null; displayed.value = null; incoming.value = ''; });
onMounted(() => { if (typeof route.query.send === 'string') selectedReward.value = route.query.send; });
onBeforeUnmount(() => { alive = false; epoch++; });
</script>
<style scoped>
.wishes-page{padding-bottom:120px}.wish-heading{display:flex;align-items:center;gap:12px;margin:8px 0 20px}.wish-heading h1{font-size:28px;margin:0}.wish-heading p{margin:5px 0;font-size:13px;color:var(--text-2)}.wish-intro{display:flex;gap:14px;align-items:center;padding:20px}.wish-intro div{min-width:0}.wish-intro p{font-size:12px;color:var(--text-2);margin:8px 0}.wish-intro small{color:var(--accent-solid)}
.wish-tools{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.wish-tools .btn{min-height:44px;white-space:normal}.wish-notice{padding:15px;border-radius:16px;background:var(--accent-soft);color:var(--accent-solid);overflow-wrap:anywhere}.wish-compose,.wish-preview,.wish-code,.wish-transfer,.wish-ticket{padding:20px;margin:16px 0}.wish-compose label{display:grid;gap:8px;margin:14px 0;font-size:13px}.wish-compose select{width:100%;text-overflow:ellipsis}.wishes-page h2{font-size:19px;margin:8px 0 12px;overflow-wrap:anywhere}.wishes-page p{line-height:1.65;overflow-wrap:anywhere}.wish-help,.wish-ticket small{color:var(--text-2);font-size:12px;line-height:1.65}.wish-code{text-align:center;scroll-margin-top:16px}.wish-code img{display:block;width:min(100%,320px);height:auto;margin:16px auto;border-radius:12px;background:white}.wish-code details{text-align:left;margin:16px 0;font-size:13px}.wish-code summary{padding:12px 0}.wish-code textarea{overflow-wrap:anywhere;word-break:break-all}.wish-price{font-size:27px;color:var(--accent-solid)}.wish-eyebrow{font-size:12px;color:var(--accent-solid)}.wish-tabs{display:flex;gap:5px;padding:5px;border-radius:15px;background:var(--accent-soft)}.wish-tabs button{flex:1;min-width:0;min-height:44px;border:0;border-radius:12px;background:transparent;color:var(--text-2);font:inherit;font-size:13px}.wish-tabs [aria-pressed=true]{background:var(--card);color:var(--accent-solid)}.wish-filter{display:flex;gap:8px;align-items:center;font-size:13px;padding:16px 0}.wish-ticket{border-left:3px solid var(--accent-solid)}.wish-ticket-title{display:flex;justify-content:space-between;gap:10px;align-items:start}.wish-ticket-title strong{white-space:nowrap;color:var(--accent-solid)}.wish-empty{padding:24px;color:var(--text-2);font-size:13px}.wish-preview{scroll-margin-top:16px}.wish-transfer input[type=file]{max-width:170px;font-size:11px}.wish-transfer textarea{width:100%;box-sizing:border-box}
@media(max-width:360px){.wish-heading h1{font-size:23px}.wish-heading .btn{padding:10px}.wish-compose,.wish-code,.wish-preview,.wish-ticket{padding:16px}.wish-intro{padding:16px}.wish-tools .btn{flex:1}.wish-intro strong{font-size:15px}}
</style>
