import type { InjectionKey, Ref } from 'vue';

export type ShellPhase = 'pending' | 'entering' | 'ready';

export const SHELL_PHASE_KEY: InjectionKey<Readonly<Ref<ShellPhase>>> = Symbol('shell-phase');
