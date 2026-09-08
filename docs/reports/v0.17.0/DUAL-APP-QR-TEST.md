# 双应用离线二维码测试

日期：2026-09-08。设备：Xiaomi Mi 10 Ultra（M2007J1SC），1080×2340。

## 结论与边界

同一部真机上的独立应用 A、B 已通过二维码图片传递完成真实验签、确认与扣星。不是文本粘贴或直接调用兑换接口，也没有复制身份、跳过验签或注入批准结果。

手机关闭 Wi-Fi 与移动数据，截图通过本机 USB ADB 文件传递到 Download；接收端在 Android 文件选择器选取截图，经 ZXing 读取实际像素。USB 仅传输图片，不承担签发或兑换逻辑。

本次不等价于两台手机的相机光学互扫验收。对焦、反光、低光、其他机型、截图极限压缩和长时间动画仍未覆盖。

## 安装隔离

| 项目 | 结果 |
| --- | --- |
| 测试 A | com.wjy.kaogong.qaa，格记测试 A |
| 测试 B | com.wjy.kaogong.qab，格记测试 B |
| 原格记 | com.wjy.kaogong，未覆盖、未卸载、未清空数据 |
| 存储与心愿身份 | 独立应用存储，各自生成心愿签名密钥 |
| APK 签名 | 沿用本地 Android debug 构建签名；不是声称 APK 签名证书各不相同 |

USB 直接安装遭 INSTALL_FAILED_USER_RESTRICTED 拒绝；改用系统安装界面确认后成功。没有修改手机安全保护开关。

## 实测项目

| 项目 | 结果与证据（本地 artifacts 目录） |
| --- | --- |
| A 生成 2 星游戏奖励二维码 | 成功；dual-qa-offer.png |
| B 图片识别并收下 | 显示 A 来源，收券不扣星；dual-b-offer-decoded.png |
| B 0 星请求 | 拒绝：星星不足；dual-b-insufficient-request.xml |
| B 设置测试余额 | 连点我的奖励五次，192837 自制数字键盘解锁；确认将该独立应用余额设为 20，未调整原格记 |
| B 生成兑换请求 | 成功；dual-qa-request.png |
| A 识别 B 请求并签发 | 成功；dual-a-request-decoded.png、dual-qa-key.png |
| B 识别钥匙与二次确认 | 成功扣除 2 星，20 → 18；dual-b-key-decoded.png、dual-b-redeemed-18.png |
| 相同钥匙再次识别和确认 | 提示不会重复扣星，余额仍 18；dual-b-replay-blocked.png |
| B 强制停止后重启 | 余额 18、待使用 1、游戏1小时与原兑换时间保留；dual-b-persisted-ticket.png |
| 取消图片选择 | 返回心愿页，未扣星，按钮可再次使用；dual-b-picker-cancel.png |
| 不含二维码的截图 | 显示无法识别提示，余额仍 18；dual-b-no-code-rejected.png |
| 将 B 的钥匙交给 A | A 未收对应券，前置校验拒绝，余额 0；dual-a-wrong-device-key.png。此项不冒充“已收券的第三方身份不匹配”专项 |
| A 强制停止后重启 | 发券及签发钥匙记录保留；dual-a-restarted-records.png/xml |
| 测试期间网络 | 系统 wifi_on=0、mobile_data=0 |
| 测试结束恢复 | wifi_on=1、mobile_data=0，回到原格记；dual-original-preserved.png/xml |
| 原宠物状态 | 小格、0 星、饱食度 50/100、喂养 0 次，与测试前一致 |

取消兑换请求、已收券第三方错误身份、篡改签名等异常由既有领域自动测试覆盖，本轮未逐项在图片选择器做真机重放。没有把这些记作本轮真机通过。

## 自动验证与构建

- TypeScript 类型检查通过。
- Node 测试 1284 通过，0 失败、0 跳过（含既有 44 项离线心愿测试）。
- Android JVM 单元测试 21 通过，0 失败：新增图片解码 5 项，覆盖三类消息长度的二维码在手机截图中的识别、无二维码、非法尺寸、超大尺寸、像素缓冲区不匹配。
- A、B debug APK 构建通过；普通无槽位 debug 构建及单元测试通过。
- 普通构建生成 APPLICATION_ID=com.wjy.kaogong、KGC_QR_TEST=false。
- 测试槽位 release BuildConfig 生成 DEBUG=false；原生入口要求 DEBUG 和 KGC_QR_TEST 同时为真。未进行 release APK 真机安装测试。
- git diff --check 通过。已有 Vite 大包提示和 Gradle 弃用提示仍存在，与此次扫码功能无关。

## 测试安装包

仅保存在本地 artifacts，不替换已有发布资源：

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| geji-qr-test-A.apk | 54713206 | 857A255367B8608F0B6EFCA53D8FA9CE7745D4FCE2112DB4FFF439D2B3AB11FE |
| geji-qr-test-B.apk | 54713202 | 182D9EDE96A99ACAA56B58093090F20F58E58260E655B17E79831A1EF4A2695C |

两款测试应用留在手机供继续使用。已发布的 kaogong-checkin-v0.17.0.apk SHA-256 仍为 E19363BBFAB75D399266F33C89CE4D63828C82861C5E74C4D8479E911A01C565。

截图与临时二维码不提交到仓库；源代码、构建说明和本报告可提交。
