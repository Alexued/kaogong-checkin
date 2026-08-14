<template>
  <div class="question-image" :class="{ failed }">
    <img v-if="!failed" :src="currentSrc" :alt="alt" width="700" height="420" loading="lazy" @error="tryNextSource" />
    <span v-else>原题图片暂时无法加载</span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { questionImageCandidates } from '../../lib/questionImage';

const props = defineProps<{ src: string; alt: string }>();
const attempt = ref(0);
const candidates = computed(() => questionImageCandidates(props.src));
const currentSrc = computed(() => candidates.value[attempt.value] || '');
const failed = computed(() => attempt.value >= candidates.value.length);
function tryNextSource() { attempt.value += 1; }
watch(() => props.src, () => { attempt.value = 0; });
</script>

<style scoped>
.question-image{width:100%;min-height:96px;display:grid;place-items:center;overflow:hidden;border-radius:8px;background:var(--bg-elev);outline:1px solid color-mix(in srgb,var(--text) 10%,transparent);outline-offset:-1px}.question-image img{display:block;width:100%;height:auto;max-height:420px;object-fit:contain}.question-image.failed{padding:20px;color:var(--text-3);font-size:12px;text-align:center}
</style>
