# 格记 v0.12.0 Android 真机测试报告

## 1. 验收结论

- 测试日期：2026-08-12 至 2026-08-13（Asia/Shanghai）。
- 总体结论：通过，可作为 `internal-debug` 渠道更新包，并覆盖推送到远端 `main`。
- 本轮重点回归了三个问题：只读模式下误写入、手机数据无法完整覆盖电脑、设备直连开关报错。
- 自动化：Web `163/163`、Server `33/33`、Desktop `3/3` 全部通过。
- 静态检查与构建：TypeScript、Vite 生产构建、Android `testDebugUnitTest`、`git diff --check` 全部通过。
- 真机：Xiaomi M2007J1SC，Android 13，使用 ADB/CDP，未卸载、未清数据、未重启手机。
- 测试结束后已清理本轮临时任务及 2 条临时同步墓碑，原有 25 条待同步消息恢复保留。

## 2. 测试对象与发布包

| 项目 | 值 |
| --- | --- |
| 应用 | 格记 |
| 版本 | `0.12.0` |
| Android versionCode | `15` |
| 包名 | `com.wjy.kaogong` |
| 发布渠道 | `internal-debug` |
| 状态/同步/备份协议 | `3 / 3 / 1` |
| 真机 | Xiaomi M2007J1SC |
| 系统 | Android 13 |
| 屏幕 | 1080x2340，440 dpi |
| 安装方式 | `adb install -r` 原地覆盖 |
| 首次安装时间 | `2026-08-05 23:55:21`，升级后保持不变 |
| UID | `10329`，升级后保持不变 |
| 交付 APK | `release/kaogong-checkin-v0.12.0.apk` |
| APK 大小 | `48,741,828` 字节 |
| APK SHA-256 | `40D9BC50DA68A2202622C21E264174E84673610381C8D242763042320418649D` |

正式 JKS 证书与手机现有历史 Debug 证书不同，本次保留历史 `internal-debug` 证书以确保已安装版本可以原地覆盖升级。设备 ID `3e230500-3936-458f-91bf-48c37f4cac48` 保留。

## 3. 自动化与构建

| 检查 | 结果 |
| --- | --- |
| `cd web && npm test` | `163` 通过，0 失败 |
| `cd server && npm test` | `33` 通过，0 失败 |
| `cd desktop && npm test` | `3` 通过，0 失败 |
| `cd web && npx tsc --noEmit` | 通过 |
| `cd web && npm run build` | 通过，295 个模块 |
| `cd web/android && ./gradlew testDebugUnitTest` | 通过 |
| `git diff --check` | 通过 |
| APK 发布清单与 SHA-256 | 一致 |

自动化期间有两类已知环境诊断：测试使用的 WebSocket 端口 `24678` 偶尔被并行测试占用，但对应测试仍全部通过；Node 测试环境不实现 Android `UdpSocket` 插件，真机原生发现路径另行验证。两者均未导致测试失败。

## 4. 本轮三个问题的修复验证

### 4.1 只读模式下不能打卡

验证步骤：

1. 安装升级后保留本机业务数据。
2. 注入迁移锁 `kgc-migration-lock-v3`，进入只读恢复状态。
3. 点击今日任务的打卡按钮。
4. 检查 v3 状态、打卡结果、成功动效和恢复提示。
5. 移除测试锁后，通过任务管理页面删除临时任务，验证正常写入路径。

结果：通过。

- 只读状态保持 `progress=0`、记录为删除墓碑，不会产生有效打卡。
- 只读状态没有播放“打卡成功” PixelGrid 动效。
- 首屏显示“验证并恢复 / 查看原因和操作路径”，并明确保留原始数据、不要清除应用数据、从恢复中心验证恢复的路径。
- 锁移除后正常任务删除成功，v3 任务集合从 1 条变为 0 条，关联进度同步删除。

### 4.2 手机数据完整覆盖电脑

使用隔离临时电脑服务 `127.0.0.1:18321`，数据目录为 `.artifacts/device-test/computer-overwrite-server`，没有操作用户真实电脑。

验证步骤：

1. 临时电脑主数据只写入一条唯一任务 `QA-COMPUTER-OLD`。
2. 手机切换到临时地址并连接，确认旧任务在手机端显示。
3. 点击“用本机完整覆盖电脑”，检查危险确认框。
4. 确认“确认完整覆盖”，检查手机和电脑主数据。
5. 检查电脑 `data.json.bak`，停止服务并移除 `adb reverse`。

结果：通过。

