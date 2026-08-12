package com.wjy.kaogong;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;

@CapacitorPlugin(name = "TextRecognition")
public class TextRecognitionPlugin extends Plugin {
  @PluginMethod
  public void recognize(PluginCall call) {
    String dataUrl = call.getString("dataUrl");
    if (dataUrl == null || dataUrl.isBlank()) {
      call.reject("IMAGE_REQUIRED");
      return;
    }
    try {
      int comma = dataUrl.indexOf(',');
      String payload = comma >= 0 ? dataUrl.substring(comma + 1) : dataUrl;
      byte[] bytes = Base64.decode(payload, Base64.DEFAULT);
      Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
      if (bitmap == null) {
        call.reject("IMAGE_DECODE_FAILED");
        return;
      }
      InputImage image = InputImage.fromBitmap(bitmap, 0);
      TextRecognizer recognizer = TextRecognition.getClient(new ChineseTextRecognizerOptions.Builder().build());
      recognizer.process(image)
        .addOnSuccessListener(result -> {
          JSObject response = new JSObject();
          response.put("text", result.getText());
          response.put("blockCount", result.getTextBlocks().size());
          call.resolve(response);
          recognizer.close();
          bitmap.recycle();
        })
        .addOnFailureListener(error -> {
          recognizer.close();
          bitmap.recycle();
          call.reject("TEXT_RECOGNITION_FAILED", error);
        });
    } catch (Exception error) {
      call.reject("IMAGE_DECODE_FAILED", error);
    }
  }
}
