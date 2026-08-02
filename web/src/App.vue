<template>
  <!-- 4 个 Tab 页常驻轨道，ViewPager 式滑动切换（只挂载一次，不卸载） -->
  <div v-show="!isSecondary" class="swipe-stage" :class="{ 'launching-shell': showLaunch }">
    <div class="swipe-track" :style="trackStyle">
      <div v-for="p in tabPages" :key="p.path" class="swipe-page">
        <component :is="p.component" />
      </div>
    </div>
  </div>
  <!-- 二级页（任务管理 / 计时历史 / 日期详情）走 router-view -->
  <div v-if="isSecondary" class="page-layer" :class="{ 'launching-shell': showLaunch }">
    <router-view v-slot="{ Component }">
      <transition name="fade-slide" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </div>
  <TabBar :class="{ 'launching-shell': showLaunch }" />
  <LaunchIntro v-if="showLaunch" @done="showLaunch = false" />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import TabBar from './components/TabBar.vue';
import LaunchIntro from './components/LaunchIntro.vue';
import TodayView from './views/TodayView.vue';
import TimerView from './views/TimerView.vue';
import DrillView from './views/DrillView.vue';
import SettingsView from './views/SettingsView.vue';
import { useSwipeTabs, TAB_PATHS } from './lib/swipeTabs';
import { shouldPlayStartupAnimation } from './lib/localPreferences';

const { trackStyle, isTabPage } = useSwipeTabs();
const isSecondary = computed(() => !isTabPage.value);
const showLaunch = ref(shouldPlayStartupAnimation());

const tabPages = [
  { path: TAB_PATHS[0], component: TodayView },
  { path: TAB_PATHS[1], component: TimerView },
  { path: TAB_PATHS[2], component: DrillView },
  { path: TAB_PATHS[3], component: SettingsView },
];
</script>

<style scoped>
.launching-shell {
  animation: shell-unlock 360ms cubic-bezier(0.22, 1, 0.36, 1) 180ms both;
}

@keyframes shell-unlock {
  from {
    opacity: 0;
    filter: blur(5px);
    transform: scale(0.94);
  }
  to {
    opacity: 1;
    filter: blur(0);
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .launching-shell {
    animation: shell-fade 160ms ease-out both;
  }

  @keyframes shell-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }
}
</style>
