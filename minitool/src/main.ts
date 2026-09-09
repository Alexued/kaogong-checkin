import { createApp, watch } from 'vue';
import { createPinia } from 'pinia';
import App from './AppRoot.vue';
import { router } from '../../web/src/router';
import { useAppStore } from '../../web/src/stores/app';
import { initializeLocalState } from './persistence';
import '../../web/src/styles/theme.css';
import '../../web/src/styles/app.css';
import './platform.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.directive('motion', {});
initializeLocalState();
const store = useAppStore();
watch(() => store.settings.theme, theme => { document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light'; }, { immediate: true });
watch(() => store.settings.appMode, mode => { document.documentElement.dataset.appMode = mode === 'general' ? 'general' : 'exam'; }, { immediate: true });
app.mount('#app');
