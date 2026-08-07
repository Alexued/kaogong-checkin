import { createRouter, createWebHistory } from 'vue-router';
import TodayView from './views/TodayView.vue';
import TimerView from './views/TimerView.vue';
import TimerHistoryView from './views/TimerHistoryView.vue';
import DrillView from './views/DrillView.vue';
import TasksView from './views/TasksView.vue';
import StatsView from './views/StatsView.vue';
import DayDetailView from './views/DayDetailView.vue';
import SettingsView from './views/SettingsView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'today', component: TodayView },
    { path: '/timer', name: 'timer', component: TimerView },
    {
      path: '/timer/history',
      name: 'timer-history',
      component: TimerHistoryView,
      meta: { parentPath: '/timer', rootTab: '/timer' },
    },
    { path: '/drill', name: 'drill', component: DrillView },
    {
      path: '/tasks',
      name: 'tasks',
      component: TasksView,
      meta: { parentPath: '/', rootTab: '/' },
    },
    {
      path: '/stats',
      name: 'stats',
      component: StatsView,
      meta: { parentPath: '/settings', rootTab: '/settings' },
    },
    {
      path: '/stats/day/:date',
      name: 'day-detail',
      component: DayDetailView,
      meta: { parentPath: '/settings', rootTab: '/settings' },
    },
    { path: '/settings', name: 'settings', component: SettingsView },
  ],
});
