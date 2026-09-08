export interface CustomReward {
  id: string;
  name: string;
  description: string;
  cost: number;
  enabled: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface RewardRedemption {
  id: string;
  rewardId: string;
  name: string;
  description: string;
  cost: number;
  redeemedAt: string;
  status: 'pending' | 'used';
  usedAt: string | null;
}
export interface RewardInput { name: string; description: string; cost: number }
export interface RewardWallet { stars: number; customRewards: CustomReward[]; redemptions: RewardRedemption[] }
const INITIAL_DATE = '2026-09-07T00:00:00.000Z';
export function defaultCustomRewards(): CustomReward[] {
  return [
    { id: 'sample-game', name: '游戏1小时', description: '认真学习后，安心放松一下。', cost: 2, enabled: true, revision: 1, createdAt: INITIAL_DATE, updatedAt: INITIAL_DATE },
    { id: 'sample-movie', name: '看电影1场', description: '挑一部想看的电影，奖励今天的努力。', cost: 5, enabled: true, revision: 1, createdAt: INITIAL_DATE, updatedAt: INITIAL_DATE },
  ];
}
function text(value: unknown, limit: number, required = false): string {
  if (typeof value !== 'string') throw new Error('奖励文字格式无效。');
  const clean = value.trim();
  if ((required && !clean) || Array.from(clean).length > limit) throw new Error(required ? '奖励名称需要1至40个字符。' : '奖励说明最多200个字符。');
  return clean;
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 120) throw new Error('奖励标识无效。');
  return value;
}
function date(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('奖励日期无效。');
  return value;
}
export function validateRewardInput(input: RewardInput): RewardInput {
  if (!Number.isSafeInteger(input.cost) || input.cost < 1 || input.cost > 99999) throw new Error('奖励价格必须是1至99999的整数星星。');
  return { name: text(input.name, 40, true), description: text(input.description, 200), cost: input.cost };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('奖励存档格式无效。');
  return value as Record<string, unknown>;
}
export function normalizeCustomRewards(value: unknown): CustomReward[] {
  if (value === undefined) return defaultCustomRewards();
  if (!Array.isArray(value) || value.length > 500) throw new Error('自定义奖励最多500项。');
  const ids = new Set<string>();
  return value.map(entry => {
    const item = object(entry);
    const id = identifier(item.id);
    if (ids.has(id)) throw new Error('奖励标识重复。');
    ids.add(id);
    if (typeof item.enabled !== 'boolean' || !Number.isSafeInteger(item.revision) || Number(item.revision) < 1) throw new Error('奖励状态或版本无效。');
    return { id, ...validateRewardInput(item as unknown as RewardInput), enabled: item.enabled, revision: Number(item.revision), createdAt: date(item.createdAt), updatedAt: date(item.updatedAt) };
  });
}
export function normalizeRedemptions(value: unknown, rewards: CustomReward[], wishIds: string[] = []): RewardRedemption[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('兑换记录格式无效。');
  const ids = new Set<string>();
  return value.map(entry => {
    const item = object(entry);
    const id = identifier(item.id);
    const rewardId = identifier(item.rewardId);
    if (ids.has(id) || (!rewards.some(reward => reward.id === rewardId) && !wishIds.includes(rewardId))) throw new Error('兑换记录重复或关联奖励不存在。');
    ids.add(id);
    if (item.status !== 'pending' && item.status !== 'used') throw new Error('兑换记录状态无效。');
    if (item.status === 'pending' && item.usedAt !== null) throw new Error('待使用奖励不能有使用日期。');
    const redeemedAt = date(item.redeemedAt);
    const usedAt = item.status === 'used' ? date(item.usedAt) : null;
    if (usedAt && Date.parse(usedAt) < Date.parse(redeemedAt)) throw new Error('使用日期早于兑换日期。');
    return { id, rewardId, ...validateRewardInput(item as unknown as RewardInput), redeemedAt, status: item.status, usedAt };
  });
}
export function saveCustomReward(wallet: RewardWallet, id: string, input: RewardInput, now: string): string {
  const fields = validateRewardInput(input);
  identifier(id); date(now);
  const existing = wallet.customRewards.find(reward => reward.id === id);
  if (existing) {
    if (!Number.isSafeInteger(existing.revision + 1)) throw new Error('奖励版本已达上限。');
    Object.assign(existing, fields, { revision: existing.revision + 1, updatedAt: now });
  } else {
    if (wallet.customRewards.length >= 500) throw new Error('自定义奖励最多500项，请编辑已有奖励。');
    wallet.customRewards.push({ id, ...fields, enabled: true, revision: 1, createdAt: now, updatedAt: now });
  }
  return '奖励已保存';
}
export function toggleCustomReward(wallet: RewardWallet, id: string, now: string): string {
  const reward = wallet.customRewards.find(item => item.id === id);
  if (!reward) throw new Error('奖励不存在。');
  if (!Number.isSafeInteger(reward.revision + 1)) throw new Error('奖励版本已达上限。');
  date(now);
  reward.enabled = !reward.enabled;
  reward.revision += 1;
  reward.updatedAt = now;
  return reward.enabled ? '奖励已重新启用' : '奖励已停用，已有兑换记录不受影响';
}
export function redeemCustomReward(wallet: RewardWallet, id: string, revision: number, operationId: string, now: string): string {
  identifier(operationId); date(now);
  const prior = wallet.redemptions.find(item => item.id === operationId);
  if (prior) {
    if (prior.rewardId !== id) throw new Error('兑换操作标识冲突。');
    return '本次兑换已完成，无需重复扣星';
  }
  const reward = wallet.customRewards.find(item => item.id === id);
  if (!reward?.enabled) throw new Error('奖励已停用或不存在。');
  if (reward.revision !== revision) throw new Error('奖励内容已更新，请重新确认后兑换。');
  if (wallet.stars < reward.cost) throw new Error('星星不足，还需要 ' + (reward.cost - wallet.stars) + ' 颗。');
  wallet.stars -= reward.cost;
  wallet.redemptions.push({ id: operationId, rewardId: id, name: reward.name, description: reward.description, cost: reward.cost, redeemedAt: now, status: 'pending', usedAt: null });
  return '已兑换' + reward.name + '，可在待使用记录中查看';
}
export function useCustomReward(wallet: RewardWallet, id: string, now: string): string {
  const item = wallet.redemptions.find(entry => entry.id === id);
  if (!item) throw new Error('兑换记录不存在。');
  if (item.status === 'used') return '这份奖励已经使用';
  date(now);
  if (Date.parse(now) < Date.parse(item.redeemedAt)) throw new Error('设备日期早于兑换日期，请检查系统时间。');
  item.status = 'used'; item.usedAt = now;
  return '已标记使用，不会再次扣星';
}
