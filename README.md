# 格记

格记是一套本地优先的通用打卡工具，可在“通用模式”和“考公模式”间即时切换。Android 应用支持习惯与任务打卡、数量目标、专注计时、节律复盘，并在考公模式保留计划管理、百化分和公式背诵；可安装的 Windows 电脑伴侣负责局域网同步、数据保存，以及为手机提供 APK 扫码下载入口。

模式切换不会拆分或删除数据。任务、打卡和计时在两种模式间共享，考公训练记录会在通用模式中隐藏并在切回后完整恢复。

产品介绍页：[https://alexued.github.io/kaogong-checkin/](https://alexued.github.io/kaogong-checkin/)

测试报告：[报告目录](https://alexued.github.io/kaogong-checkin/reports/) · [v0.15.1 Android 与 Windows 发布验收](https://alexued.github.io/kaogong-checkin/reports/v0.15.1/TEST-REPORT.md)

## 宠物、奖励与离线心愿券

- 宠物中心提供仓鼠及 10 种新增宠物，每种新增宠物拥有独立的 SVG 动画动作、状态、装扮、喂养和番茄钟奖励联动。
- “我的奖励”支持设置游戏、电影等现实奖励。奖励只记录兑换和使用状态，不会控制第三方应用。
- 支持完全离线的“星星心愿券”：送出者生成二维码，另一台设备扫码收下；受赠者发起兑换请求，送出者扫描后签发一次性“小钥匙”，受赠者扫回确认后才扣星。也支持在没有相机时通过本地文本或文件传递。
- 心愿券使用本机 P-256 签名验证，私钥不进入二维码、普通备份或网络；离线分享不需要互联网、账号、热点、蓝牙或监督关系绑定。固定的奖励名称和价格是分享时的快照，源奖励改价或停用后需要重新分享。
- 开发版可在“我的奖励”标题连续点击 5 次，使用应用内自制数字键盘输入 192837 开启星星小工坊。它仅用于测试余额，不能绕过心愿券的小钥匙确认，也不是安全边界；进入后台或退出应用会自动锁定。

离线功能的限制：面对面扫码只能证明签名来自某台曾生成心愿的设备，不能在线证明真人身份；已发出的小钥匙无法远程撤回；如果用户拥有 Root 权限或回滚全部本地存档，任何纯离线应用都无法保证防篡改。验收范围见 [v0.17.0报告](docs/reports/v0.17.0/TEST-REPORT.md)。

## 下载

| 平台 | 文件 | 大小 | 系统要求 | SHA-256 |
| --- | --- | --- | --- | --- |
| Android 测试版 | [kaogong-checkin-v0.17.0.apk](https://github.com/Alexued/kaogong-checkin/releases/download/v0.17.0/kaogong-checkin-v0.17.0.apk) | 52.40 MiB | Android 7.0 或更高版本 | E19363BBFAB75D399266F33C89CE4D63828C82861C5E74C4D8479E911A01C565 |
| Windows | [kaogong-checkin-windows-x64-setup-v0.15.1.exe](https://github.com/Alexued/kaogong-checkin/releases/download/v0.15.1/kaogong-checkin-windows-x64-setup-v0.15.1.exe) | 109.11 MiB | Windows 10/11 x64 | 79A5ACB0A93A0B1A425DFF3ACF08CD9574C58D14B22DC592A760B994696C7255 |

Android 0.17.0 为 internal-debug 测试版，已完成真机离线文本兑换链路及宠物目录回归，心愿页320px窄屏和深色浏览器专项已补测；双实体手机相机互扫、正常长时番茄和长期动画性能仍待验收。Windows 电脑伴侣保持 0.15.1，本次未重新发布。

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
Get-FileHash .\kaogong-checkin-v0.15.1.apk -Algorithm SHA256
Get-FileHash .\kaogong-checkin-windows-x64-setup-v0.15.1.exe -Algorithm SHA256
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
