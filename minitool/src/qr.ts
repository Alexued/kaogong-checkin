import jsQR from 'jsqr';

export function decodeQrPixels(data: Uint8ClampedArray, width: number, height: number): string {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 2048 * 2048 || data.length !== width * height * 4) throw new Error('二维码图片尺寸无效。');
  const result = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' });
  if (!result?.data) throw new Error('没有识别到二维码，请选择清晰、完整的二维码图片。');
  if (result.data.length > 2800) throw new Error('二维码内容过长，不是有效心愿。');
  return result.data;
}

export function decodeQrFrame(source: CanvasImageSource, width: number, height: number): string {
  if (!width || !height) throw new Error('相机画面尚未就绪。');
  const ratio = Math.min(1, 2048 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前环境无法读取二维码图片。');
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  return decodeQrPixels(pixels.data, pixels.width, pixels.height);
}

export async function decodeQrFile(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('请选择 PNG、JPEG 或 WebP 图片。');
  if (file.size <= 0 || file.size > 20 * 1024 * 1024) throw new Error('图片需大于 0 且不超过 20 MB。');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('图片无法打开，请重新选择。')); image.src = url; });
    if (image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error('图片分辨率过大，请裁剪为二维码区域后重试。');
    return decodeQrFrame(image, image.naturalWidth, image.naturalHeight);
  } finally { URL.revokeObjectURL(url); }
}
