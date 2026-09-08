package com.wjy.kaogong;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.annotation.ActivityCallback;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PetDebug")
public class PetDebugPlugin extends Plugin {
  private final ExecutorService decoder = Executors.newSingleThreadExecutor();
  @PluginMethod
  public void capabilities(PluginCall call) {
    JSObject result = new JSObject();
    result.put("enabled", BuildConfig.DEBUG && "internal-debug".equals(BuildConfig.KGC_RELEASE_CHANNEL));
    result.put("wishImageTestEnabled", BuildConfig.DEBUG && BuildConfig.KGC_QR_TEST);
    call.resolve(result);
  }

  @PluginMethod
  public void scanWishImageQr(PluginCall call) {
    if (!BuildConfig.DEBUG || !BuildConfig.KGC_QR_TEST) {
      call.reject("仅独立扫码测试版可识别图片");
      return;
    }
    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.setType("image/*");
    intent.putExtra(Intent.EXTRA_LOCAL_ONLY, true);
    startActivityForResult(call, intent, "handleWishImage");
  }

  @ActivityCallback
  private void handleWishImage(PluginCall call, ActivityResult result) {
    if (call == null) return;
    if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null
        || result.getData().getData() == null) {
      JSObject response = new JSObject();
      response.put("cancelled", true);
      call.resolve(response);
      return;
    }
    decoder.execute(() -> {
      Bitmap bitmap = null;
      try (InputStream input = getContext().getContentResolver().openInputStream(result.getData().getData());
          ByteArrayOutputStream output = new ByteArrayOutputStream()) {
        if (input == null) throw new IllegalArgumentException("无法读取图片");
        byte[] buffer = new byte[8192];
        int count;
        while ((count = input.read(buffer)) != -1) {
          if (output.size() + count > 16_000_000) throw new IllegalArgumentException("图片请小于 16 MB");
          output.write(buffer, 0, count);
        }
        byte[] bytes = output.toByteArray();
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
        if (options.outWidth <= 0 || options.outHeight <= 0) throw new IllegalArgumentException("不是有效图片");
        options.inSampleSize = 1;
        while ((long) (options.outWidth / options.inSampleSize) * (options.outHeight / options.inSampleSize) > 8_000_000) {
          options.inSampleSize *= 2;
        }
        options.inJustDecodeBounds = false;
        bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
        if (bitmap == null) throw new IllegalArgumentException("无法解码图片");
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        int[] pixels = new int[width * height];
        bitmap.getPixels(pixels, 0, width, 0, 0, width, height);
        JSObject response = new JSObject();
        response.put("cancelled", false);
        response.put("value", WishQrImageDecoder.decode(width, height, pixels));
        call.resolve(response);
      } catch (Exception error) {
        call.reject("未识别到清晰二维码，请选择完整的二维码截图", error);
      } finally {
        if (bitmap != null) bitmap.recycle();
      }
    });
  }

  @Override
  protected void handleOnDestroy() {
    decoder.shutdown();
    super.handleOnDestroy();
  }
}
