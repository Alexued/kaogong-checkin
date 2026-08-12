import { Capacitor, registerPlugin } from '@capacitor/core';

interface TextRecognitionPlugin {
  recognize(options: { dataUrl: string }): Promise<{ text: string; blockCount: number }>;
}

const NativeTextRecognition = registerPlugin<TextRecognitionPlugin>('TextRecognition');

export function nativeTextRecognitionAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function recognizeChineseText(dataUrl: string): Promise<string> {
  if (!nativeTextRecognitionAvailable()) throw new Error('NATIVE_OCR_UNAVAILABLE');
  const result = await NativeTextRecognition.recognize({ dataUrl });
  return result.text.trim();
}