- 覆盖前确认框明确说明不会先读取电脑旧记录，电脑会自动保留恢复副本。
- 覆盖前不会执行 `GET /api/state`，直接以本机权威候选执行完整 `PUT /api/state`。
- 覆盖后电脑 `data.json` 的任务为空，包含手机的 3 条计时、3 条资料分析复盘、3 条速算及其他本机训练状态。
- 覆盖后电脑 `data.json.bak` 仍包含 `QA-COMPUTER-OLD`，证明旧电脑数据可回退。
- 本机覆盖候选成功清除，服务器基线记录为隔离服务 ID。

隔离测试的主数据证据：

```text
data.json     tasks=[]  timers=3  reviews=3  bytes=14198
data.json.bak tasks=[QA-COMPUTER-OLD]  timers=0  reviews=0  bytes=632
```

### 4.3 设备直连两个开关报错

验证了只读和正常两种状态，并分别检查 UI、localStorage、端口与错误消息。

| 用例 | 结果 |
| --- | --- |
| 只读状态开启“允许附近设备发现本机” | 通过，显示地址、端口、配对码和二维码 |
| 只读状态开启“主动搜索附近设备” | 通过，开关保持开启，无红色错误 |
| 正常状态同时开启两个开关 | 通过，`discover=true`、`search=true` |
| 关闭两个开关 | 通过，复位为 `false/false`，监听端口释放 |
| 失败时开关回滚 | 代码和自动化断言通过，UI显示具体错误原因 |

发现身份使用独立的 `kgc-device-sync-id-v1`，不再依赖业务数据迁移是否成功。只读模式允许发现和接收，但禁止发送尚未验证的数据。

## 5. 真机全模块回归

### 5.1 启动、导航和任务

- `adb install -r` 覆盖安装成功，版本显示 `0.12.0 (15)`，原有 v3 设备 ID 保留。
- 冷启动首屏主体与右下角新增按钮共享启动 shell 阶段，未观察到 FAB 早于主界面单独出现。
- 今日、计时、背诵、设置四个根页均可进入，二级任务管理和计时历史可返回父页。
- 任务新增、编辑、排序、归档、恢复、数量增减、打卡、取消打卡和删除均完成点按回归。
- 删除任务确认使用应用内弹窗，危险按钮为白字红底，点击后任务确实从列表和 v3 状态移除。
- URI、aria-label、按钮 disabled 状态和主要可视点击区域均可读取，没有发现不可操作的透明覆盖层。

### 5.2 计时、倒计时和番茄钟

- 秒表开始、打点、暂停、继续、停止、保存、历史入口和历史删除通过。
- 倒计时设置使用滚轮数字选择，不再出现数字键盘输入；滚动改变值并保存为计时记录通过。
- 倒计时暂停、继续、结束确认和完成页通过。
- 番茄钟专注、短休息、长休息、暂停、继续、停止确认和历史记录通过。
- 番茄钟专注时长、短休息时长、长休息时长和长休息周期均使用滚轮选择，滚动前后值变化可核对。
- 结束后的历史删除使用应用内确认弹窗，软删除后列表数量正确。

### 5.3 背诵、速算和题目复盘

- 背诵页四个入口可点按：百化分、公式、速算、题目复盘。
- 百化分 24 条与公式 36 条完整/随机练习、翻面、自评、总结和历史通过。
- 速算分类、难度、题量、出题、答题、正确/错误反馈、下一题、总结和历史通过。
- 自动化确认全部速算分类在简单、一般、困难三档都能生成可判分题目。
- 题目复盘支持技能选择，当前陈怀安技能可用，技能注册表保留后续扩展名师技能的入口。
- 题库可按关键词和分类搜索，选择题目后回填到复盘输入，生成六段式讲解并保存历史。
- 复盘历史删除使用应用内确认框，红色危险按钮文本可见且点击有效。

### 5.4 通用/考公模式与设置

- 考公模式和通用模式可双向切换，任务、计时和训练记录保留。
- 通用模式使用“打卡项目、习惯与行动、今日节律”等中性文案，不再绑定考公计划。
- 考公模式保留计划结束日、备考节奏和资料分析训练语义。
- 浅色/深色、启动动画、计划结束日、电脑同步、局域网发现、主动搜索、手动地址、配对码、二维码和版本更新入口可操作。
- 原始 `window.confirm` 和 Android 原生删除弹窗已替换为统一 `AppDialogHost`。

## 6. 数据、同步与安全回归

### 6.1 升级前后基线

升级前备份：`.artifacts/device-test/localstorage-before-v012.json`。

