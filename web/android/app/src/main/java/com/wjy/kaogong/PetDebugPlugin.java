package com.wjy.kaogong;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PetDebug")
public class PetDebugPlugin extends Plugin {
  @PluginMethod
  public void capabilities(PluginCall call) {
    JSObject result = new JSObject();
    result.put("enabled", BuildConfig.DEBUG && "internal-debug".equals(BuildConfig.KGC_RELEASE_CHANNEL));
    call.resolve(result);
  }
}
