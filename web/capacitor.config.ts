import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.wjy.kaogong',
  appName: '考公打卡',
  webDir: 'dist',
  server: {
    // 局域网服务器是 http/ws，默认 https scheme 会被 WebView 按混合内容拦截
    androidScheme: 'http',
  },
};

export default config;
