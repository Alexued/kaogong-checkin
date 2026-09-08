import { PET_CATEGORIES, PET_CATALOG, type PetCategory } from '../data/petCatalog';
import { activePet, awardPetFocus, buyPetItem, copyPet, defaultPet, defaultPetProfile, equipPetItem, feedPetItem, normalizePet, selectPetSpecies, type PetData } from '../domain/pet';
import { petSpecies } from '../data/petSpecies';
import { redeemCustomReward, saveCustomReward, toggleCustomReward, useCustomReward, type RewardInput } from '../domain/customRewards';
import { adjustedStars, type StarOperation } from '../domain/developerStars';
import { emptyWishes, type WishScope } from '../domain/wishes';

export const PET_STORAGE_KEY = 'kgc_pet_state_v1';
export interface StarAdjustment { id: string; scope: WishScope; before: number; after: number; at: string }
export interface PetEnvelope { version: 3; pet: PetData; sandbox: { pet: PetData; shortPomodoro: boolean } | null; consumedWishes: string[]; starAdjustments: StarAdjustment[] }
export interface PetStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export class PetRepository {
  private envelope: PetEnvelope = { version: 3, pet: defaultPet(), sandbox: null, consumedWishes: [], starAdjustments: [] };
  error = '';
  constructor(private storage: PetStorage, private debugAllowed: () => boolean = () => false, private developerAllowed: () => boolean = () => false) {
    try {
      const raw = storage.getItem(PET_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.version !== undefined && ![1, 2, 3].includes(parsed.version)) throw new Error('不支持这个宠物存档版本。');
      if ([2, 3].includes(parsed.version) && !parsed.pet?.profiles) throw new Error('多宠物存档缺少档案。');
      if (parsed.consumedWishes !== undefined && (!Array.isArray(parsed.consumedWishes) || parsed.consumedWishes.some((entry: unknown) => typeof entry !== 'string'))) throw new Error('心愿消费记录无效。');
      if (parsed.starAdjustments !== undefined && (!Array.isArray(parsed.starAdjustments) || parsed.starAdjustments.some((entry: StarAdjustment) => !entry || typeof entry.id !== 'string' || !['real', 'sandbox'].includes(entry.scope) || !Number.isSafeInteger(entry.before) || entry.before < 0 || !Number.isSafeInteger(entry.after) || entry.after < 0 || !Number.isFinite(Date.parse(entry.at))))) throw new Error('星星调整记录无效。');
      this.envelope = { version: 3, pet: normalizePet(parsed.pet || parsed), sandbox: parsed.sandbox ? { pet: normalizePet(parsed.sandbox.pet), shortPomodoro: parsed.sandbox.shortPomodoro === true } : null, consumedWishes: [...new Set<string>(parsed.consumedWishes || [])], starAdjustments: parsed.starAdjustments || [] };
    } catch (error) { this.error = error instanceof Error ? error.message : '无法读取宠物存档。'; }
  }
  read() { return copyPet(this.envelope); }
  private commit(edit: (draft: PetEnvelope) => void) {
    if (this.error) throw new Error(this.error);
    const draft = this.read();
    edit(draft);
    this.storage.setItem(PET_STORAGE_KEY, JSON.stringify(draft));
    this.envelope = draft;
  }
  private active(draft: PetEnvelope) { return this.debugAllowed() && draft.sandbox ? draft.sandbox.pet : draft.pet; }
  transact(edit: (pet: PetData) => string): string {
    let message = '';
    this.commit((draft) => { message = edit(this.active(draft)); });
    return message;
  }
  buy(category: PetCategory, id: string) { return this.transact((pet) => buyPetItem(pet, category, id)); }
  equip(category: PetCategory, id: string) { return this.transact((pet) => equipPetItem(pet, category, id)); }
  feed(id: string) { return this.transact((pet) => feedPetItem(pet, id)); }
  rename(name: string) { return this.transact((pet) => { activePet(pet).name = Array.from(name.trim()).slice(0, 10).join('') || petSpecies(pet.selectedSpeciesId).defaultName; return '名字已保存'; }); }
  selectSpecies(id: string) { return this.transact(pet => selectPetSpecies(pet, id)); }
  clearEquipment() { return this.transact((pet) => { activePet(pet).equipped = defaultPetProfile(pet.selectedSpeciesId).equipped; return '已恢复默认装扮'; }); }
  saveReward(id: string, input: RewardInput) { return this.transact(pet => saveCustomReward(pet, id, input, new Date().toISOString())); }
  toggleReward(id: string) { return this.transact(pet => toggleCustomReward(pet, id, new Date().toISOString())); }
  redeemReward(id: string, revision: number, operationId: string) { return this.transact(pet => redeemCustomReward(pet, id, revision, operationId, new Date().toISOString())); }
  useReward(id: string) { return this.transact(pet => useCustomReward(pet, id, new Date().toISOString())); }
  scope(): WishScope { return this.debugAllowed() && this.envelope.sandbox ? 'sandbox' : 'real'; }
  async wish<T>(edit: (pet: PetData, consumed: string[], scope: WishScope) => Promise<T>): Promise<T> {
    if (this.error) throw new Error(this.error);
    const before = JSON.stringify(this.envelope);
    const disk = this.storage.getItem(PET_STORAGE_KEY);
    const scope = this.scope();
    const draft = this.read();
    const result = await edit(this.active(draft), draft.consumedWishes, scope);
    if (before !== JSON.stringify(this.envelope) || this.scope() !== scope || disk !== this.storage.getItem(PET_STORAGE_KEY)) throw new Error('钱包已发生变化，请重新确认。');
    this.storage.setItem(PET_STORAGE_KEY, JSON.stringify(draft)); this.envelope = draft;
    return result;
  }
  adjustStars(amount: number, operation: StarOperation, id: string, expected: number, scope: WishScope) {
    if (!this.developerAllowed()) throw new Error('开发者模式已锁定，请重新输入密码。');
    let message = '';
    this.commit(draft => {
      if (scope !== this.scope()) throw new Error('钱包已切换，请重新确认。');
      const previous = draft.starAdjustments.find(entry => entry.id === id);
      if (previous) { if (previous.scope !== scope) throw new Error('操作标识冲突。'); message = '该次调整已保存'; return; }
      const pet = this.active(draft);
      if (pet.stars !== expected) throw new Error('余额已变化，请重新确认。');
      const after = adjustedStars(pet.stars, amount, operation);
      draft.starAdjustments.push({ id, scope, before: pet.stars, after, at: new Date().toISOString() });
      pet.stars = after; message = '星星已调整，学习记录没有改变';
    });
    return message;
  }
  rewardFocus(startedAt: string, testSession = false) {
    let earned = 0;
    this.commit((draft) => {
      if (testSession && (!this.debugAllowed() || !draft.sandbox)) throw new Error('测试奖励仅可进入内部沙盒。');
      earned = awardPetFocus(testSession ? draft.sandbox!.pet : draft.pet, startedAt);
    });
    return earned;
  }
  startDebug() {
    if (!this.debugAllowed()) throw new Error('当前构建不支持内部测试。');
    this.commit((draft) => {
      if (draft.sandbox) throw new Error('沙盒已经开启，原存档保持不变。');
      const pet = copyPet(draft.pet);
      pet.stars = 99999;
      pet.wishes = emptyWishes();
      draft.sandbox = { pet, shortPomodoro: false };
    });
    return '99999 星沙盒已开启，真实存档不受影响';
  }
  stockDebug() {
    if (!this.debugAllowed()) throw new Error('当前构建不支持内部测试。');
    this.commit((draft) => {
      if (!draft.sandbox) throw new Error('请先开启测试沙盒。');
      for (const category of PET_CATEGORIES) {
        draft.sandbox.pet.unlocked[category] = [...new Set([...draft.sandbox.pet.unlocked[category], ...PET_CATALOG[category].map((item) => item.id)])];
      }
      for (const item of PET_CATALOG.foods) draft.sandbox.pet.foodInventory[item.id] = 99;
    });
    return '沙盒已解锁 70 项，每种食物 99 份';
  }
  toggleShortPomodoro() {
    if (!this.debugAllowed()) throw new Error('当前构建不支持内部测试。');
    this.commit((draft) => { if (!draft.sandbox) throw new Error('请先开启测试沙盒。'); draft.sandbox.shortPomodoro = !draft.sandbox.shortPomodoro; });
    return this.envelope.sandbox?.shortPomodoro ? '已开启 5 秒测试番茄，不写入学习记录' : '已恢复正常番茄时长';
  }
  restoreDebug() {
    if (!this.debugAllowed()) throw new Error('当前构建不支持内部测试。');
    this.commit((draft) => { draft.sandbox = null; });
    return '已退出沙盒，真实宠物数据已恢复';
  }
  exportData() { return JSON.stringify({ format: 'geji-pet', version: 3, pet: this.active(this.envelope) }, null, 2); }
  importData(text: string) {
    if (text.length > 2_000_000) throw new Error('宠物备份超过 2 MB。');
    const parsed = JSON.parse(text);
    if (parsed.format !== 'geji-pet' && !parsed.petData) throw new Error('请选择宠物备份或旧宠物版导出的完整备份。');
    if (parsed.format === 'geji-pet' && ![1, 2, 3].includes(parsed.version)) throw new Error('不支持这个宠物备份版本。');
    if (parsed.format === 'geji-pet' && [2, 3].includes(parsed.version) && !parsed.pet?.profiles) throw new Error('多宠物备份缺少档案。');
    const imported = normalizePet(parsed.petData || parsed.pet);
    this.commit((draft) => {
      if (this.debugAllowed() && draft.sandbox) draft.sandbox.pet = imported;
      else draft.pet = imported;
    });
    return '宠物数据已导入，学习记录未改变';
  }
}