| 项目 | 升级前基线 | 测试结束 |
| --- | ---: | ---: |
| v3 任务 | 0 | 0 |
| v3 进度 | 0 | 0 |
| v3 计时 | 3 | 3 |
| v3 资料分析复盘 | 3 | 3 |
| v3 设备 ID | `3e230500-3936-458f-91bf-48c37f4cac48` | 相同 |
| 电脑同步地址 | `192.168.5.55:8321` | 相同 |
| 选中电脑 ID | `c8c04a0a-938a-4829-9194-338a2f19f866` | 相同 |
| 电脑同步开关 | `true` | `true` |
| 原有待同步队列 | 25 | 25 |
| 数据恢复锁 | 测试前无 | 无 |
| 设备直连开关 | `false/false` | `false/false` |

本轮产生的临时任务、临时恢复锁、2 条临时同步墓碑和候选中的临时进度均已精确清理。用户原有记录没有通过清空应用或直接覆盖 localStorage 的方式处理。

### 6.2 局域网覆盖与备份

- 服务端 `saveData()` 在完整替换前自动复制 `data.json` 到 `data.json.bak`。
- 手机覆盖逻辑不先取电脑状态，避免把电脑旧记录重新混入手机权威快照。
- 覆盖失败时手机本地状态不修改，配对失败、协议不兼容和服务器不可达均显示可操作错误。
- 接收其他设备记录与恢复点恢复都会重建 v3 仓库并解除只读状态，电脑同步自动暂停，防止旧快照回写。

## 7. PixelGrid 动效与界面检查

Web/Android 不能直接编译 SwiftUI 库，本项目沿用 SwiftPixelGrid 的离散像素分组、绝对时间播放和九宫格模式语义实现等价反馈。

| 场景 | 反馈 | 结果 |
| --- | --- | --- |
| 任务打卡 | confirm | 真机通过 |
| 任务删除 | dissolve | 真机通过 |
| 新建任务 | arrival | 自动化通过 |
| 背诵/速算答题 | 答对扩散、答错收束 | 自动化和既有真机证据通过 |
| 倒计时完成 | 完成反馈 | 真机通过 |
| 冷启动 | 与 shell 阶段同步 | 真机截图通过 |

截图和 CDP 证据保存在 `.artifacts/device-test/`，包括任务删除、倒计时滚轮、番茄钟滚轮、速算、题库、复盘、只读恢复、设备直连和覆盖电脑等文件。

## 8. 稳定性与已知边界

- 最终应用进程仍在运行，ADB 日志过滤未发现本应用 `FATAL EXCEPTION`、`AndroidRuntime` 崩溃或 WebView 运行时错误。
- 真机端口检查读取 `/proc/net/tcp` 时受 Android shell 权限限制，端口是否监听以前一轮已成功读取 `37041` 和本轮 localStorage/UI 状态、开关回滚及端口释放证据共同判断。
- 只有一台实体 Android 设备，本轮未执行两台实体手机/平板之间的 NSD 互搜；局域网完整替换使用了隔离电脑服务验证，设备直连协议和原生入口已有上一轮真机回归覆盖。
- 没有重启手机，符合用户“非必要不重启”的要求；冷启动使用 WebView 页面重载和应用前台回归完成。
- 构建提示 Vite 有一个约 540 kB 的主 chunk，属于已有性能优化建议，不影响本轮功能验收。

## 9. 证据索引

| 证据 | 路径 |
| --- | --- |
| 升级前 localStorage | `.artifacts/device-test/localstorage-before-v012.json` |
| 安装后状态 | `.artifacts/device-test/post-install-state.json` |
| 只读打卡 | `.artifacts/device-test/v012-readonly-blocked.json`、`.png` |
| 设备直连发现/搜索 | `.artifacts/device-test/v012-readonly-discoverable.json`、`v012-readonly-searching.json` |
| 任务删除确认与结果 | `.artifacts/device-test/v012-task-cleanup-dialog.json`、`v012-task-cleanup-after.json` |
| 电脑覆盖确认与结果 | `.artifacts/device-test/v012-overwrite-confirm.json`、`v012-overwrite-after-ui.json` |
| 隔离电脑主数据与备份 | `.artifacts/device-test/computer-overwrite-server/data.json`、`data.json.bak` |
| 滚轮倒计时 | `.artifacts/device-test/countdown-after-swipe.json`、`countdown-after-swipe.png` |
| 滚轮番茄钟 | `.artifacts/device-test/pomodoro-focus-wheel.json`、`pomodoro-focus-wheel.png` |
| 题库筛选与选择 | `.artifacts/device-test/question-bank-category-filter.json`、`question-bank-selected.json` |
| 发布包清单 | `release/release-manifest.json` |

本报告记录的是实际完成的代码、构建、ADB/CDP 和隔离同步验证，不将未执行的两台实体设备互测写成已通过。
