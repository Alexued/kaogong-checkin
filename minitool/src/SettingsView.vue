<template>
  <div class="page mini-settings">
    <header><span class="mini-eyebrow">LOCAL FIRST</span><h1>我的格记</h1><p>把一点点努力，变成陪伴。</p></header>
    <section class="card mini-card"><h2>使用偏好</h2><label>主题<select class="input" :value="store.settings.theme" @change="store.saveSettings({ theme: ($event.target as HTMLSelectElement).value as 'light' | 'dark' })"><option value="light">浅色</option><option value="dark">深色</option></select></label><label>学习模式<select class="input" :value="store.settings.appMode" @change="store.saveSettings({ appMode: ($event.target as HTMLSelectElement).value as 'general' | 'exam' })"><option value="general">通用打卡</option><option value="exam">考公学习</option></select></label></section>
    <section class="card mini-card"><h2>学习与陪伴</h2><div class="mini-links"><router-link class="btn ghost" to="/stats">学习统计</router-link><router-link class="btn ghost" to="/pet">宠物中心</router-link><router-link class="btn ghost" to="/rewards">我的奖励</router-link><router-link class="btn ghost" to="/poster">今日打卡海报</router-link></div></section>
    <section class="card mini-card"><h2>本地学习备份</h2><p>数据只保存在当前小工具，不与 Android 自动同步。容器可能清理存储，请定期保存备份。宠物备份请前往宠物中心。</p><button class="btn ghost" @click="backup = exportLearningText()">显示学习备份文本</button><textarea v-model="backup" class="input mini-backup" rows="5" maxlength="2000000" aria-label="学习备份文本" placeholder="在此选中备份文本，或手动粘贴要导入的学习备份"></textarea><button class="btn ghost" :disabled="!backup" @click="restore">校验并导入学习备份</button><p role="status">{{ message }}</p></section>
    <section class="card mini-card"><h2>关于小工具版</h2><p>11 种宠物 · 完全离线 · 精简题库 {{ ANALYSIS_BANK_COUNT }} 题</p><p>保留经典风格与学习奖励，不提供联网同步、APK 更新、系统提醒或 OCR。离开页面后，计时会在下次打开时恢复计算；不承诺后台持续运行。</p><p>心愿券必须通过本机签名和小钥匙确认。不支持密钥能力的环境会明确提示，不会降低校验要求。</p></section>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { useAppStore } from '../../web/src/stores/app';
import { exportLearningText, importLearningText } from './persistence';
import { confirmDialog } from '../../web/src/lib/appDialog';
import { ANALYSIS_BANK_COUNT } from '../../web/src/lib/questionBank';
import { readableError } from './platform';
const store = useAppStore(); const backup = ref(''); const message = ref('');
async function restore() {
  if (!await confirmDialog({ title: '替换本地学习记录？', message: '仅替换此小工具的学习记录，不替换宠物或签名私钥。请先保留原备份。', confirmLabel: '导入备份', variant: 'warning' })) return;
  try { importLearningText(backup.value); message.value = '学习备份已导入。'; } catch (error) { message.value = readableError(error); }
}
</script>
