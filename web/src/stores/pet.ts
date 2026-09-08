import { computed, ref, shallowRef } from 'vue';
import { defineStore } from 'pinia';
import { PetRepository } from '../storage/petRepository';
import { petDebugAllowed } from '../lib/petDebug';
import type { PetCategory } from '../data/petCatalog';
import { activePet } from '../domain/pet';
import type { RewardInput } from '../domain/customRewards';
import { developerSession, type StarOperation } from '../domain/developerStars';
import type { PetData } from '../domain/pet';
import type { WishScope } from '../domain/wishes';

export const usePetStore = defineStore('pet', () => {
  const storage = { getItem: (key: string) => localStorage.getItem(key), setItem: (key: string, value: string) => localStorage.setItem(key, value) };
  const repository = new PetRepository(storage, () => petDebugAllowed.value, () => developerSession.unlocked);
  const snapshot = shallowRef(repository.read());
  const message = ref(repository.error);
  const failed = ref(!!repository.error);
  const feedingUntil = ref(0);
  const feedingFood = ref('');
  const debugMode = computed(() => petDebugAllowed.value && !!snapshot.value.sandbox);
  const wallet = computed(() => debugMode.value ? snapshot.value.sandbox!.pet : snapshot.value.pet);
  const data = computed(() => ({ ...wallet.value, ...activePet(wallet.value) }));
  const shortPomodoro = computed(() => debugMode.value && snapshot.value.sandbox!.shortPomodoro);
  function run(action: () => string): boolean {
    try { message.value = action(); snapshot.value = repository.read(); failed.value = false; return true; }
    catch (error) { message.value = error instanceof Error ? error.message : '保存失败，请检查存储空间后重试'; failed.value = true; return false; }
  }
  function feed(id: string) {
    if (!run(() => repository.feed(id))) return false;
    feedingFood.value = id;
    feedingUntil.value = Date.now() + 4000;
    return true;
  }
  function awardFocus(startedAt: string, testSession = false) {
    return run(() => { const earned = repository.rewardFocus(startedAt, testSession); return earned ? '完成专注，星星 +10' : '该次专注已领取过奖励'; });
  }
  function clearFeeding() { feedingUntil.value = 0; feedingFood.value = ''; }
  function selectSpecies(id: string) {
    if (!run(() => repository.selectSpecies(id))) return false;
    clearFeeding();
    return true;
  }
  function replaceData(action: () => string) {
    const saved = run(action);
    if (saved) clearFeeding();
    return saved;
  }
  async function wish<T>(action: (wallet: PetData, consumed: string[], scope: WishScope) => Promise<T>): Promise<T> {
    try {
      const result = await repository.wish(action);
      snapshot.value = repository.read(); failed.value = false; message.value = '';
      return result;
    } catch (error) {
      failed.value = true; message.value = error instanceof Error ? error.message : '心愿保存失败，请重试'; throw error;
    }
  }
  return { data, message, failed, feedingUntil, feedingFood, debugMode, shortPomodoro, debugAllowed: petDebugAllowed, storageBlocked: !!repository.error,
    wish, starAdjustments: computed(() => snapshot.value.starAdjustments.filter(entry => entry.scope === (debugMode.value ? 'sandbox' : 'real'))),
    adjustStars: (amount: number, operation: StarOperation, id: string, expected: number, scope: WishScope) => run(() => repository.adjustStars(amount, operation, id, expected, scope)),
    buy: (category: PetCategory, id: string) => run(() => repository.buy(category, id)),
    equip: (category: PetCategory, id: string) => run(() => repository.equip(category, id)),
    rename: (name: string) => run(() => repository.rename(name)), feed, awardFocus, selectSpecies,
    saveReward: (id: string, input: RewardInput) => run(() => repository.saveReward(id, input)),
    toggleReward: (id: string) => run(() => repository.toggleReward(id)),
    redeemReward: (id: string, revision: number, operationId: string) => run(() => repository.redeemReward(id, revision, operationId)),
    useReward: (id: string) => run(() => repository.useReward(id)),
    clearEquipment: () => run(() => repository.clearEquipment()),
    startDebug: () => replaceData(() => repository.startDebug()),
    stockDebug: () => run(() => repository.stockDebug()),
    toggleShortPomodoro: () => run(() => repository.toggleShortPomodoro()),
    restoreDebug: () => replaceData(() => repository.restoreDebug()),
    exportData: () => repository.exportData(),
    importData: (text: string) => replaceData(() => repository.importData(text)),
  };
});
