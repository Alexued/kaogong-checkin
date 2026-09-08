<template>
  <div class="page pet-page">
    <header class="pet-heading"><button class="btn ghost" type="button" @click="navigateToParent(router)">‹ 计时</button><div><h1>宠物中心</h1><p>把一点点努力，变成陪伴。</p></div></header>
    <section class="card pet-home">
      <div class="pet-home-heading"><div><span class="eyebrow">{{ pet.debugMode ? 'TEST · 测试沙盒' : 'MY COMPANION' }}</span><h2>{{ pet.data.name }}</h2></div><div class="pet-balance" data-testid="pet-balance">☆ {{ pet.data.stars }}<small>可用星星</small></div></div>
      <PetAvatar />
      <div class="pet-metrics"><span>饱食度<strong>{{ pet.data.satiety }}/100</strong></span><span>已喂养<strong>{{ pet.data.feedCount }} 次</strong></span><span>累计获得<strong>{{ pet.data.totalEarned }} ☆</strong></span></div>
      <PetSpeciesPicker />
    </section>
    <router-link to="/rewards" class="card personal-rewards-link"><span><strong>我的奖励</strong><small>用星星兑换自己的小期待</small></span><span>☆ {{ pet.data.stars }} · 去兑换 ›</span></router-link>
    <p v-if="pet.storageBlocked" class="pet-alert">宠物存档读取失败，已停止写入以保护原始数据。</p>
    <p v-if="pet.message" class="pet-notice" :class="{ error: pet.failed }" role="status" aria-live="polite">{{ pet.message }}</p>
    <nav class="pet-tabs" aria-label="宠物功能"><button v-for="tab in tabs" :key="tab.id" type="button" :class="{ selected: panel === tab.id }" :aria-pressed="panel === tab.id" @click="panel = tab.id">{{ tab.label }}</button></nav>
    <div v-if="panel !== 'settings'" class="card pet-live-preview"><PetAvatar compact /><div><strong>{{ pet.data.name }}</strong><small>{{ pet.message || '装备或喂养后，在这里即时预览' }}</small></div><span>☆ {{ pet.data.stars }}</span></div>
    <section v-if="panel === 'shop'" aria-label="宠物功能">
      <div class="category-list" data-swipe-ignore><button v-for="id in PET_CATEGORIES" :key="id" class="category-chip" :class="{ selected: category === id }" type="button" :aria-pressed="category === id" @click="category = id">{{ PET_CATEGORY_LABELS[id] }}</button></div>
      <div class="shop-summary"><span>{{ PET_CATEGORY_LABELS[category] }} · {{ PET_CATALOG[category].length }} 件</span><button class="text-button" type="button" :disabled="pet.storageBlocked" @click="pet.clearEquipment">恢复默认装扮</button></div>
      <div class="pet-items"><article v-for="item in PET_CATALOG[category]" :key="item.id" class="card pet-item" :data-item="item.id">
        <span class="item-icon" aria-hidden="true">{{ item.icon }}</span><h3>{{ item.name }}</h3><p>{{ category === 'foods' ? '库存 ' + (pet.data.foodInventory[item.id] || 0) + ' 份' : owned(item.id) ? '已拥有' : '兑换后永久拥有' }}</p>
        <button v-if="category === 'foods' || !owned(item.id)" class="btn buy" type="button" :disabled="pet.storageBlocked || pet.data.stars < item.cost" :aria-label="'兑换' + item.name" @click="pet.buy(category, item.id)">{{ item.cost }} ☆ 兑换</button>
        <button v-else class="btn ghost" type="button" :disabled="equipped(item.id) || pet.storageBlocked" :aria-label="(equipped(item.id) ? '已装备' : '装备') + item.name" @click="pet.equip(category, item.id)">{{ equipped(item.id) ? '已装备' : '装备' }}</button>
      </article></div>
      <p class="pet-help">食物需先兑换再喂养，每次消耗 1 份库存；其他物品兑换后可装备。</p>
    </section>
    <section v-else-if="panel === 'feed'" aria-label="宠物功能">
      <div v-if="!foodCount" class="card empty-food"><h3>还没有可以喂的食物</h3><p>先兑换一份食物，再回来喂给它。</p><button class="btn" type="button" @click="category = 'foods'; panel = 'shop'">去兑换食物</button></div>
      <div class="pet-items"><article v-for="food in PET_CATALOG.foods" :key="food.id" class="card pet-item" :data-food="food.id"><span class="item-icon" aria-hidden="true">{{ food.icon }}</span><h3>{{ food.name }}</h3><p>剩余 {{ pet.data.foodInventory[food.id] || 0 }} 份</p><button class="btn" type="button" :disabled="!pet.data.foodInventory[food.id] || pet.storageBlocked" :aria-label="'喂一份' + food.name" @click="pet.feed(food.id)">喂一份</button></article></div>
      <p class="pet-help">食物需先兑换再喂养，每次消耗 1 份库存；其他物品兑换后可装备。</p>
    </section>
    <section v-else class="pet-settings" aria-label="宠物功能">
      <form class="card settings-card" @submit.prevent="pet.rename(name)"><label for="pet-name">给宠物起个名字（最多10个字）</label><div class="name-row"><input id="pet-name" v-model="name" class="input" maxlength="20" autocomplete="off"><button class="btn" type="submit" :disabled="pet.storageBlocked">保存</button></div></form>
      <section class="card settings-card"><h3>一起积攒小星星</h3><p>完成番茄专注获得 10 颗星；休息、提前结束和重复结算不发奖励。星星也可兑换「我的奖励」。</p><p>新增10种伙伴各有22组四帧矢量动画；原仓鼠保留九宫格姿势轮播。服装、配饰和交通工具以图标叠加。切换伙伴不会消耗星星，食物库存共用。</p></section>
      <section class="card settings-card"><h3>宠物专用备份</h3><p>宠物数据独立保存，不影响学习记录。完整完成番茄专注可获得 10 颗星。</p><div class="backup-actions"><button class="btn ghost" type="button" @click="backup = pet.exportData()">导出备份文本</button><label class="btn ghost file-button">选择备份文件<input type="file" accept=".json,application/json" :disabled="pet.storageBlocked || timerBusy" @change="readBackup"></label></div><textarea v-if="backup" v-model="backup" class="input backup-text" rows="7" aria-label="宠物备份 JSON"></textarea><button v-if="backup" class="btn ghost" type="button" @click="copyBackup">复制备份文本</button><p v-if="backupMessage" role="status">{{ backupMessage }}</p></section>
      <section v-if="pet.debugAllowed" class="card settings-card debug-card"><h3>内部测试 · 不改真实存档</h3><p>测试沙盒初始余额 99999，正常扣减。退出后恢复真实存档。5 秒测试不写学习历史。</p><p v-if="timerBusy">请先结束当前计时，再切换测试工具。</p><div class="debug-actions"><button v-if="!pet.debugMode" class="btn" type="button" :disabled="timerBusy || pet.storageBlocked" @click="pet.startDebug">开启 99999 星沙盒</button><template v-else><button class="btn ghost" type="button" :disabled="timerBusy" @click="pet.stockDebug">全部解锁 / 食物 99 份</button><button class="btn ghost" type="button" :disabled="timerBusy" :aria-pressed="pet.shortPomodoro" @click="pet.toggleShortPomodoro">{{ pet.shortPomodoro ? '关闭 5 秒番茄测试' : '开启 5 秒番茄测试' }}</button><button class="btn danger" type="button" :disabled="timerBusy" @click="restore">退出沙盒并恢复数据</button></template></div><p>宠物数据独立保存，不影响学习记录。完整完成番茄专注可获得 10 颗星。</p></section>
    </section>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { navigateToParent } from '../lib/backNavigation';
