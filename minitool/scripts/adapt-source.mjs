import ts from '../../web/node_modules/typescript/lib/typescript.js';

export function replaceRequired(source, before, after) {
  if (source.split(before).length !== 2) throw new Error(`适配锚点必须唯一: ${before.slice(0, 100)}`);
  return source.replace(before, after);
}

export function replaceFunction(source, name, replacement) {
  const start = source.indexOf('<script');
  const offset = start < 0 ? 0 : source.indexOf('>', start) + 1;
  const end = start < 0 ? source.length : source.indexOf('</script>', offset);
  const script = source.slice(offset, end);
  const parsed = ts.createSourceFile('adapter.ts', script, ts.ScriptTarget.Latest, true);
  const matches = parsed.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (matches.length !== 1) throw new Error(`找不到唯一函数 ${name}`);
  const node = matches[0];
  return source.slice(0, offset + node.getStart(parsed)) + replacement + source.slice(offset + node.end);
}

export function adaptSource(source, filename) {
  let result = source;
  if (filename.endsWith('/router.ts')) {
    result = result.replaceAll('createWebHistory', 'createWebHashHistory');
    result = replaceRequired(result, "import TodayView", "import PosterView from '@minitool/PosterView.vue';\nimport TodayView");
    result = replaceRequired(result, 'routes: [', "routes: [\n    { path: '/poster', component: PosterView, meta: { parentPath: '/settings', rootTab: '/settings' } },");
  }
  if (filename.endsWith('/stores/app.ts')) {
    result = replaceRequired(result, "      applySyncMessage(this as unknown as AppState, msg);\n      enqueue(msg);\n      this.writeBlockedMessage = '';\n      return true;", "      try {\n        enqueue(msg);\n        applySyncMessage(this as unknown as AppState, msg);\n        this.writeBlockedMessage = '';\n        return true;\n      } catch {\n        this.writeBlockedMessage = '保存失败，本次修改未生效。请检查本地存储空间后重试。';\n        return false;\n      }");
    const methodStart = result.indexOf('    saveTask(');
    const methodEnd = result.indexOf('\n    saveSubtasks(', methodStart);
    if (methodStart < 0 || methodEnd < 0) throw new Error('任务保存适配锚点丢失');
    const taskMethod = result.slice(methodStart, methodEnd).replaceAll('this.send({', 'const saved = this.send({').replace('return partial.id;', 'return saved ? partial.id : undefined;').replace('return id;', 'return saved ? id : undefined;');
    result = result.slice(0, methodStart) + taskMethod + result.slice(methodEnd);
  }
  if (filename.endsWith('/DeveloperStars.vue')) {
    result = replaceRequired(result, "import { App } from '@capacitor/app';", '');
    result = replaceRequired(result, "import { Capacitor, type PluginListenerHandle } from '@capacitor/core';", "import { petDebugAllowed } from '@minitool/platform';");
    result = replaceRequired(result, 'let listener: PluginListenerHandle | undefined;', '');
    result = replaceRequired(result, 'let disposed = false;', '');
    result = replaceRequired(result, 'if (!developerSession.tap()) return;', 'if (!petDebugAllowed.value || !developerSession.tap()) return;');
    result = replaceRequired(result, "if (Capacitor.isNativePlatform()) void App.addListener('appStateChange', state => { if (!state.isActive) close(); }).then(handle => { if (disposed) void handle.remove(); else listener = handle; });", '');
    result = replaceRequired(result, 'disposed = true; close();', 'close();');
    result = replaceRequired(result, ' void listener?.remove();', '');
  }
  if (filename.endsWith('/WishesView.vue')) {
    result = replaceRequired(result, "import { Capacitor, registerPlugin } from '@capacitor/core';", "import QrScanner from '@minitool/QrScanner.vue';\nimport { decodeQrFile } from '@minitool/qr';\nimport { saveImage } from '@minitool/platform';");
    result = replaceRequired(result, 'NativePetDebug, wishImageTestAllowed', 'wishImageTestAllowed');
    result = replaceRequired(result, "const NativeScanner = registerPlugin<{ scanWishQr(): Promise<{ cancelled: boolean; value?: string }> }>('DeviceSync');", 'const scanning = ref(false);');
    result = replaceRequired(result, '<div class="page wishes-page">', '<div class="page wishes-page"><QrScanner v-if="scanning" @close="scanning = false" @decoded="scanning = false; inspect($event)" />');
    result = replaceFunction(result, 'scanImage', 'function scanImage() { manual.value = true; }');
    result = replaceFunction(result, 'scan', 'function scan() { scanning.value = true; }');
    result = replaceFunction(result, 'copy', "function copy() { notice.value = '请长按传递文本，使用系统菜单全选复制。'; }");
    result = replaceFunction(result, 'download', "async function download() { await action(async () => { await saveImage(qrUrl.value); notice.value = '二维码已保存到相册。'; }); }");
    result = replaceFunction(result, 'readFile', "async function readFile(event: Event) { const input = event.target as HTMLInputElement; const file = input.files?.[0]; input.value = ''; if (!file) return; const token = epoch; await action(async () => { const value = await decodeQrFile(file); if (alive && token === epoch) await parse(value); }); }");
    result = result.replaceAll('accept=".txt,text/plain"', 'accept="image/png,image/jpeg,image/webp"').replaceAll('选择本地文件', '识别二维码图片').replaceAll('或选择另一台设备给你的本地文件', '或选择另一台设备给你的二维码图片').replaceAll('复制或保存传递文本', '传递文本与二维码图片').replaceAll('>保存文本<', '>保存二维码图片<');
  }
  if (filename.endsWith('/PetView.vue')) {
    result = replaceRequired(result, '<label class="btn ghost file-button">选择备份文件<input type="file" accept=".json,application/json" :disabled="pet.storageBlocked || timerBusy" @change="readBackup"></label>', '<button class="btn ghost" type="button" :disabled="pet.storageBlocked || timerBusy" @click="backup = \'\'; backupMessage = \'请在下方粘贴备份，再点击导入\'">粘贴备份</button><button class="btn ghost" type="button" :disabled="!backup || timerBusy" @click="readBackup">导入备份文本</button>');
    result = replaceRequired(result, '<textarea v-if="backup"', '<textarea');
    result = replaceFunction(result, 'readBackup', "async function readBackup() { if (!backup.value || timerBusy.value) return; try { if (backup.value.length > 2_000_000) throw new Error('备份不能超过 2 MB'); if (await confirmDialog({ title: '导入宠物备份？', message: '将替换当前宠物数据。请先保存原备份；心愿签名身份不随备份迁移。', confirmLabel: '导入', variant: 'warning' })) { if (!timerBusy.value) pet.importData(backup.value); } } catch (error) { backupMessage.value = error instanceof Error ? error.message : '导入失败'; } }");
    result = replaceFunction(result, 'copyBackup', "function copyBackup() { backupMessage.value = '请长按备份文本，使用系统菜单全选复制。'; }");
  }
  if (filename.endsWith('/storage/wishIdentity.ts')) {
    result = replaceRequired(result, '  if (!promises.has(scope))', "  if (!globalThis.crypto?.subtle || typeof indexedDB === 'undefined') return Promise.reject(new Error('当前容器不支持安全签名或本地钥匙存储，不能兑换离线心愿。普通奖励仍可使用。'));\n  if (!promises.has(scope))");
  }
  if (filename.endsWith('/AnalysisReviewPanel.vue')) {
    result = replaceRequired(result, '拍照、相册或手动输入均可；中文识别与讲题规则都在手机本地完成。', '从精简题库选择或手动输入题目；照片仅作对照，小工具不提供自动文字识别。');
    result = result.replaceAll('拍照识题', '拍照作参考').replaceAll('待识别的资料分析题目', '用于对照的资料分析题目').replaceAll('拍照识别后也建议在这里核对年份、单位和小数点。', '照片不会自动识别，请手动输入并核对年份、单位和小数点。');
  }
  result = result.replace(/^.*if \([^\n]*'vibrate' in navigator\)[^\n]*navigator\.vibrate\?\.[^\n]*;\r?$/gm, '');
  return result;
}
