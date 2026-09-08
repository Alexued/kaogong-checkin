import type { RewardWallet, CustomReward } from './customRewards';
import { validateRewardInput } from './customRewards';

export type WishScope = 'real' | 'sandbox';
interface Header { version: 1; kind: 'offer' | 'request' | 'key'; scope: WishScope; id: string }
export interface WishOffer extends Header { kind: 'offer'; issuer: string; nickname: string; rewardId: string; revision: number; name: string; description: string; cost: number }
export interface WishRequest extends Header { kind: 'request'; offerHash: string; recipient: string; nickname: string }
export interface WishKey extends Header { kind: 'key'; offerHash: string; requestId: string; recipient: string; issuer: string }
export type WishBody = WishOffer | WishRequest | WishKey;
export interface SignedWish<T extends WishBody = WishBody> { body: T; signature: string }
export interface WishIdentity { privateKey: CryptoKey; publicKey: string }
export interface WishState {
  offers: SignedWish<WishOffer>[];
  received: { offer: SignedWish<WishOffer>; hidden: boolean }[];
  requests: { request: SignedWish<WishRequest>; status: 'waiting' | 'cancelled' | 'completed' }[];
  approvals: SignedWish<WishKey>[];
}
export interface WishWallet extends RewardWallet { wishes: WishState }
export const emptyWishes = (): WishState => ({ offers: [], received: [], requests: [], approvals: [] });
const encoder = new TextEncoder();
const MAX_ITEMS = 2000;
const PREFIX = 'GEJI-WISH:1:';
function fail(): never { throw new Error('这不是完整有效的心愿券，请重新扫码。'); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, min = 1): string {
  if (typeof value !== 'string' || Array.from(value).length < min || Array.from(value).length > max) return fail();
  return value;
}
function binary(value: unknown, length: number): string {
  const result = text(value, length, length);
  if (!/^[A-Za-z0-9_-]+$/.test(result)) return fail();
  return result;
}
function id(value: unknown): string {
  const result = text(value, 36, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(result)) return fail();
  return result;
}
function keys(value: Record<string, unknown>, names: string[]) {
  if (Object.keys(value).sort().join(',') !== names.sort().join(',')) fail();
}
export function canonical(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}
export function base64url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
function bytes(encoded: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(encoded.replaceAll('-', '+').replaceAll('_', '/')), character => character.charCodeAt(0));
}
export function normalizeMessage(value: unknown): SignedWish {
  const message = object(value); keys(message, ['body', 'signature']);
  const body = object(message.body);
  if (body.version !== 1 || !['real', 'sandbox'].includes(String(body.scope))) fail();
  const header = { version: 1 as const, kind: body.kind, scope: body.scope as WishScope, id: id(body.id) };
  let result: WishBody;
  if (body.kind === 'offer') {
    keys(body, ['version', 'kind', 'scope', 'id', 'issuer', 'nickname', 'rewardId', 'revision', 'name', 'description', 'cost']);
    if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 1) fail();
    const input = validateRewardInput(body as unknown as CustomReward);
    if (input.name !== body.name || input.description !== body.description) fail();
    result = { ...header, kind: 'offer', issuer: binary(body.issuer, 87), nickname: text(body.nickname, 20), rewardId: text(body.rewardId, 120), revision: Number(body.revision), ...input };
  } else if (body.kind === 'request') {
    keys(body, ['version', 'kind', 'scope', 'id', 'offerHash', 'recipient', 'nickname']);
    result = { ...header, kind: 'request', offerHash: binary(body.offerHash, 43), recipient: binary(body.recipient, 87), nickname: text(body.nickname, 20) };
  } else if (body.kind === 'key') {
    keys(body, ['version', 'kind', 'scope', 'id', 'offerHash', 'requestId', 'recipient', 'issuer']);
    result = { ...header, kind: 'key', offerHash: binary(body.offerHash, 43), requestId: id(body.requestId), recipient: binary(body.recipient, 87), issuer: binary(body.issuer, 87) };
  } else return fail();
  return { body: result, signature: binary(message.signature, 86) };
}
export function encodeWish(message: SignedWish): string {
  const result = PREFIX + base64url(encoder.encode(canonical(normalizeMessage(message))).buffer);
  if (result.length > 2200) throw new Error('心愿文字过长，请缩短说明后分享。');
  return result;
}
export function decodeWish(source: string): SignedWish {
  if (source.length > 2800 || !source.startsWith(PREFIX)) return fail();
  try { return normalizeMessage(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes(source.slice(PREFIX.length))))); }
  catch { return fail(); }
}
export async function createWishIdentity(): Promise<WishIdentity> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  return { privateKey: pair.privateKey, publicKey: base64url(await crypto.subtle.exportKey('raw', pair.publicKey)) };
}
export async function signWish<T extends WishBody>(body: T, identity: WishIdentity): Promise<SignedWish<T>> {
  const signature = base64url(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, identity.privateKey, encoder.encode(canonical(body))));
  return normalizeMessage({ body, signature }) as SignedWish<T>;
}
export async function verifyWish(message: SignedWish, scope: WishScope): Promise<void> {
  const parsed = normalizeMessage(message);
  if (parsed.body.scope !== scope) throw new Error('测试心愿与真实心愿不能混用。');
  const publicKey = parsed.body.kind === 'request' ? parsed.body.recipient : parsed.body.issuer;
  try {
    const key = await crypto.subtle.importKey('raw', bytes(publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, bytes(parsed.signature), encoder.encode(canonical(parsed.body)))) throw new Error();
  } catch { throw new Error('签名不匹配，心愿可能被修改，请重新扫码。'); }
}
export async function wishHash(message: SignedWish): Promise<string> {
  return base64url(await crypto.subtle.digest('SHA-256', encoder.encode(canonical(message.body))));
}
function list(value: unknown): unknown[] { if (!Array.isArray(value) || value.length > MAX_ITEMS) return fail(); return value; }
export function normalizeWishes(value: unknown): WishState {
  if (value === undefined) return emptyWishes();
  const source = object(value); keys(source, ['offers', 'received', 'requests', 'approvals']);
  function messages<T extends WishBody>(entries: unknown, kind: T['kind']): SignedWish<T>[] {
    const ids = new Set<string>();
    return list(entries).map(entry => { const parsed = normalizeMessage(entry); if (parsed.body.kind !== kind || ids.has(parsed.body.id)) return fail(); ids.add(parsed.body.id); return parsed as SignedWish<T>; });
  }
  const received = list(source.received).map(entry => { const row = object(entry); if (typeof row.hidden !== 'boolean') return fail(); return { offer: messages<WishOffer>([row.offer], 'offer')[0]!, hidden: row.hidden }; });
  const requests = list(source.requests).map(entry => { const row = object(entry); if (!['waiting', 'cancelled', 'completed'].includes(String(row.status))) return fail(); return { request: messages<WishRequest>([row.request], 'request')[0]!, status: row.status as 'waiting' | 'cancelled' | 'completed' }; });
  if (new Set(received.map(row => row.offer.body.id)).size !== received.length || new Set(requests.map(row => row.request.body.id)).size !== requests.length) fail();
  return { offers: messages<WishOffer>(source.offers, 'offer'), received, requests, approvals: messages<WishKey>(source.approvals, 'key') };
}
function room(entries: unknown[]) { if (entries.length >= MAX_ITEMS) throw new Error('心愿记录已达上限，请保留备份。'); }
export async function issueOffer(wallet: WishWallet, rewardId: string, identity: WishIdentity, scope: WishScope, nickname: string): Promise<SignedWish<WishOffer>> {
  const reward = wallet.customRewards.find(item => item.id === rewardId && item.enabled);
  if (!reward) throw new Error('奖励已停用或不存在。');
  const prior = wallet.wishes.offers.find(offer => offer.body.rewardId === reward.id && offer.body.revision === reward.revision && offer.body.issuer === identity.publicKey && offer.body.scope === scope);
  if (prior) { await verifyWish(prior, scope); return prior; }
  room(wallet.wishes.offers);
  const offer = await signWish({ version: 1, kind: 'offer', scope, id: crypto.randomUUID(), issuer: identity.publicKey, nickname, rewardId, revision: reward.revision, name: reward.name, description: reward.description, cost: reward.cost }, identity);
  encodeWish(offer); wallet.wishes.offers.push(offer); return offer;
}
export async function receiveOffer(wallet: WishWallet, offer: SignedWish<WishOffer>, scope: WishScope): Promise<void> {
  await verifyWish(offer, scope);
  if (offer.body.kind !== 'offer') fail();
  const prior = wallet.wishes.received.find(row => row.offer.body.id === offer.body.id);
  if (prior) { if (canonical(prior.offer.body) !== canonical(offer.body)) throw new Error('心愿标识冲突。'); prior.hidden = false; return; }
  room(wallet.wishes.received); wallet.wishes.received.push({ offer, hidden: false });
}
export async function requestWish(wallet: WishWallet, offerId: string, identity: WishIdentity, scope: WishScope, nickname: string): Promise<SignedWish<WishRequest>> {
  const row = wallet.wishes.received.find(entry => entry.offer.body.id === offerId && !entry.hidden);
  if (!row) throw new Error('请先收下这张心愿券。');
  await verifyWish(row.offer, scope);
  const offerHash = await wishHash(row.offer);
  const prior = wallet.wishes.requests.find(entry => entry.request.body.offerHash === offerHash && entry.status === 'waiting' && entry.request.body.recipient === identity.publicKey);
  if (prior) return prior.request;
  if (wallet.stars < row.offer.body.cost) throw new Error('星星不足，攒够后再来领取小钥匙。');
  room(wallet.wishes.requests);
  const request = await signWish({ version: 1, kind: 'request', scope, id: crypto.randomUUID(), offerHash, recipient: identity.publicKey, nickname }, identity);
  wallet.wishes.requests.push({ request, status: 'waiting' }); return request;
}
export async function offerForRequest(wallet: WishWallet, request: SignedWish<WishRequest>, identity: WishIdentity, scope: WishScope): Promise<SignedWish<WishOffer>> {
  await verifyWish(request, scope);
  if (request.body.kind !== 'request') fail();
  for (const offer of wallet.wishes.offers) {
    if (await wishHash(offer) !== request.body.offerHash) continue;
    await verifyWish(offer, scope);
    if (offer.body.issuer !== identity.publicKey) throw new Error('这张心愿不是本机送出的，无法签发钥匙。');
    const reward = wallet.customRewards.find(item => item.id === offer.body.rewardId);
    if (!reward?.enabled || reward.revision !== offer.body.revision || reward.cost !== offer.body.cost || reward.name !== offer.body.name || reward.description !== offer.body.description) throw new Error('原奖励已修改或停用，请重新分享心愿。');
    return offer;
  }
  throw new Error('找不到本机送出的这张心愿券。');
}
export async function approveWish(wallet: WishWallet, request: SignedWish<WishRequest>, identity: WishIdentity, scope: WishScope): Promise<SignedWish<WishKey>> {
  await offerForRequest(wallet, request, identity, scope);
  const prior = wallet.wishes.approvals.find(row => row.body.requestId === request.body.id);
  if (prior) {
    if (prior.body.offerHash !== request.body.offerHash || prior.body.recipient !== request.body.recipient) throw new Error('请求标识冲突。');
    await verifyWish(prior, scope); return prior;
  }
  room(wallet.wishes.approvals);
  const approval = await signWish({ version: 1, kind: 'key', scope, id: crypto.randomUUID(), offerHash: request.body.offerHash, requestId: request.body.id, recipient: request.body.recipient, issuer: identity.publicKey }, identity);
  wallet.wishes.approvals.push(approval); return approval;
}
export async function redeemWish(wallet: WishWallet, approval: SignedWish<WishKey>, identity: WishIdentity, scope: WishScope, consumed: string[], now: string): Promise<void> {
  await verifyWish(approval, scope);
  if (approval.body.kind !== 'key') fail();
  if (approval.body.recipient !== identity.publicKey) throw new Error('这把小钥匙属于另一台设备。');
  const marker = scope + ':' + approval.body.recipient + ':' + approval.body.requestId;
  if (consumed.includes(marker)) throw new Error('这次兑换已经完成，不会重复扣星。');
  const row = wallet.wishes.requests.find(entry => entry.request.body.id === approval.body.requestId);
  if (!row || row.status !== 'waiting') throw new Error('请求不存在、已取消或已完成，请重新发起。');
  await verifyWish(row.request, scope);
  if (row.request.body.recipient !== identity.publicKey || row.request.body.offerHash !== approval.body.offerHash) throw new Error('小钥匙与这次请求不匹配。');
  let offer: SignedWish<WishOffer> | undefined;
  for (const entry of wallet.wishes.received) { if (await wishHash(entry.offer) === approval.body.offerHash) offer = entry.offer; }
  if (!offer || offer.body.issuer !== approval.body.issuer) throw new Error('小钥匙并非来自这张心愿的送出者。');
  await verifyWish(offer, scope);
  if (wallet.stars < offer.body.cost) throw new Error('星星不足，小钥匙仍可保留，攒够后再试。');
  if (!Number.isFinite(Date.parse(now))) throw new Error('设备时间无效。');
  if (wallet.redemptions.some(entry => entry.id === approval.body.requestId)) throw new Error('兑换记录已存在。');
  wallet.stars -= offer.body.cost;
  wallet.redemptions.push({ id: approval.body.requestId, rewardId: 'wish:' + offer.body.id, name: offer.body.name, description: offer.body.description, cost: offer.body.cost, redeemedAt: now, status: 'pending', usedAt: null });
  row.status = 'completed'; consumed.push(marker);
}
