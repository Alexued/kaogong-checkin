import { PET_CATEGORIES, PET_CATALOG, PET_SLOTS, petItem, type PetCategory, type PetSlot } from '../data/petCatalog';
import { PET_SPECIES_IDS, isPetSpecies, petSpecies, type PetSpeciesId } from '../data/petSpecies';
import { defaultCustomRewards, normalizeCustomRewards, normalizeRedemptions, type CustomReward, type RewardRedemption } from './customRewards';
import { emptyWishes, normalizeWishes, type WishState } from './wishes';

export interface PetProfile {
  name: string;
  equipped: Record<PetSlot, string>;
  satiety: number;
  feedCount: number;
}
export interface PetData {
  stars: number;
  totalEarned: number;
  unlocked: Record<PetCategory, string[]>;
  foodInventory: Record<string, number>;
  rewardIds: string[];
  selectedSpeciesId: PetSpeciesId;
  profiles: Record<PetSpeciesId, PetProfile>;
  customRewards: CustomReward[];
  redemptions: RewardRedemption[];
  wishes: WishState;
}
export function copyPet<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
export function defaultPetProfile(id: PetSpeciesId): PetProfile {
  return { name: petSpecies(id).defaultName, equipped: { action: 'idle', state: '', outfit: '', background: 'default', accessory: '', vehicle: '' }, satiety: 50, feedCount: 0 };
}
export function activePet(pet: PetData): PetProfile { return pet.profiles[pet.selectedSpeciesId]; }
export function defaultPet(): PetData {
  return {
    stars: 0, totalEarned: 0,
    unlocked: { actions: ['idle'], states: [], outfits: [], foods: [], backgrounds: ['default'], accessories: [], vehicles: [] },
    foodInventory: {}, rewardIds: [], selectedSpeciesId: 'hamster',
    profiles: Object.fromEntries(PET_SPECIES_IDS.map(id => [id, defaultPetProfile(id)])) as Record<PetSpeciesId, PetProfile>,
    customRewards: defaultCustomRewards(), redemptions: [], wishes: emptyWishes(),
  };
}
function integer(value: unknown, fallback = 0): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('宠物存档中的数值无效，原始数据已保留。');
  return value;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('宠物存档格式无效，原始数据已保留。');
  return value as Record<string, unknown>;
}
function normalizeProfile(value: unknown, id: PetSpeciesId, pet: PetData): PetProfile {
  const source = record(value);
  const profile = defaultPetProfile(id);
  profile.name = typeof source.name === 'string' ? Array.from(source.name.trim()).slice(0, 10).join('') || profile.name : profile.name;
  profile.satiety = Math.min(100, integer(source.satiety, 50));
  profile.feedCount = integer(source.feedCount);
  const equipped = source.equipped === undefined ? {} : record(source.equipped);
  for (const category of PET_CATEGORIES) {
    const slot = PET_SLOTS[category];
    if (slot && typeof equipped[slot] === 'string' && pet.unlocked[category].includes(equipped[slot] as string)) profile.equipped[slot] = equipped[slot] as string;
  }
  return profile;
}
export function normalizePet(value: unknown): PetData {
  const source = record(value);
  const pet = defaultPet();
  pet.stars = integer(source.stars);
  pet.totalEarned = integer(source.totalEarned);
  const unlocked = source.unlocked === undefined ? {} : record(source.unlocked);
  const inventory = source.foodInventory === undefined ? {} : record(source.foodInventory);
  for (const category of PET_CATEGORIES) {
    const ids = unlocked[category];
    if (ids !== undefined && !Array.isArray(ids)) throw new Error('解锁清单无效，原始数据已保留。');
    pet.unlocked[category] = [...new Set([...pet.unlocked[category], ...(ids || []).filter((id: unknown): id is string => typeof id === 'string' && !!petItem(category, id))])];
  }
  for (const food of PET_CATALOG.foods) {
    const count = integer(inventory[food.id]);
    if (count > 0 && !pet.unlocked.foods.includes(food.id)) pet.unlocked.foods.push(food.id);
    pet.foodInventory[food.id] = count;
  }
  if (source.rewardIds !== undefined && (!Array.isArray(source.rewardIds) || source.rewardIds.some(id => typeof id !== 'string'))) throw new Error('奖励记录格式无效。');
  pet.rewardIds = [...new Set((source.rewardIds as string[] | undefined) || [])];
  if (source.profiles === undefined) {
    pet.profiles.hamster = normalizeProfile(source, 'hamster', pet);
  } else {
    const profiles = record(source.profiles);
    if (Object.keys(profiles).some(id => !isPetSpecies(id))) throw new Error('宠物种类无效，原始数据已保留。');
    if (!isPetSpecies(source.selectedSpeciesId)) throw new Error('当前宠物标识无效。');
    pet.selectedSpeciesId = source.selectedSpeciesId;
    for (const id of PET_SPECIES_IDS) {
      if (profiles[id] !== undefined) pet.profiles[id] = normalizeProfile(profiles[id], id, pet);
    }
  }
  pet.customRewards = normalizeCustomRewards(source.customRewards);
  pet.wishes = normalizeWishes(source.wishes);
  pet.redemptions = normalizeRedemptions(source.redemptions, pet.customRewards, pet.wishes.received.map(entry => 'wish:' + entry.offer.body.id));
  return pet;
}
export function selectPetSpecies(pet: PetData, id: string): string {
  if (!isPetSpecies(id)) throw new Error('未找到这只宠物。');
  pet.selectedSpeciesId = id;
  return '已切换为' + petSpecies(id).name + '，星星和库存共用';
}
export function buyPetItem(pet: PetData, category: PetCategory, id: string): string {
  const item = petItem(category, id);
  if (!item) throw new Error('未找到这个商品。');
  if (category !== 'foods' && pet.unlocked[category].includes(id)) throw new Error('已经拥有，无需重复购买。');
  if (pet.stars < item.cost) throw new Error('星星不足，还需要 ' + (item.cost - pet.stars) + ' 颗。');
  if (category === 'foods' && (pet.foodInventory[id] || 0) >= Number.MAX_SAFE_INTEGER) throw new Error('食品库存已达上限。');
  pet.stars -= item.cost;
  if (!pet.unlocked[category].includes(id)) pet.unlocked[category].push(id);
  if (category === 'foods') pet.foodInventory[id] = (pet.foodInventory[id] || 0) + 1;
  return '已兑换' + item.name + (category === 'foods' ? '，库存 +1' : '，可以装备了');
}
export function equipPetItem(pet: PetData, category: PetCategory, id: string): string {
  const slot = PET_SLOTS[category];
  if (!slot) throw new Error('食物需要在喂养页使用。');
  const item = petItem(category, id);
  if (!item || !pet.unlocked[category].includes(id)) throw new Error('请先兑换这个物品。');
  activePet(pet).equipped[slot] = id;
  if (category === 'actions') activePet(pet).equipped.state = '';
  return '已装备' + item.name;
}
export function feedPetItem(pet: PetData, id: string): string {
  const food = petItem('foods', id);
  if (!food || (pet.foodInventory[id] || 0) <= 0) throw new Error('没有这份食物，请先到商店兑换。');
  const profile = activePet(pet);
  if (!Number.isSafeInteger(profile.feedCount + 1)) throw new Error('喂养次数已达上限。');
  pet.foodInventory[id] -= 1;
  profile.satiety = Math.min(100, profile.satiety + 12);
  profile.feedCount += 1;
  return '吃掉一份' + food.name + '，库存 -1';
}
export function awardPetFocus(pet: PetData, startedAt: string): number {
  if (!startedAt || !Number.isFinite(Date.parse(startedAt))) throw new Error('专注奖励缺少有效记录。');
  const eventId = 'pomodoro:' + startedAt;
  if (pet.rewardIds.includes(eventId)) return 0;
  if (!Number.isSafeInteger(pet.stars + 10) || !Number.isSafeInteger(pet.totalEarned + 10)) throw new Error('星星余额已达上限。');
  pet.stars += 10; pet.totalEarned += 10; pet.rewardIds.push(eventId);
  return 10;
}
