<template>
  <teleport to="body">
    <Transition name="app-dialog">
      <div
        v-if="dialog"
        :key="dialog.id"
        class="dialog-mask"
        data-back-dismiss
        data-back-priority="220"
        @click.self="cancel"
      >
        <section
          ref="panel"
          class="dialog-panel card"
          :class="`dialog-${dialog.variant}`"
          role="alertdialog"
          aria-modal="true"
          :aria-labelledby="`app-dialog-title-${dialog.id}`"
          :aria-describedby="`app-dialog-message-${dialog.id}`"
          @keydown="onKeydown"
        >
          <div class="dialog-mark" aria-hidden="true">
            <span></span><span></span><span></span>
            <span></span><span></span><span></span>
            <span></span><span></span><span></span>
          </div>
          <div class="dialog-copy">
            <h2 :id="`app-dialog-title-${dialog.id}`">{{ dialog.title }}</h2>
            <p :id="`app-dialog-message-${dialog.id}`">{{ dialog.message }}</p>
            <ul v-if="dialog.details.length" class="dialog-details">
              <li v-for="detail in dialog.details" :key="detail">{{ detail }}</li>
            </ul>
          </div>
          <div class="dialog-actions">
            <button ref="cancelButton" class="btn ghost" type="button" @click="cancel">
              {{ dialog.cancelLabel }}
            </button>
            <button
              class="btn dialog-confirm"
              :class="{ danger: dialog.variant === 'danger', warning: dialog.variant === 'warning' }"
              type="button"
              @click="accept"
            >
              {{ dialog.confirmLabel }}
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { activeAppDialog, settleAppDialog } from '../lib/appDialog';

const dialog = computed(() => activeAppDialog.value);
const panel = ref<HTMLElement | null>(null);
const cancelButton = ref<HTMLButtonElement | null>(null);
let previousFocus: HTMLElement | null = null;

watch(dialog, async (current) => {
  if (current) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.documentElement.classList.add('app-dialog-open');
    await nextTick();
    cancelButton.value?.focus({ preventScroll: true });
    return;
  }
  document.documentElement.classList.remove('app-dialog-open');
  previousFocus?.focus?.({ preventScroll: true });
  previousFocus = null;
});

function cancel() {
  settleAppDialog(false);
}

function accept() {
  settleAppDialog(true);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    cancel();
    return;
  }
  if (event.key !== 'Tab' || !panel.value) return;
  const focusable = [...panel.value.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled)')];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onBeforeUnmount(() => {
  document.documentElement.classList.remove('app-dialog-open');
});
</script>

<style scoped>
.dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 240;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(15, 23, 42, 0.46);
  overscroll-behavior: contain;
}

.dialog-panel {
  width: 100%;
  max-width: 640px;
  border-radius: 22px 22px 0 0;
  padding: 20px 18px calc(18px + env(safe-area-inset-bottom));
  box-shadow: 0 -10px 34px rgba(15, 23, 42, 0.16);
}

.dialog-mark {
  width: 36px;
  height: 36px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 3px;
  margin-bottom: 13px;
  color: var(--accent-solid);
}

.dialog-mark span {
  border-radius: 2px;
  background: currentColor;
  opacity: 0.18;
}

.dialog-mark span:nth-child(5),
.dialog-mark span:nth-child(8) {
  opacity: 1;
}

.dialog-warning .dialog-mark { color: var(--warn); }
.dialog-danger .dialog-mark { color: var(--danger); }
.dialog-danger .dialog-mark span { opacity: 0.2; }
.dialog-danger .dialog-mark span:nth-child(1),
.dialog-danger .dialog-mark span:nth-child(3),
.dialog-danger .dialog-mark span:nth-child(5),
.dialog-danger .dialog-mark span:nth-child(7),
.dialog-danger .dialog-mark span:nth-child(9) { opacity: 1; }

.dialog-copy h2 {
  margin: 0;
  color: var(--text);
  font-size: 20px;
  line-height: 1.35;
  text-wrap: balance;
}

.dialog-copy p {
  margin: 8px 0 0;
  color: var(--text-2);
  font-size: 14px;
  line-height: 1.72;
  text-wrap: pretty;
}

.dialog-details {
  display: grid;
  gap: 7px;
  margin: 13px 0 0;
  padding: 12px 13px 12px 30px;
  border-radius: 13px;
  background: var(--bg);
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.6;
}

.dialog-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 18px;
}

.dialog-actions .btn {
  min-height: 48px;
  touch-action: manipulation;
  transition: transform 150ms cubic-bezier(0.16, 1, 0.3, 1), opacity 150ms ease;
}

.dialog-actions .btn:active { transform: scale(0.96); }
.dialog-confirm.danger { background: var(--danger); color: #fff; border-color: var(--danger); }
.dialog-confirm.warning { background: var(--warn); color: #fff; }

.app-dialog-enter-active,
.app-dialog-leave-active {
  transition: opacity 220ms ease;
}

.app-dialog-enter-active .dialog-panel,
.app-dialog-leave-active .dialog-panel {
  transition: transform 280ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease;
}

.app-dialog-enter-from,
.app-dialog-leave-to { opacity: 0; }

.app-dialog-enter-from .dialog-panel,
.app-dialog-leave-to .dialog-panel {
  opacity: 0;
  transform: translateY(34px);
}

@media (min-width: 720px), (max-height: 520px) and (orientation: landscape) {
  .dialog-mask {
    align-items: center;
    padding: 24px;
  }

  .dialog-panel {
    max-width: 430px;
    border-radius: 20px;
    padding: 22px;
    box-shadow: 0 18px 52px rgba(15, 23, 42, 0.24);
  }
}

@media (max-width: 340px) {
  .dialog-actions { grid-template-columns: 1fr; }
  .dialog-actions .ghost { order: 2; }
}

@media (prefers-reduced-motion: reduce) {
  .app-dialog-enter-active,
  .app-dialog-leave-active,
  .app-dialog-enter-active .dialog-panel,
  .app-dialog-leave-active .dialog-panel {
    transition-duration: 0.01ms;
  }

  .app-dialog-enter-from .dialog-panel,
  .app-dialog-leave-to .dialog-panel { transform: none; }
}
</style>
