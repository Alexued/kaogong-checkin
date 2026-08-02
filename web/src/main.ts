import { createApp, watch } from 'vue';
import { createPinia } from 'pinia';
import { MotionPlugin } from '@vueuse/motion';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import App from './App.vue';
import { router } from './router';
import { useAppStore } from './stores/app';
import { startSync } from './api/sync';
import { startDiscovery } from './api/discover';
import './styles/theme.css';
import './styles/app.css';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(router);
app.use(MotionPlugin);

const store = useAppStore();

// 主题：跟随 settings.theme 切换 html[data-theme]
function applyTheme(theme: string) {
  document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
}
applyTheme(store.settings.theme);
watch(
  () => store.settings.theme,
  (t) => applyTheme(t)
);

// 安卓返回键/返回手势：二级页路由后退，Tab 根页退到桌面（不闪退）
if (Capacitor.isNativePlatform()) {
  const ROOT_TABS = new Set(['/', '/timer', '/drill', '/settings']);
  void CapApp.addListener('backButton', () => {
    const path = router.currentRoute.value.path;
    if (!ROOT_TABS.has(path) && window.history.state?.back) {
      router.back();
    } else if (!ROOT_TABS.has(path)) {
      // 二级页但没有可退的历史（极端情况）：回今日页
      void router.push('/');
    } else {
      void CapApp.minimizeApp();
    }
  });
}

void startSync();
void startDiscovery();

app.mount('#app');
