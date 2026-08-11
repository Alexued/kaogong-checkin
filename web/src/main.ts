import { createApp, watch } from 'vue';
import { createPinia } from 'pinia';
import { MotionPlugin } from '@vueuse/motion';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import App from './App.vue';
import { router } from './router';
import { useAppStore } from './stores/app';
import { initializeComputerSync } from './api/computer-sync';
import { initializeDeviceSync } from './api/device-sync';
import { dismissTopBackLayer, resolveBackAction } from './lib/backNavigation';
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

function applyAppMode(mode: string) {
  document.documentElement.dataset.appMode = mode === 'general' ? 'general' : 'exam';
  document.title = '格记';
}
applyAppMode(store.settings.appMode);
watch(
  () => store.settings.appMode,
  (mode) => applyAppMode(mode),
);

// 安卓返回键/返回手势：二级页回明确父页，Tab 根页退到桌面。
if (Capacitor.isNativePlatform()) {
  void CapApp.addListener('backButton', () => {
    const dismissibleLayers = document.querySelectorAll<HTMLElement>('[data-back-dismiss]');
    if (dismissTopBackLayer(dismissibleLayers)) return;

    const route = router.currentRoute.value;
    const action = resolveBackAction(route.path, route.meta.parentPath);
    if (action.type === 'minimize') {
      void CapApp.minimizeApp();
    } else {
      void router.replace(action.path);
    }
  });
}

void initializeComputerSync();
void initializeDeviceSync(() => { void router.push('/settings'); });

app.mount('#app');
