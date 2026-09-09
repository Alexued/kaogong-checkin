<template><section v-if="store.recoveryRequired || store.writeBlockedMessage" class="card mini-card" role="alert"><h2>本地保存需要处理</h2><p>{{ store.writeBlockedMessage || '读取存档失败，已停止写入以保护原始数据。' }}</p><p>请勿清空小工具缓存。可前往设置导入此前保留的有效学习备份。</p></section></template>
<script setup lang="ts">
import { useAppStore } from '../../web/src/stores/app';
defineProps<{ compact?: boolean }>();
const store = useAppStore();
</script>
