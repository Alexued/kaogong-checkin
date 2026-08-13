<template>
  <nav class="tabbar" aria-label="主导航">
    <span class="tab-indicator" :style="resolvedIndicatorStyle" aria-hidden="true"></span>
    <router-link
      v-for="t in tabs"
      :key="t.to"
      :to="t.to"
      class="tab"
      :class="{ active: isActive(t.to) }"
      :aria-current="isActive(t.to) ? 'page' : undefined"
    >
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
        stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="t.icon" />
      <span>{{ t.label }}</span>
    </router-link>
  </nav>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from 'vue';
import { useRoute } from 'vue-router';
import { useAppStore } from '../stores/app';

const route = useRoute();
const store = useAppStore();
const props = defineProps<{ indicatorStyle?: CSSProperties }>();
const tabs = computed(() => [
  {
    to: '/',
    label: '今日',
    icon: '<rect x="3" y="4" width="18" height="18" rx="3"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="m9 16 2 2 4-4"/>',
  },
  {
    to: '/timer',
    label: '计时',
    icon: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M9 2h6"/>',
  },
  {
    to: '/drill',
    label: store.settings.appMode === 'general' ? '复盘' : '背诵',
    icon: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  },
  {
    to: '/settings',
    label: '设置',
    icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  },
]);

const activeTabIndex = computed(() => {
  const root = typeof route.meta.rootTab === 'string' ? route.meta.rootTab : route.path;
  const index = tabs.value.findIndex((tab) => tab.to === root || (tab.to !== '/' && route.path.startsWith(tab.to)));
  return Math.max(0, index);
});

const resolvedIndicatorStyle = computed<CSSProperties>(() => props.indicatorStyle || ({
  transform: `translate3d(${activeTabIndex.value * 100}%, 0, 0)`,
  transition: 'transform 320ms cubic-bezier(0.32, 0.72, 0, 1)',
}));

function isActive(to: string) {
  if (route.meta.rootTab === to) return true;
  return to === '/' ? route.path === '/' : route.path.startsWith(to);
}
</script>

<style scoped>
.tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: space-around;
  padding: 8px 10px calc(8px + env(safe-area-inset-bottom));
  background: var(--tabbar);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border-top: 1px solid var(--card-border);
  z-index: 50;
  transition: background-color 280ms ease;
}

.tab-indicator {
  position: absolute;
  top: -1px;
  left: 0;
  width: 25%;
  height: 3px;
  border-radius: 0 0 3px 3px;
  background: var(--accent-solid);
  pointer-events: none;
  will-change: transform;
}

.tab {
  min-width: 44px;
  min-height: 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  text-decoration: none;
  color: var(--text-3);
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 12px;
  transition:
    color 200ms ease,
    transform 160ms cubic-bezier(0.16, 1, 0.3, 1);
}

.tab:active {
  transform: scale(0.94);
}

.tab.active {
  color: var(--accent-solid);
}

.tab:focus-visible {
  outline: 2px solid var(--accent-solid);
  outline-offset: 1px;
}

/* 平板 / 宽屏：底栏与内容列同宽居中 */
@media (min-width: 768px) {
  .tabbar {
    left: 50%;
    right: auto;
    width: min(880px, 100%);
    transform: translateX(-50%);
    border-left: 1px solid var(--card-border);
    border-right: 1px solid var(--card-border);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tab-indicator, .tab { transition-duration: 0.01ms !important; }
}
</style>
