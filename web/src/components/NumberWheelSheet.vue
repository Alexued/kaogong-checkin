<template>
  <teleport to="body">
    <Transition name="number-wheel">
      <div v-if="open" class="number-wheel-mask" data-back-dismiss data-back-priority="180" @click.self="close">
        <section class="number-wheel-sheet card" role="dialog" aria-modal="true" :aria-labelledby="titleId">
          <div class="number-wheel-head"><div><span>滑动选择</span><h2 :id="titleId">{{ title }}</h2></div><button type="button" aria-label="关闭" @click="close">×</button></div>
          <WheelPicker v-model="draft" :min="min" :max="max" :step="step" :label="title" :suffix="suffix" :pad="pad" />
          <button class="btn confirm-wheel" type="button" @click="confirm">确定 {{ draft }}{{ suffix }}</button>
        </section>
      </div>
    </Transition>
  </teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import WheelPicker from './WheelPicker.vue';

const props = withDefaults(defineProps<{ open: boolean; modelValue: number; min: number; max: number; step?: number; title: string; suffix: string; pad?: number }>(), { step: 1, pad: 2 });
const emit = defineEmits<{ 'update:open': [value: boolean]; 'update:modelValue': [value: number] }>();
const draft = ref(props.modelValue);
const titleId = `number-wheel-${Math.random().toString(36).slice(2)}`;
watch(() => props.open, (open) => { if (open) draft.value = props.modelValue; });
const close = () => emit('update:open', false);
function confirm() { emit('update:modelValue', draft.value); close(); }
</script>

<style scoped>
.number-wheel-mask{position:fixed;inset:0;z-index:190;display:flex;align-items:flex-end;justify-content:center;background:rgba(15,23,42,.46)}.number-wheel-sheet{width:100%;max-width:640px;border-radius:18px 18px 0 0;padding:18px 18px calc(18px + env(safe-area-inset-bottom))}.number-wheel-head{display:flex;align-items:flex-start;justify-content:space-between}.number-wheel-head span{color:var(--accent-solid);font-size:11px;font-weight:800}.number-wheel-head h2{margin:3px 0 0;font-size:19px}.number-wheel-head button{width:44px;height:44px;border:0;border-radius:8px;background:var(--bg-elev);color:var(--text-2);font-size:25px}.number-wheel-sheet :deep(.wheel-field){max-width:180px;margin:4px auto 10px}.confirm-wheel{width:100%}.number-wheel-enter-active,.number-wheel-leave-active{transition:opacity 200ms ease}.number-wheel-enter-active .number-wheel-sheet,.number-wheel-leave-active .number-wheel-sheet{transition:transform 280ms cubic-bezier(.16,1,.3,1)}.number-wheel-enter-from,.number-wheel-leave-to{opacity:0}.number-wheel-enter-from .number-wheel-sheet,.number-wheel-leave-to .number-wheel-sheet{transform:translateY(50px)}
</style>
