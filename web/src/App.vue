<template>
  <!-- 5 个 Tab 页常驻轨道，ViewPager 式滑动切换（只挂载一次，不卸载） -->
  <div v-show="!isSecondary" class="swipe-stage">
    <div class="swipe-track" :style="trackStyle">
      <div v-for="p in tabPages" :key="p.path" class="swipe-page">
        <component :is="p.component" />
      </div>
    </div>
  </div>
  <!-- 二级页（任务管理 / 计时历史 / 日期详情）走 router-view -->
  <div v-if="isSecondary" class="page-layer">
    <router-view v-slot="{ Component }">
      <transition name="fade-slide" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </div>
  <TabBar />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import TabBar from './components/TabBar.vue';
import TodayView from './views/TodayView.vue';
import TimerView from './views/TimerView.vue';
import DrillView from './views/DrillView.vue';
import StatsView from './views/StatsView.vue';
import SettingsView from './views/SettingsView.vue';
import { useSwipeTabs, TAB_PATHS } from './lib/swipeTabs';

const { trackStyle, isTabPage } = useSwipeTabs();
const isSecondary = computed(() => !isTabPage.value);

const tabPages = [
  { path: TAB_PATHS[0], component: TodayView },
  { path: TAB_PATHS[1], component: TimerView },
  { path: TAB_PATHS[2], component: DrillView },
  { path: TAB_PATHS[3], component: StatsView },
  { path: TAB_PATHS[4], component: SettingsView },
];
</script>
