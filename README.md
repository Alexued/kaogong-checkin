# 考公打卡

考公打卡是一套本地优先的备考工具。Android 应用负责每日计划、专注计时和背诵训练；可安装的 Windows 电脑伴侣负责局域网同步、数据保存，以及为手机提供 APK 扫码下载入口。

产品介绍页：[https://alexued.github.io/kaogong-checkin/](https://alexued.github.io/kaogong-checkin/)

## 下载 v0.6.0

| 平台 | 文件 | 大小 | 系统要求 | SHA-256 |
| --- | --- | --- | --- | --- |
| Android | [kaogong-checkin-v0.6.0.apk](https://github.com/Alexued/kaogong-checkin/releases/download/v0.6.0/kaogong-checkin-v0.6.0.apk) | 4.18 MiB | Android 7.0 或更高版本 | EF7510E71A8BDA18BCDD46E6E9643C8E3573FBBD8034D919729BDC1D2F6B4CC6 |
| Windows | [kaogong-checkin-windows-x64-setup-v0.6.0.exe](https://github.com/Alexued/kaogong-checkin/releases/download/v0.6.0/kaogong-checkin-windows-x64-setup-v0.6.0.exe) | 92.16 MiB | Windows 10/11 x64 | 34A9F9E6114ECE19B01D23BEB42E5A9BE18788EEFE4F8DAC42B3E665D6F67812 |

本项目目前没有代码签名证书。首次运行 Windows 安装程序时，SmartScreen 可能显示“Windows 已保护你的电脑”。确认文件来自本仓库发布页并核对 SHA-256 后，可点击“更多信息”继续运行。

## Windows 电脑伴侣

1. 下载并运行 Windows 安装程序，无需预先安装 Node.js。
2. 应用启动后会运行本地服务，并显示局域网地址和六位配对码。
3. 在 Android 应用的“设置”中开启“电脑同步”，选择电脑并输入配对码。
4. 手机与电脑需要位于同一家庭网络、个人热点或其他可信专用网络。

电脑伴侣关闭窗口后会留在系统托盘继续运行。选择“退出”才会停止服务。默认不开机启动，可在应用内自行开启。

数据和日志保存在：

```text
%APPDATA%\KaogongCheckin
```

Windows 电脑伴侣还会显示一个局域网二维码。手机扫码后可以下载其内置的 Android APK，再由 Android 系统确认安装。

## 电脑同步开关

新安装默认关闭电脑同步。关闭时，应用不会进行以下行为：

- 不发起 REST 请求或 WebSocket 连接
- 不进行自动重连或 UDP 局域网发现
- 不通过局域网服务器检查更新

关闭同步不会删除手机数据，也不会清空待同步队列。重新开启后，需要用户主动扫描并完成配对，应用才会恢复电脑连接。

服务使用六位配对码交换客户端令牌。之后的 REST 请求使用 Bearer 令牌，WebSocket 使用客户端令牌鉴权。请只在可信专用网络中运行电脑伴侣。

## 校验下载文件

PowerShell：

```powershell
Get-FileHash .\kaogong-checkin-v0.6.0.apk -Algorithm SHA256
Get-FileHash .\kaogong-checkin-windows-x64-setup-v0.6.0.exe -Algorithm SHA256
```

输出应与发布页和上方下载表一致。

## 本地开发

Web 与 Android：

```powershell
cd web
npm install
npm test
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```

本地服务：

```powershell
cd server
npm install
npm test
npm start
```

Windows 电脑伴侣：

```powershell
cd desktop
npm install
npm run check
npm run dist
```

Windows 安装包会生成到 `desktop/dist/`。构建前，将 Android APK 放入 `desktop/resources/apk/`，安装后的电脑伴侣才能提供扫码下载。

## 代码说明

仓库源码可查看和审阅。当前仓库尚未提供 LICENSE 文件，因此不要将其视为已授予通用开源许可。
