import { ref } from 'vue';
import { Capacitor, registerPlugin } from '@capacitor/core';

declare const __PET_INTERNAL_DEBUG__: boolean;
const debugBuild = typeof __PET_INTERNAL_DEBUG__ !== 'undefined' && __PET_INTERNAL_DEBUG__;
export const petDebugAllowed = ref(false);
const NativePetDebug = registerPlugin<{ capabilities(): Promise<{ enabled: boolean }> }>('PetDebug');
export async function initializePetDebug() {
  if (!debugBuild) return;
  if (!Capacitor.isNativePlatform()) {
    petDebugAllowed.value = ['localhost', '127.0.0.1'].includes(location.hostname);
    return;
  }
  try { petDebugAllowed.value = (await NativePetDebug.capabilities()).enabled === true; }
  catch { petDebugAllowed.value = false; }
}

