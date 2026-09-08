import { createWishIdentity, signWish, verifyWish, type WishIdentity, type WishScope } from '../domain/wishes';

const promises = new Map<WishScope, Promise<WishIdentity>>();
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('geji-wish-identity-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('identities');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('无法打开本机钥匙盒，请检查存储权限。'));
    request.onblocked = () => reject(new Error('钥匙盒被其他窗口占用，请关闭后重试。'));
  });
}
async function initialize(scope: WishScope): Promise<WishIdentity> {
  const db = await database();
  try {
    const stored = await new Promise<WishIdentity | undefined>((resolve, reject) => {
      const transaction = db.transaction('identities', 'readonly');
      const request = transaction.objectStore('identities').get(scope);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(new Error('读取本机钥匙失败，未创建替代身份。'));
    });
    const identity = stored || await createWishIdentity();
    const probe = await signWish({ version: 1, kind: 'request', scope, id: crypto.randomUUID(), offerHash: 'A'.repeat(43), recipient: identity.publicKey, nickname: '钥匙检查' }, identity);
    await verifyWish(probe, scope);
    if (!stored) {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('identities', 'readwrite');
        transaction.objectStore('identities').add(identity, scope);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(new Error('本机钥匙未能保存，请重新打开应用后再试。'));
        transaction.onabort = () => reject(new Error('保存钥匙中断，没有分享任何数据。'));
      });
    }
    return identity;
  } finally { db.close(); }
}
export function getWishIdentity(scope: WishScope): Promise<WishIdentity> {
  if (!promises.has(scope)) promises.set(scope, initialize(scope).catch(error => { promises.delete(scope); throw error; }));
  return promises.get(scope)!;
}
