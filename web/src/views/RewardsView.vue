<template>
  <div class="page rewards-page">
    <header class="rewards-heading"><button class="btn ghost" type="button" @click="navigateToParent(router)">‹ 宠物</button><div><h1><button class="reward-title" type="button" @click="developerTrigger++">我的奖励</button></h1><p>认真努力，也给自己一点期待。</p></div></header>
    <router-link class="card wish-entry" to="/wishes"><span>✉ 星星心愿券<small>离线收下心意，用一把小钥匙兑现</small></span><span aria-hidden="true">›</span></router-link>
    <DeveloperStars :trigger="developerTrigger" />
    <section class="card reward-wallet" aria-label="共享星星钱包"><div><span>{{ pet.debugMode ? '测试沙盒 · 不影响真实存档' : '与宠物商店共用星星' }}</span><strong data-testid="reward-balance">☆ {{ pet.data.stars }}</strong></div><button class="btn" type="button" :disabled="pet.storageBlocked || busy" @click="edit()">＋ 新建奖励</button></section>
    <p v-if="pet.message" class="reward-notice" :class="{ error: pet.failed }" role="status">{{ pet.message }}</p>
    <form v-if="editorOpen" ref="editor" class="card reward-editor" aria-label="奖励编辑" @submit.prevent="save">
      <h2>{{ editingId ? '编辑奖励' : '新建奖励' }}</h2>
      <label>奖励名称<input ref="nameInput" v-model="draft.name" class="input" placeholder="例如：游戏1小时" maxlength="80" required autocomplete="off"></label>
      <label>兑换价格<span class="price-input"><input v-model.number="draft.cost" class="input" type="number" inputmode="numeric" min="1" max="99999" step="1" required><span>颗星</span></span></label>
      <label>奖励说明<textarea v-model="draft.description" class="input" rows="3" maxlength="400" placeholder="写下想怎样奖励自己（选填）"></textarea></label>
      <p class="reward-help">名称最多40个字符，说明最多200个字符；价格为1至99999的整数。</p>
      <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
      <div class="editor-actions"><button type="button" class="btn ghost" @click="editorOpen = false">取消</button><button class="btn" type="submit" :disabled="pet.storageBlocked || busy">保存奖励</button></div>
    </form>
    <nav class="reward-tabs" aria-label="奖励分类"><button v-for="tab in tabs" :key="tab.id" type="button" :aria-pressed="panel === tab.id" :class="{ selected: panel === tab.id }" @click="panel = tab.id">{{ tab.label }}<span v-if="tab.id === 'pending'"> {{ pendingCount }}</span></button></nav>
    <template v-if="panel === 'shop'">
      <label class="reward-filter"><input v-model="includeDisabled" type="checkbox">显示已停用奖励</label>
      <div v-if="!visibleRewards.length" class="card reward-empty">这里还没有奖励，创建一个值得期待的小目标吧。</div>
      <div class="reward-list"><article v-for="reward in visibleRewards" :key="reward.id" class="card reward-item" :class="{ disabled: !reward.enabled }">
        <div class="reward-item-heading"><h2>{{ reward.name }}</h2><strong>☆ {{ reward.cost }}</strong></div><p class="reward-description">{{ reward.description || '给努力的自己一点奖励。' }}</p>
        <span v-if="!reward.enabled" class="reward-help">已停用，已兑换的奖励仍可使用</span>
        <router-link v-if="reward.enabled" class="wish-send" :to="{ path: '/wishes', query: { send: reward.id } }">✧ 送出心愿</router-link>
        <div class="reward-actions"><button class="btn ghost" type="button" :aria-label="'编辑' + reward.name" :disabled="busy || pet.storageBlocked" @click="edit(reward)">编辑</button><button class="btn ghost" type="button" :aria-label="(reward.enabled ? '停用' : '启用') + reward.name" :disabled="busy || pet.storageBlocked" @click="toggle(reward)">{{ reward.enabled ? '停用' : '启用' }}</button><button class="btn" type="button" :aria-label="'兑换' + reward.name" :disabled="busy || pet.storageBlocked || !reward.enabled || pet.data.stars < reward.cost" @click="redeem(reward)">{{ !reward.enabled ? '已停用' : pet.data.stars < reward.cost ? '星星不足' : '兑换奖励' }}</button></div>
      </article></div>
    </template>
    <template v-else>
      <p class="reward-help">兑换时的名称和价格会保留，标记使用不会再次扣星。</p>
      <div v-if="!visibleHistory.length" class="card reward-empty">{{ panel === 'pending' ? '还没有待使用的奖励。兑换后，它会出现在这里。' : '还没有兑换记录。' }}</div>
      <div class="reward-list"><article v-for="record in visibleHistory" :key="record.id" class="card reward-item">
        <div class="reward-item-heading"><h2>{{ record.name }}</h2><strong>−{{ record.cost }} ☆</strong></div><p v-if="record.description" class="reward-description">{{ record.description }}</p><p class="reward-help">兑换于 {{ formatDate(record.redeemedAt) }}</p>
        <button v-if="record.status === 'pending'" class="btn" type="button" :aria-label="'使用' + record.name + ' ' + record.id" :disabled="busy || pet.storageBlocked" @click="use(record)">标记已使用</button><p v-else class="reward-used">已使用 · {{ formatDate(record.usedAt!) }}</p>
      </article></div>
    </template>
    <p class="reward-help reward-disclaimer">这里记录你给自己的奖励，不会控制其他游戏或视频应用。</p>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { usePetStore } from '../stores/pet';
