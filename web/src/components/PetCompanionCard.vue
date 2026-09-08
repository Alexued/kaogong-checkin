<template>
  <div class="card pet-companion-card" :class="{ compact: sessionActive }">
  <router-link to="/pet" class="companion-main" aria-label="打开宠物中心">
    <PetAvatar :active="active && running" compact />
    <div class="pet-copy"><span class="pet-kicker">{{ pet.debugMode ? '内部测试沙盒' : '专注陪伴' }}</span><strong>{{ pet.data.name }}</strong><span>{{ running ? '我陪你一起完成这一轮' : '每完成一个番茄，获得 10 颗星' }}</span></div>
  </router-link>
    <router-link to="/rewards" class="pet-wallet" aria-label="打开我的奖励"><strong>☆ {{ pet.data.stars }}</strong><span>我的奖励 ›</span></router-link>
  </div>
</template>
<script setup lang="ts">
import { usePetStore } from '../stores/pet';
import PetAvatar from './PetAvatar.vue';
defineProps<{ active: boolean; running: boolean; sessionActive: boolean }>();
const pet = usePetStore();
</script>
<style scoped>
.pet-companion-card{display:flex;align-items:center;gap:12px;flex:0 0 auto;padding:10px 12px;margin-top:10px;color:var(--text);text-decoration:none}.pet-copy{display:flex;flex:1;min-width:0;flex-direction:column;gap:3px}.pet-copy strong{font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pet-copy>span:last-child{font-size:10px;color:var(--text-2)}.pet-kicker{font-size:10px;color:var(--accent-solid);font-weight:700}.pet-wallet{display:flex;flex-direction:column;gap:6px;text-align:right;white-space:nowrap}.pet-wallet strong{font-size:14px;color:var(--accent-solid);font-variant-numeric:tabular-nums}.pet-wallet span{font-size:11px;color:var(--text-2)}.compact{padding:5px 10px;margin-top:6px}.compact :deep(.pet-scene){min-height:42px;height:42px;width:42px}.compact :deep(.pet-figure){width:38px;height:38px}.compact .pet-copy>span:last-child{display:none}@media(max-width:360px){.pet-companion-card{gap:8px}.pet-copy>span:last-child{display:none}}@media(max-height:500px) and (orientation:landscape){.pet-companion-card{display:none}}
</style>
<style scoped>
.companion-main{display:flex;align-items:center;gap:12px;flex:1;min-width:0;color:inherit;text-decoration:none}.pet-wallet{min-height:44px;justify-content:center;text-decoration:none;flex-shrink:0}.companion-main:focus-visible,.pet-wallet:focus-visible{outline:2px solid var(--accent-solid);outline-offset:3px}@media(max-width:360px){.companion-main{gap:8px}}
</style>
