<template>
  <teleport to="body">
    <Transition name="task-menu">
      <div
        v-if="open && item"
        class="task-menu-mask"
        data-back-dismiss
        data-back-priority="160"
        @click.self="emit('close')"
        @contextmenu.prevent.self="emit('close')"
      >
        <div ref="menuEl" class="task-menu" :style="menuStyle" role="menu" :aria-label="`${item.task.title}快捷操作`">
          <div class="task-menu-head">
            <PixelGrid pattern="arrival" :size="30" once decorative />
            <strong>{{ item.task.title }}</strong>
          </div>
          <button type="button" role="menuitem" @click="emit('edit')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
            <span>编辑任务</span>
          </button>
          <button type="button" role="menuitem" @click="emit('focus')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></svg>
            <span>开始专注</span>
          </button>
          <button type="button" role="menuitem" @click="emit('reorder')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg>
            <span>调整顺序</span>
          </button>
          <button class="danger" type="button" role="menuitem" @click="emit('delete')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 10v6M14 10v6"/></svg>
            <span>删除任务</span>
          </button>
        </div>
      </div>
    </Transition>
  </teleport>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue';
import type { PlanItem } from '../lib/plan';
import { positionTaskMenu } from '../lib/taskMenu';
import PixelGrid from './PixelGrid.vue';

const props = defineProps<{
  open: boolean;
  item: PlanItem | null;
  anchor: { x: number; y: number };
}>();
const emit = defineEmits<{
  close: [];
  edit: [];
  focus: [];
  reorder: [];
  delete: [];
}>();
const menuEl = ref<HTMLElement | null>(null);
const menuStyle = ref<CSSProperties>({ left: '12px', top: '12px' });

async function placeMenu() {
  if (!props.open) return;
  await nextTick();
  const menu = menuEl.value;
  if (!menu) return;
  const viewport = window.visualViewport;
  const viewportLeft = viewport?.offsetLeft || 0;
  const viewportTop = viewport?.offsetTop || 0;
  const viewportWidth = viewport?.width || window.innerWidth;
  const viewportHeight = viewport?.height || window.innerHeight;
  const rect = menu.getBoundingClientRect();
  const position = positionTaskMenu(
    props.anchor,
    { width: rect.width, height: rect.height },
    { left: viewportLeft, top: viewportTop, width: viewportWidth, height: viewportHeight },
  );
  menuStyle.value = {
    left: `${Math.round(position.x)}px`,
    top: `${Math.round(position.y)}px`,
    '--task-menu-origin': `${Math.round(position.originX)}px ${Math.round(position.originY)}px`,
  } as CSSProperties;
}

watch(() => [props.open, props.anchor.x, props.anchor.y], () => { void placeMenu(); });
onMounted(() => {
  window.addEventListener('resize', placeMenu);
  window.visualViewport?.addEventListener('resize', placeMenu);
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', placeMenu);
  window.visualViewport?.removeEventListener('resize', placeMenu);
});
</script>

<style scoped>
.task-menu-mask{position:fixed;inset:0;z-index:150;background:rgba(15,23,42,.12);touch-action:none}.task-menu{position:fixed;width:216px;max-width:calc(100vw - 24px);overflow:hidden;border:1px solid color-mix(in srgb,var(--card-border) 78%,var(--text-3));border-radius:12px;background:var(--bg-elev);box-shadow:0 16px 42px rgba(15,23,42,.22),0 3px 12px rgba(15,23,42,.12);transform-origin:var(--task-menu-origin,center);overscroll-behavior:contain}.task-menu-head{min-height:48px;display:grid;grid-template-columns:30px minmax(0,1fr);align-items:center;gap:9px;padding:7px 12px;border-bottom:1px solid var(--card-border)}.task-menu-head strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.task-menu button{width:100%;min-height:48px;display:grid;grid-template-columns:24px minmax(0,1fr);align-items:center;gap:10px;border:0;border-bottom:1px solid var(--card-border);padding:0 13px;background:transparent;color:var(--text);font:inherit;font-size:14px;text-align:left}.task-menu button:last-child{border-bottom:0}.task-menu button:active{background:var(--accent-soft);transform:scale(.98)}.task-menu button.danger{color:var(--danger)}.task-menu svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.task-menu-enter-active{transition:opacity 140ms ease-out}.task-menu-leave-active{transition:opacity 110ms ease-in}.task-menu-enter-active .task-menu{transition:transform 210ms cubic-bezier(.16,1,.3,1),opacity 140ms ease-out}.task-menu-leave-active .task-menu{transition:transform 110ms ease-in,opacity 100ms ease-in}.task-menu-enter-from,.task-menu-leave-to{opacity:0}.task-menu-enter-from .task-menu{opacity:0;transform:scale(.88) translateY(4px)}.task-menu-leave-to .task-menu{opacity:0;transform:scale(.96)}
@media(prefers-reduced-motion:reduce){.task-menu-enter-active,.task-menu-leave-active,.task-menu-enter-active .task-menu,.task-menu-leave-active .task-menu{transition-duration:.01ms}}
</style>
