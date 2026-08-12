package com.wjy.kaogong;

import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(AppUpdatePlugin.class);
    registerPlugin(DeviceSyncPlugin.class);
    registerPlugin(TextRecognitionPlugin.class);
    super.onCreate(savedInstanceState);
    // Android 15+ (targetSdk 35) 强制 edge-to-edge：WebView 延伸到状态栏/导航栏下方，
    // 且 Android WebView 的 env(safe-area-inset-*) 恒为 0，纯 CSS 无法避让。
    // 这里把系统栏高度设成 WebView 的上下 margin，页面内容不再与系统栏重叠。
    View content = findViewById(android.R.id.content);
    ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
      Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
      View webView = getBridge().getWebView();
      ViewGroup.LayoutParams lp = webView.getLayoutParams();
      if (lp instanceof ViewGroup.MarginLayoutParams) {
        ViewGroup.MarginLayoutParams mlp = (ViewGroup.MarginLayoutParams) lp;
        mlp.topMargin = bars.top;
        mlp.bottomMargin = bars.bottom;
        webView.setLayoutParams(mlp);
      }
      return insets;
    });
  }
}
