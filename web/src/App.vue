<template>
  <!-- 4 个 Tab 页常驻轨道，ViewPager 式滑动切换（只挂载一次，不卸载） -->
  <div v-show="!isSecondary" class="swipe-stage" :class="shellClass">
    <div class="swipe-track" :style="trackStyle">
      <div
        v-for="(p, index) in tabPages"
        :key="p.path"
        class="swipe-page"
        :inert="!isActiveRootPage(p.path)"
        :aria-hidden="isActiveRootPage(p.path) ? undefined : 'true'"
      >
        <div class="swipe-page-content" :style="pageStyle(index)">
          <component :is="p.component" />
        </div>
      </div>
    </div>
  </div>
  <!-- 二级页（任务管理 / 计时历史 / 日期详情）走 router-view -->
  <div v-if="isSecondary" class="page-layer" :class="shellClass">
    <router-view v-slot="{ Component }">
      <transition name="fade-slide" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </div>
  <TabBar :class="shellClass" />
  <LaunchIntro v-if="showLaunch" @done="finishLaunch" />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, provide, readonly, ref } from 'vue';
import { useRoute } from 'vue-router';
import TabBar from './components/TabBar.vue';
import LaunchIntro from './components/LaunchIntro.vue';
import TodayView from './views/TodayView.vue';
import TimerView from './views/TimerView.vue';
import DrillView from './views/DrillView.vue';
import SettingsView from './views/SettingsView.vue';
import { useSwipeTabs, TAB_PATHS } from './lib/swipeTabs';
import { shouldPlayStartupAnimation } from './lib/localPreferences';
import { SHELL_PHASE_KEY, type ShellPhase } from './lib/shellPhase';

const { trackStyle, pageStyle, isTabPage } = useSwipeTabs();
const route = useRoute();
const isSecondary = computed(() => !isTabPage.value);
const isActiveRootPage = (path: string) => isTabPage.value && route.path === path;
const launchEnabled = shouldPlayStartupAnimation();
const showLaunch = ref(launchEnabled);
const shellPhase = ref<ShellPhase>(launchEnabled ? 'pending' : 'ready');
provide(SHELL_PHASE_KEY, readonly(shellPhase));
const shellClass = computed(() => ({
  'shell-pending': shellPhase.value === 'pending',
  'shell-entering': shellPhase.value === 'entering',
}));
let shellTimer: ReturnType<typeof setTimeout> | null = null;

function finishLaunch() {
  showLaunch.value = false;
  requestAnimationFrame(() => {
    shellPhase.value = 'entering';
    shellTimer = setTimeout(() => {
      shellPhase.value = 'ready';
      shellTimer = null;
    }, 480);
  });
}

onBeforeUnmount(() => {
  if (shellTimer) clearTimeout(shellTimer);
});

const tabPages = [
  { path: TAB_PATHS[0], component: TodayView },
  { path: TAB_PATHS[1], component: TimerView },
  { path: TAB_PATHS[2], component: DrillView },
  { path: TAB_PATHS[3], component: SettingsView },
];
</script>

<style scoped>
.shell-pending {
  opacity: 0;
  translate: 0 18px;
  scale: 0.94;
}

.shell-entering {
  animation: shell-unlock 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
  will-change: translate, scale, opacity;
}

.tabbar.shell-entering {
  animation-delay: 45ms;
}

@keyframes shell-unlock {
  from {
    opacity: 0;
    translate: 0 18px;
    scale: 0.94;
  }
  to {
    opacity: 1;
    translate: 0 0;
    scale: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .shell-entering {
    animation: shell-fade 160ms ease-out both;
  }

  @keyframes shell-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }
}
</style>
