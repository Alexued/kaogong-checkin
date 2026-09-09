import { ref } from 'vue';

declare const __MINITOOL_TEST__: boolean;
export const petDebugAllowed = ref(__MINITOOL_TEST__);
export const wishImageTestAllowed = ref(false);
export const nativeTextRecognitionAvailable = () => false;
export async function recognizeChineseText(): Promise<string> { throw new Error('小工具不支持本地 OCR，请输入题目文本。'); }
export function prefersReducedMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
export async function runViewTransition(update: () => void | Promise<void>) { await update(); }
export const MOTION = { quick: 160, page: 320, scene: 420, taskLift: 220, sheetDelay: 40, ease: 'cubic-bezier(0.22, 1, 0.36, 1)' };

type Bridge = {
  saveImageToPhotosAlbum(options: { filePath: string }): Promise<unknown>;
  postNote(options: { title: string; content: string; pageType: 'photo_publish'; mediaInfo: { image_resources: { url: string }[] } }): Promise<unknown>;
};
function bridge(): Bridge {
  const value = (window as Window & { xhs?: { miniTool?: Bridge } }).xhs?.miniTool;
  if (!value) throw new Error('当前是浏览器预览，请在小红书内使用保存或分享。');
  return value;
}
export async function saveImage(filePath: string) {
  if (!/^data:image\/(png|jpeg|webp);base64,/.test(filePath)) throw new Error('请选择有效的本地图片。');
  await bridge().saveImageToPhotosAlbum({ filePath });
}
export async function shareImage(image: string, title: string, content: string) {
  if (!/^data:image\/(png|jpeg|webp);base64,/.test(image)) throw new Error('请选择有效的本地图片。');
  await bridge().postNote({ title: Array.from(title).slice(0, 20).join(''), content: Array.from(content).slice(0, 1000).join(''), pageType: 'photo_publish', mediaInfo: { image_resources: [{ url: image }] } });
}
export function readableError(error: unknown) {
  if (error instanceof Error) return error.message;
  return (error as { errMsg?: string })?.errMsg || '操作未完成，请重试。';
}
