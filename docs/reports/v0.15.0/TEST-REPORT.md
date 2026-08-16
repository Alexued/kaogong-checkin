# 格记 v0.15.0 发布测试报告

## 1. 验收结论

- 版本：v0.15.0，Android versionCode 19，应用包名 com.wjy.kaogong。
- Web 自动化 195/195、Server 33/33、Desktop 3/3、发布元数据 4/4，全部通过。
- Xiaomi M2007J1SC（Android 13）已完成 ADB 覆盖安装、页面回归、长按动画、设备直连协议、进程重开和异常数据保护测试。
- 单机模拟第二设备的真实 TCP 配对、发送、接收、免码传输、拒绝、坏摘要和解除配对路径全部完成。
- 第二台实体手机在本轮未连接 ADB，未将双实体手机发现、双实体扫码和双实体传输虚报为通过。
- Windows 安装器已由当前 v0.15.0 app.asar、Web dist、Server 和 APK 通过预打包目录封装生成；完整 electron-builder packaging 在当前受限环境中长期不返回，因此该环境边界单独记录。

## 2. 发布产物

| 产物 | 文件 | 大小 | SHA-256 |
| --- | --- | ---: | --- |
| Android APK | kaogong-checkin-v0.15.0.apk | 50,269,385 字节（47.94 MiB） | 38B99F0D4A577ADBDA3A6A08B0930314907024E3B4BF782C69B16B4F55644DA2 |
| Windows NSIS | kaogong-checkin-windows-x64-setup-v0.15.0.exe | 114,411,651 字节（109.11 MiB） | 8A9243EC786D420FE03EA5B42D6DDADAEA37FD73CAA27071D60F07EF22F47EA0 |

Windows 安装器内嵌 APK 的 SHA-256 与 Android 发布 APK 完全一致。Windows EXE 文件资源版本为 0.15.0，产品名为 格记电脑伴侣。

## 3. 自动化测试

| 模块 | 结果 |
| --- | --- |
| Web 功能与回归 | 195 通过，0 失败 |
| Server 备份、CAS、更新 API | 33 通过，0 失败 |
| Desktop 资源选择 | 3 通过，0 失败 |
| 发布元数据、Pages、Windows 一致性 | 4 通过，0 失败 |
| TypeScript 类型检查 | 通过 |
| Vite 生产构建 | 312 个模块成功构建 |
| Android JVM 单元测试 | Gradle testDebugUnitTest 成功 |
| Android Debug APK | assembleDebug 成功 |
| Python 协议模拟器 | 使用工作区 Python 语法检查通过 |
| git diff --check | 通过 |

Web 回归覆盖通用模式与考公模式、任务与子任务、任务删除、计时器与五行打点窗口、倒计时、番茄钟、速算、题库、名师 Skills 复盘、恢复点、电脑覆盖同步、设备发现、配对协议、二维码入口、设置二级页面和 PixelGrid 动效。

## 4. Android 真机测试

| 用例 | 结果 | 证据或说明 |
| --- | --- | --- |
| ADB 覆盖安装 | 通过 | adb install -r 成功，不卸载、不清数据 |
| 版本信息 | 通过 | versionName 0.15.0，versionCode 19 |
| 数据保留 | 通过 | firstInstallTime 2026-08-05 23:55:21 未变化 |
| 设置首页与连接二级页 | 通过 | 设备直连、电脑同步分离为二级页面 |
| 两个发现开关 | 通过 | 允许发现本机与主动搜索可独立关闭、恢复 |
| 应用内扫码入口 | 通过 | PeerQrCaptureActivity 打开，MIUI 相机权限弹窗与返回链路正常 |
| 长按任务 | 通过 | 约 760ms 后任务保持 translateY(-6px) scale(1.015)，菜单关闭后约 450ms 回落 |
| TCP 首次配对 | 通过 | 六位码 225957，双方 paired-ack 完成，彩色配对索引返回 2 |
| 手机发送记录 | 通过 | 对端确认后返回 pull-snapshot，快照 19,031 字节，SHA-256 校验通过 |
| 手机接收记录 | 通过 | 对端快照完整替换成功，committed 返回，仓库修订号 552 到 555 |
| 接收前恢复点 | 通过 | 生成 1 个恢复点，来源机型 M2007J1SC，颜色和时间字段完整 |
| 冷启动免码传输 | 通过 | force-stop 后重新启动，旧配对仍存在，直接进入发送确认，无六码弹窗 |
| 主动拒绝 | 通过 | 对端收到 rejected/REJECTED，手机记录未改变 |
| 错误 SHA-256 | 通过 | 返回 SNAPSHOT_DIGEST_MISMATCH，仓库修订号保持 557，恢复点数量保持 1 |
| 解除配对 | 通过 | native listPairedDevices 变为空 |
| 旧令牌失效 | 通过 | 解除配对后旧令牌返回 PAIRING_REQUIRED |

## 5. 数据安全与运行日志

- 全程没有执行 pm clear、卸载应用、恢复出厂设置或重启手机。
- 当前设备没有新增用户任务；同快照 roundtrip 只验证了替换链路，并留下 1 个接收前恢复点供恢复页面验证。
- 当前应用进程未发现本应用的 FATAL EXCEPTION、AndroidRuntime 或 WebView TypeError。
- 测试结束时模拟器配对已解除，手机端没有保留测试设备配对关系。
- ADB 转发端口仅用于本轮本机 TCP 模拟测试，测试结束后不作为应用配置保存。

## 6. 未完成的实体设备边界

- 本轮 adb devices 只有 Xiaomi M2007J1SC，第二台 Android 设备未上线，mDNS 也未发现第二台服务。
- 因此双实体设备的局域网发现、双方真实配对请求、两块屏幕之间扫码、真实手机到平板传输不能标记为本轮通过。
- 单机协议模拟覆盖了相同的 Android 原生 TCP 帧、六位配对码、持久令牌、双方确认、完整替换和错误摘要保护；上线第二台实体设备后仍需补做真实网络验收。

## 7. 构建环境说明

- 直接执行完整 electron-builder packaging 时，当前沙箱在 packaging 阶段长期无产物返回。
- 已使用现有 Electron 37.10.3 Windows 运行时目录，重新生成 v0.15.0 app.asar，替换当前 Web、Server、APK，并更新 EXE 文件版本资源为 0.15.0。
- NSIS 预打包封装成功，生成的安装器和 blockmap 已复制到 desktop/dist 并写入 release/windows-manifest.json。

测试日期：2026-08-16（Asia/Shanghai）
测试设备：Xiaomi M2007J1SC / Android 13
测试方式：ADB、WebView CDP、Node 自动化、工作区 Python TCP 模拟器
