# 考公打卡

考公打卡是一套本地优先的备考工具。Android 应用负责每日计划、专注计时和背诵训练；可安装的 Windows 电脑伴侣负责局域网同步、数据保存，以及为手机提供 APK 扫码下载入口。

产品介绍页：[https://alexued.github.io/kaogong-checkin/](https://alexued.github.io/kaogong-checkin/)

测试报告：[报告目录](https://alexued.github.io/kaogong-checkin/reports/) · [v0.7.1 Android 真机验收](https://alexued.github.io/kaogong-checkin/reports/v0.7.1/adb-20260807T184457+0800/)

## 下载 v0.7.1

| 平台 | 文件 | 大小 | 系统要求 | SHA-256 |
| --- | --- | --- | --- | --- |
| Android | [kaogong-checkin-v0.7.1.apk](https://github.com/Alexued/kaogong-checkin/releases/download/v0.7.1/kaogong-checkin-v0.7.1.apk) | 3.27 MiB | Android 7.0 或更高版本 | 8D853018D8866DAA7123345166C6DE3F079C24AF9B7B09F0A8D8B7DDBB083689 |
| Windows | [kaogong-checkin-windows-x64-setup-v0.7.1.exe](https://github.com/Alexued/kaogong-checkin/releases/download/v0.7.1/kaogong-checkin-windows-x64-setup-v0.7.1.exe) | 91.38 MiB | Windows 10/11 x64 | DECAD4791F4A93609E04D89CEE026F41E5FBFE4FDE380D51FEF84A73D45FE474 |

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

电脑同步开启且发现已配置电脑后，Android 应用会自动比较局域网 APK、GitHub Release 和当前版本。检查只显示更高版本及来源，不会自动下载或安装；下载和系统安装仍需用户确认。

## 电脑同步开关

新安装默认关闭电脑同步。关闭时，应用不会进行以下行为：

- 不发起 REST 请求或 WebSocket 连接
- 不进行自动重连或 UDP 局域网发现
- 不通过局域网服务器检查更新
- 停止正在进行的局域网 APK 下载；若系统下载服务暂时不可用，会进行有界重试并保留失败提示
- 不自动检查 GitHub 更新，但仍可在设置页手动检查

关闭同步不会删除手机数据，也不会清空待同步队列。重新开启后，应用会重新发现已配置的电脑；只有首次使用或配对令牌失效时才需再次输入六位码。

服务使用六位配对码交换客户端令牌。之后的 REST 请求使用 Bearer 令牌，WebSocket 使用客户端令牌鉴权。请只在可信专用网络中运行电脑伴侣。

## 校验下载文件

PowerShell：

```powershell
Get-FileHash .\kaogong-checkin-v0.7.1.apk -Algorithm SHA256
Get-FileHash .\kaogong-checkin-windows-x64-setup-v0.7.1.exe -Algorithm SHA256
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