import { navigateToParent } from '../lib/backNavigation';
import { confirmDialog } from '../lib/appDialog';
import { validateRewardInput, type CustomReward, type RewardRedemption } from '../domain/customRewards';
import DeveloperStars from '../components/DeveloperStars.vue';
const developerTrigger = ref(0);
const router = useRouter();
const pet = usePetStore();
const panel = ref<'shop' | 'pending' | 'history'>('shop');
const tabs = [{ id: 'shop', label: '奖励清单' }, { id: 'pending', label: '待使用' }, { id: 'history', label: '兑换记录' }] as const;
const includeDisabled = ref(false);
const busy = ref(false);
const editorOpen = ref(false);
watch(editorOpen, open => document.documentElement.classList.toggle('pet-reward-editing', open));
onBeforeUnmount(() => document.documentElement.classList.remove('pet-reward-editing'));
const editingId = ref('');
const draft = reactive({ name: '', cost: 2, description: '' });
const formError = ref('');
const editor = ref<HTMLFormElement>();
const nameInput = ref<HTMLInputElement>();
const visibleRewards = computed(() => pet.data.customRewards.filter(reward => includeDisabled.value || reward.enabled));
const pendingCount = computed(() => pet.data.redemptions.filter(record => record.status === 'pending').length);
const visibleHistory = computed(() => [...pet.data.redemptions].filter(record => panel.value !== 'pending' || record.status === 'pending').sort((first, second) => Date.parse(second.redeemedAt) - Date.parse(first.redeemedAt)));
function formatDate(value: string) { return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
async function edit(reward?: CustomReward) {
  editingId.value = reward?.id || '';
  Object.assign(draft, { name: reward?.name || '', cost: reward?.cost || 2, description: reward?.description || '' });
  formError.value = ''; editorOpen.value = true;
  await nextTick(); editor.value?.scrollIntoView({ block: 'start' }); nameInput.value?.focus({ preventScroll: true });
}
function save() {
  try {
    const input = validateRewardInput(draft);
    if (pet.saveReward(editingId.value || crypto.randomUUID(), input)) { editorOpen.value = false; panel.value = 'shop'; }
    else formError.value = pet.message;
  } catch (error) { formError.value = error instanceof Error ? error.message : '请检查奖励内容'; }
}
async function redeem(reward: CustomReward) {
  if (busy.value) return;
  busy.value = true;
  const operationId = crypto.randomUUID();
  const sandbox = pet.debugMode;
  try {
    if (await confirmDialog({ title: '兑换这份奖励？', message: reward.name + '，需要 ' + reward.cost + ' 颗星。', details: ['当前余额：' + pet.data.stars + ' ☆', '兑换后余额：' + (pet.data.stars - reward.cost) + ' ☆', sandbox ? '本次仅扣除测试沙盒星星' : '兑换后可在待使用记录中查看'], confirmLabel: '确认兑换' })) {
      if (sandbox !== pet.debugMode) return;
      if (pet.redeemReward(reward.id, reward.revision, operationId)) panel.value = 'pending';
    }
  } finally { busy.value = false; }
}
async function toggle(reward: CustomReward) {
  if (busy.value) return;
  busy.value = true;
  const sandbox = pet.debugMode;
  try {
    if (!reward.enabled || await confirmDialog({ title: '停用这份奖励？', message: '停用后不再显示在可兑换列表，已有兑换记录保留。', confirmLabel: '停用奖励' })) {
      if (sandbox === pet.debugMode) pet.toggleReward(reward.id);
    }
  } finally { busy.value = false; }
}
async function use(record: RewardRedemption) {
  if (busy.value) return;
  busy.value = true;
  const sandbox = pet.debugMode;
  try {
    if (await confirmDialog({ title: '这份奖励已经享用了吗？', message: record.name + '。标记使用不会再次扣星。', confirmLabel: '标记已使用' })) {
      if (sandbox === pet.debugMode) pet.useReward(record.id);
    }
  } finally { busy.value = false; }
}
</script>
<style scoped>
.reward-title{font:inherit;color:inherit;background:none;border:0;padding:0;text-align:left;cursor:pointer}.wish-entry{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;margin-bottom:16px;text-decoration:none;color:var(--accent-solid);font-weight:700;gap:12px}.wish-entry small{display:block;font-size:12px;font-weight:400;color:var(--text-2);margin-top:6px}.wish-send{display:inline-block;padding:10px 0;color:var(--accent-solid);font-size:13px;text-decoration:none;min-height:44px}
.rewards-page{padding-bottom:calc(116px + env(safe-area-inset-bottom))}.rewards-heading{display:flex;align-items:center;gap:14px;margin-bottom:20px}.rewards-heading>button{flex-shrink:0}.rewards-heading h1{font-size:23px;margin:0 0 5px}.rewards-heading p{font-size:12px;color:var(--text-2);margin:0}.reward-wallet{padding:20px;display:flex;gap:14px;justify-content:space-between;align-items:center;flex-wrap:wrap}.reward-wallet span{font-size:12px;color:var(--text-2)}.reward-wallet strong{display:block;font-size:30px;color:var(--accent-solid);font-variant-numeric:tabular-nums;margin-top:8px;overflow-wrap:anywhere}.reward-wallet>div{min-width:0}.reward-notice{padding:12px 16px;background:var(--accent-soft);color:var(--accent-solid);border-radius:14px;overflow-wrap:anywhere}.reward-notice.error,.form-error{color:var(--text);background:var(--warn-soft)}.reward-editor{padding:20px;margin-top:16px;display:grid;gap:16px;scroll-margin-top:16px}.reward-editor h2,.reward-item h2{font-size:17px;margin:0}.reward-editor label{display:grid;gap:8px;font-size:13px;color:var(--text-2)}.reward-editor .input{width:100%;box-sizing:border-box;min-width:0}.price-input{display:flex;gap:10px;align-items:center}.price-input .input{flex:1;width:0}.price-input>span{flex-shrink:0}.editor-actions{display:flex;gap:10px;justify-content:flex-end}.reward-help{font-size:12px;line-height:1.7;color:var(--text-2);margin:0;overflow-wrap:anywhere}.reward-tabs{display:flex;gap:4px;background:var(--accent-soft);padding:4px;border-radius:14px;margin:20px 0 16px}.reward-tabs button{flex:1;min-width:0;min-height:44px;border:0;border-radius:10px;color:var(--text-2);background:transparent;font-size:13px}.reward-tabs .selected{background:var(--card);color:var(--accent-solid)}.reward-filter{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-2);min-height:44px;margin-bottom:8px}.reward-list{display:grid;gap:14px;margin-top:12px}.reward-item{padding:18px;min-width:0}.reward-item-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.reward-item-heading h2{min-width:0;overflow-wrap:anywhere;line-height:1.5}.reward-item-heading strong{flex-shrink:0;color:var(--accent-solid);font-size:17px;font-variant-numeric:tabular-nums}.reward-description{font-size:13px;line-height:1.7;color:var(--text-2);white-space:pre-wrap;overflow-wrap:anywhere;min-height:22px}.reward-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}.reward-actions .btn{min-height:44px;font-size:12px;padding:9px 14px}.reward-actions .btn:last-child{margin-left:auto}.reward-item>.btn{margin-top:16px;min-height:44px}.reward-item.disabled{border-style:dashed}.reward-empty{padding:24px;font-size:14px;color:var(--text-2);line-height:1.8}.reward-used{color:var(--accent-solid);font-size:13px;margin-bottom:0}.reward-disclaimer{margin-top:24px;text-align:center}.rewards-page button:focus-visible,.rewards-page input:focus-visible,.rewards-page textarea:focus-visible{outline:2px solid var(--accent-solid);outline-offset:3px}.rewards-page .btn:disabled{opacity:.5}
</style>
