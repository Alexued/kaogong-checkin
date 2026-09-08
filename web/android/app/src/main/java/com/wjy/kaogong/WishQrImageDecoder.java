package com.wjy.kaogong;

import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.RGBLuminanceSource;
import com.google.zxing.ReaderException;
import com.google.zxing.common.HybridBinarizer;
import com.google.zxing.qrcode.QRCodeReader;
import java.util.EnumMap;
import java.util.Map;

final class WishQrImageDecoder {
  static String decode(int width, int height, int[] pixels) throws ReaderException {
    if (width <= 0 || height <= 0 || (long) width * height > 8_000_000
        || pixels == null || pixels.length != (long) width * height) {
      throw new IllegalArgumentException("图片尺寸不受支持");
    }
    Map<DecodeHintType, Object> hints = new EnumMap<>(DecodeHintType.class);
    hints.put(DecodeHintType.TRY_HARDER, true);
    return new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(
        new RGBLuminanceSource(width, height, pixels))), hints).getText();
  }
}
