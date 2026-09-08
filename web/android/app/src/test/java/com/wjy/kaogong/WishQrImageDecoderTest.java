package com.wjy.kaogong;

import static org.junit.Assert.assertEquals;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.NotFoundException;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import java.util.Arrays;
import org.junit.Test;

public class WishQrImageDecoderTest {
  @Test
  public void decodesQrInsidePhoneScreenshot() throws Exception {
    for (String kind : new String[] {"offer", "request", "key"}) {
      String value = "GEJI-WISH:1:" + kind + ":" + new String(new char[1200]).replace('\0', 'a');
      BitMatrix matrix = new QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, 900, 900);
      int[] pixels = new int[1080 * 2340];
      Arrays.fill(pixels, 0xffeeeeee);
      for (int row = 0; row < 900; row++) {
        for (int column = 0; column < 900; column++) {
          pixels[(row + 600) * 1080 + column + 90] = matrix.get(column, row) ? 0xff17383b : 0xffffffff;
        }
      }
      assertEquals(value, WishQrImageDecoder.decode(1080, 2340, pixels));
    }
  }

  @Test(expected = NotFoundException.class)
  public void rejectsBlankImage() throws Exception {
    int[] pixels = new int[100 * 100];
    Arrays.fill(pixels, 0xffffffff);
    WishQrImageDecoder.decode(100, 100, pixels);
  }

  @Test(expected = IllegalArgumentException.class)
  public void rejectsInvalidDimensions() throws Exception {
    WishQrImageDecoder.decode(0, 100, new int[0]);
  }

  @Test(expected = IllegalArgumentException.class)
  public void rejectsOversizedDimensions() throws Exception {
    WishQrImageDecoder.decode(Integer.MAX_VALUE, Integer.MAX_VALUE, new int[1]);
  }

  @Test(expected = IllegalArgumentException.class)
  public void rejectsMismatchedPixelBuffer() throws Exception {
    WishQrImageDecoder.decode(100, 100, new int[1]);
  }
}