import { confirmDialog } from '../lib/appDialog';
import { pomodoro } from '../lib/pomodoro';
import { stopwatch, countdown } from '../lib/stopwatch';
import { usePetStore } from '../stores/pet';
import PetAvatar from '../components/PetAvatar.vue';
import PetSpeciesPicker from '../components/PetSpeciesPicker.vue';
import { PET_CATEGORIES, PET_CATEGORY_LABELS, PET_CATALOG, PET_SLOTS, type PetCategory } from '../data/petCatalog';
const router = useRouter();
const pet = usePetStore();
const tabs = [{ id: 'shop', label: '商店与装扮' }, { id: 'feed', label: '喂养' }, { id: 'settings', label: '设置' }] as const;
const panel = ref<'shop' | 'feed' | 'settings'>('shop');
const category = ref<PetCategory>('actions');
const name = ref(pet.data.name);
const backup = ref('');
const backupMessage = ref('');
watch(() => pet.data.name, value => { name.value = value; });
const timerBusy = computed(() => !!(pomodoro.startedAt || stopwatch.startedAt || countdown.startedAt));
const foodCount = computed(() => Object.values(pet.data.foodInventory).reduce((sum, count) => sum + count, 0));
function owned(id: string) { return pet.data.unlocked[category.value].includes(id); }
function equipped(id: string) { const slot = PET_SLOTS[category.value]; return !!slot && pet.data.equipped[slot] === id && !(category.value === 'actions' && pet.data.equipped.state); }
async function restore() {
  if (await confirmDialog({ title: '退出测试沙盒？', message: '测试购买、库存和奖励将丢弃，真实宠物存档保持不变。', confirmLabel: '恢复真实数据' })) { if (!timerBusy.value) pet.restoreDebug(); }
}
async function readBackup(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > 2_000_000) throw new Error('备份不能超过 2 MB');
    const text = await file.text();
    if (await confirmDialog({ title: '导入宠物备份？', message: '将替换当前' + (pet.debugMode ? '沙盒' : '真实') + '宠物数据。建议先导出备份，不影响学习记录。离线钥匙身份不随备份迁移，换机后需重新收下心愿。', confirmLabel: '导入宠物', variant: 'warning' })) { if (!timerBusy.value) pet.importData(text); }
  } catch (error) { backupMessage.value = error instanceof Error ? error.message : '请保存备份后重试'; }
  finally { input.value = ''; }
}
async function copyBackup() {
  try { await navigator.clipboard.writeText(backup.value); backupMessage.value = '已复制，请粘贴到安全位置保存'; }
  catch { backupMessage.value = '系统不允许自动复制，请长按备份文本全选复制'; }
}
</script>
<style scoped>
.pet-page{padding-bottom:calc(116px + env(safe-area-inset-bottom))}.pet-heading{display:flex;align-items:center;gap:14px;margin-bottom:18px}.pet-heading h1{font-size:23px;margin:0 0 4px}.pet-heading p{font-size:12px;color:var(--text-2);margin:0}.pet-home{padding:18px}.pet-home-heading{display:flex;justify-content:space-between}.pet-balance{color:var(--accent-solid);font-size:24px}.pet-balance small{display:block;font-size:11px;color:var(--text-2)}.eyebrow{color:var(--accent-solid);font-size:10px}.pet-metrics{display:flex;justify-content:space-between;gap:8px;margin-top:14px;color:var(--text-2);font-size:11px}.pet-metrics strong{display:block;color:var(--text);margin-top:5px}.pet-tabs{display:flex;padding:4px;gap:4px;margin:18px 0;background:var(--accent-soft);border-radius:14px}.pet-tabs button{flex:1;min-height:44px;border:0;border-radius:10px;background:transparent;color:var(--text-2);font:inherit}.pet-tabs .selected{color:var(--accent-solid);background:var(--card)}.category-list{display:flex;flex-wrap:wrap;gap:8px}.category-chip{min-height:36px;border-radius:20px;padding:7px 13px;border:1px solid var(--card-border);background:var(--card);color:var(--text-2)}.category-chip.selected{color:var(--accent-solid);background:var(--accent-soft)}.shop-summary{margin:14px 0;color:var(--text-2)}.pet-items{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.pet-item{text-align:center;padding:16px 10px}.item-icon{display:block;font-size:30px;min-height:36px}.pet-item h3{font-size:14px}.pet-item p{font-size:11px;color:var(--text-2)}.pet-item .btn{width:100%;font-size:12px}.settings-card{padding:18px}.name-row{display:flex;gap:10px;margin-top:12px}.name-row .input{min-width:0;flex:1}@media(min-width:520px){.pet-items{grid-template-columns:repeat(3,minmax(0,1fr))}}
.pet-home-heading{gap:12px;align-items:center;flex-wrap:wrap}.pet-home-heading>div:first-child{min-width:0;flex:1 1 110px}.pet-home h2{overflow-wrap:anywhere;margin:4px 0 14px}.pet-balance{flex-shrink:0;text-align:right;font-variant-numeric:tabular-nums}.pet-tabs button{min-width:0;font-size:13px}.pet-heading>button{flex-shrink:0}.pet-metrics span{min-width:0;overflow-wrap:anywhere}.pet-item .btn{min-height:44px;padding:9px 6px}.pet-item .btn:disabled{opacity:.5}.shop-summary{display:flex;gap:8px;align-items:center;justify-content:space-between}.text-button{background:none;border:0;color:var(--accent-solid);min-height:44px}.pet-help,.settings-card p{color:var(--text-2);font-size:12px;line-height:1.7}.pet-notice,.pet-alert{padding:12px;border-radius:12px;background:var(--accent-soft);color:var(--accent-solid);overflow-wrap:anywhere}.pet-notice.error,.pet-alert{color:var(--text);background:var(--warn-soft)}.pet-settings{display:grid;gap:14px}.settings-card h3{font-size:15px;margin-top:0}.empty-food{padding:20px;text-align:center;margin-bottom:14px}.debug-actions,.backup-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}.debug-actions .btn,.backup-actions .btn{font-size:12px;max-width:100%;white-space:normal}.debug-card{border-style:dashed;border-color:var(--accent-solid)}.backup-text{font-family:monospace;margin:14px 0;resize:vertical;width:100%;box-sizing:border-box}.file-button{position:relative;overflow:hidden}.file-button input{position:absolute;inset:0;opacity:0;width:100%;cursor:pointer}.pet-page button:focus-visible,.pet-page input:focus-visible{outline:2px solid var(--accent-solid);outline-offset:3px}
</style>
<style scoped>
.pet-live-preview{position:sticky;top:8px;z-index:3;display:flex;align-items:center;gap:10px;padding:8px 10px;margin:0 0 14px;background:var(--card);box-shadow:0 4px 16px #0000000c}.pet-live-preview>div{flex:1;min-width:0}.pet-live-preview strong{display:block;font-size:13px;overflow-wrap:anywhere}.pet-live-preview small{display:block;margin-top:4px;font-size:10px;line-height:1.5;color:var(--text-2);overflow-wrap:anywhere}.pet-live-preview>span{color:var(--accent-solid);font-size:12px;white-space:nowrap}.pet-live-preview :deep(.pet-scene){flex:0 0 52px;width:52px;min-height:52px}.pet-live-preview :deep(.pet-figure){width:48px;height:48px}@media(max-height:450px){.pet-live-preview{position:static}}
</style>
<style scoped>
.personal-rewards-link{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px;margin-top:14px;color:var(--accent-solid);text-decoration:none;font-size:13px}.personal-rewards-link strong{display:block;color:var(--text);font-size:15px}.personal-rewards-link small{display:block;color:var(--text-2);font-size:11px;margin-top:5px}.personal-rewards-link>span{min-width:0;overflow-wrap:anywhere}
</style>
