<template><App /><div v-if="store.writeBlockedMessage" class="mini-storage-alert" role="alert">{{ store.writeBlockedMessage }}<router-link to="/settings">查看备份与恢复</router-link></div></template>
<script setup lang="ts">
import App from '../../web/src/App.vue';
import { useAppStore } from '../../web/src/stores/app';
const store = useAppStore();
</script>
