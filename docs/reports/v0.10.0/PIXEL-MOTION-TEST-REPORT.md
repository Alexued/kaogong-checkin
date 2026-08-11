# 格记 v0.10.0 像素动效与启动时序增量测试报告

## 1. 验收结论

- 测试日期：2026-08-11（Asia/Shanghai）。
- 测试对象：SwiftPixelGrid Pattern 风格的打卡、新建、删除反馈，以及冷启动阶段右下角新增按钮的显示时序。
- 功能结论：通过。未发现崩溃、ANR、WebView 脚本异常、数据残留、触控失效或页面级水平溢出。
- 启动结论：通过。启动层存在时，主界面和右下角新增按钮均不挂载；进入阶段二者同一稳定帧出现，未再观察到“+ 号先于其他界面加载”。
- 动效结论：通过。父任务打卡、子任务打卡、新建任务和删除任务均触发对应的离散九宫格 Pattern；减少动态效果时使用静态等价帧。
- 自动化结论：Web 测试 `137/137` 通过，Vite 生产构建通过（210 个模块）。
- 性能结论：功能稳定，但 Android 横屏四页轨道切换的 `gfxinfo` jank 比例仍偏高，属于既有整页 ViewPager 的后续性能优化项；本次没有宣称“零卡顿”。

## 2. 测试对象与环境

| 项目 | 值 |
| --- | --- |
| 应用 | 格记 |
| 版本 | 0.10.0 |
| Android versionCode | 13 |
| 包名 | `com.wjy.kaogong` |
| 真机 | Xiaomi M2006J10C |
| 系统 | Android 12 / API 31 |
| 屏幕 | 1080 x 2400，440 dpi |
| WebView 竖屏 CSS 视口 | 393 x 821（约值） |
| WebView 横屏 CSS 视口 | 873 x 342 |
| 安装方式 | `adb install -r -t` 覆盖安装 |
| 应用 UID | 10260（覆盖安装前后保持不变） |
| APK | `web/android/app/build/outputs/apk/debug/app-debug.apk` |
| APK SHA-256 | `3E3117378FDDFA27E434E4B30A4D157255268ADE132DBF3A69A6F40CE75142E0` |

覆盖安装前已备份应用私有数据：

- 文件：`artifacts/device-backups/20260811T113446+0800-pre-pixel-motion/app-data.tar`
- 大小：4,550,656 字节
- SHA-256：`004865C2A1B8A77DA7FCDF568F4A567260E005F265D049FD81B258F3E00BF5D5`

测试期间未清除应用数据、未卸载应用、未重启手机。

## 3. 实现验收范围

### 3.1 SwiftPixelGrid Pattern 适配

Web 端不能直接编译 SwiftUI 组件，因此本次按 SwiftPixelGrid 的 Pattern 分组和离散帧语义实现等价播放引擎，并保留九宫格视觉语言：

| 场景 | Pattern | 帧序列语义 | 真机结果 |
| --- | --- | --- | --- |
| 父任务打卡 | `confirm` | 中心点亮，十字扩散，九格确认 | 通过 |
| 子任务打卡 | `confirm` | 与父任务一致，锚定实际点击控件 | 通过 |
| 新建任务 | `arrival` | 从左下逐格汇入完整九宫格 | 通过 |
| 删除任务 | `dissolve` | 九格完整，向中心收束，最终消失 | 通过 |

播放引擎以绝对时间计算当前帧，不依赖累积定时器；页面隐藏时暂停绘制，恢复后按当前时间继续。一次性反馈停止在 Pattern 的最终语义帧，不发生循环跳帧。

### 3.2 数据与反馈顺序

- 新建任务先完成数据提交，再播放 `arrival`，首帧已能看到新任务。
- 打卡先更新父任务或子任务进度，再播放 `confirm`，进度和反馈一致。
- 删除确认接受后立即删除数据，再播放 `dissolve`；约 500ms 后反馈节点卸载。
- 删除确认取消不会改变任务，也不会播放误导性的删除反馈。

### 3.3 减少动态效果

- 浏览器 `prefers-reduced-motion: reduce` 下，Pattern 组件报告 `data-animated="false"`。
- 九宫格保留可识别的静态合并帧，CSS 单元格过渡关闭。
- 启动外壳与 FAB 改为短淡入，不执行缩放和位移动画。
- 测试结束后已清除浏览器媒体模拟，并恢复手机系统动画设置。

## 4. 冷启动与 FAB 时序

### 4.1 代码级状态机

启动外壳共享三阶段状态：

1. `pending`：启动层显示，主内容、底部导航和 Teleport FAB 均隐藏；FAB 不挂载。
2. `entering`：启动层结束后的下一帧，主内容、底部导航和 FAB 同步进入。
3. `ready`：进入动效结束，移除临时 `will-change`。

### 4.2 浏览器时序检查

- 冷启动初始状态：`launch=true`、`fabCount=0`、`shellPending=true`。
- 进入阶段：FAB 与应用外壳在同一帧出现。
- 375 x 812：无水平溢出，FAB 不遮挡空状态主文案。
- 320 x 568：无水平溢出，页头按钮文字隐藏为图标，中文不再逐字换行。
- 320px 空状态为 FAB 预留右侧空间，文案不与按钮重叠。

### 4.3 真机冷启动

- 最终应用级强制停止后启动：`LaunchState: COLD`。
- Android 报告 `TotalTime: 1115ms`，`WaitTime: 1142ms`。
- 竖屏逐帧证据位于 `artifacts/qa-pixel-motion-20260811/cold-frames-portrait/`。
- 逐帧观察中，原生空白阶段和格记启动层阶段均无右下角 FAB；主内容与 FAB 在稳定内容帧同步出现。
- 横屏高度小于 420px 时，响应式规则会隐藏 FAB，改用页头新增按钮；该状态不属于 FAB 丢失。

## 5. 真机功能矩阵

### 5.1 今日与任务

| 用例 | 结果 |
| --- | --- |
| 考公 / 通用模式双向切换 | 通过 |
| 通用模式今日、计时、复盘、设置导航 | 通过 |
| 考公模式今日、计时、背诵、设置导航 | 通过 |
| 空状态新增入口 | 通过 |
| 新建任务并播放 `arrival` | 通过 |
| 父任务打卡并播放 `confirm` | 通过 |
| 子任务打卡并播放 `confirm` | 通过 |
| 删除确认取消 | 通过 |
| 删除确认接受并播放 `dissolve` | 通过 |
| 删除后反馈自动卸载 | 通过 |
| 测试任务清理 | 通过，无有效 `KG-QA` 数据 |

### 5.2 计时

| 用例 | 结果 |
| --- | --- |
| 秒表开始、打点、暂停、继续、结束 | 通过 |
| 秒表结果丢弃 | 通过，无测试记录残留 |
| 倒计时 5/15/25 分钟预设 | 通过 |
| 倒计时开始、暂停、结束 | 通过 |
| 倒计时结果丢弃 | 通过，无测试记录残留 |

### 5.3 复盘与背诵

| 用例 | 结果 |
| --- | --- |
| 通用模式复盘入口和主要统计区块 | 通过 |
| 考公模式背诵入口 | 通过 |
| 百化分 / 公式切换 | 通过 |
| 公式对照表展开 | 通过 |

### 5.4 设置与响应式

| 用例 | 结果 |
| --- | --- |
| 浅色 / 深色主题切换 | 通过 |
| 减少动态效果 | 通过 |
| 竖屏 1080 x 2400 | 通过 |
| 横屏 2400 x 1080 | 通过 |
| 自动旋转恢复 | 通过，最终值为 `1` |
| 四个底部 Tab 连续点按与滚动 | 通过，无触控失效或错误路由 |

## 6. 自动化、构建与安装

| 检查 | 结果 |
| --- | --- |
| `npm --prefix web test` | 137 通过，0 失败 |
| `npm --prefix web run build` | 通过，210 个模块 |
| `npx cap sync android` | 通过 |
| `gradlew testDebugUnitTest assembleDebug` | 通过 |
| APK 覆盖安装 | 通过，UID 与数据均保留 |

Node 测试中出现固定端口 `24678` 已占用，以及桌面 Node 环境没有 Android `UdpSocket` 实现的诊断输出；相关测试仍全部通过，且这两项不来自本次像素动效代码。

## 7. 压力、性能与稳定性

### 7.1 极端输入压力

操作：8 轮四 Tab 快速点按，共 32 次导航；每个页面各执行快速上、下滑动，共 64 次滑动。

| 指标 | 结果 |
| --- | --- |
| 总帧数 | 445 |
| Janky frames（现代判定） | 78（17.53%） |
| 50 / 90 / 95 / 99 分位 | 9 / 22 / 31 / 77 ms |
| Missed Vsync | 44 |
| High input latency | 376 |
| Slow UI thread | 53 |
| Slow bitmap uploads | 0 |
| Slow issue draw commands | 74 |
| TOTAL PSS | 415,608 KB |
| TOTAL RSS | 543,696 KB |
| Graphics | 230,268 KB |

### 7.2 正常手速基线

操作：2 轮四 Tab 点按和页面滚动，导航间隔约 520ms，滑动时长约 320ms。

| 指标 | 结果 |
| --- | --- |
| 总帧数 | 192 |
| Janky frames（现代判定） | 39（20.31%） |
| 50 / 90 / 95 / 99 分位 | 12 / 25 / 30 / 61 ms |
| Missed Vsync | 24 |
| High input latency | 183 |
| Slow UI thread | 29 |
| Slow bitmap uploads | 0 |
| Slow issue draw commands | 38 |

### 7.3 冷启动空闲内存

| 指标 | 结果 |
| --- | --- |
| TOTAL PSS | 211,997 KB |
| TOTAL RSS | 333,508 KB |
| Graphics | 76,504 KB |
| Java Heap | 10,796 KB |
| Native Heap | 34,456 KB |

测试中未观察到黑屏、空白页、触控卡死、进程退出或反馈节点残留。短暂九宫格 Pattern 没有长期循环，也不是四页切换 jank 的触发条件。高 jank 和压力后较高的 Graphics 占用集中在既有的四个常驻页面横向轨道及其整页 transform/opacity 合成，建议后续单独优化离屏页面栅格化和永久 `will-change`；这不阻塞本次功能验收，但属于明确的性能风险。

## 8. 崩溃、日志与最终状态

- 压力测试后应用进程仍在前台，路由回到今日页。
- 应用 logcat 中 `FATAL EXCEPTION`、`AndroidRuntime`、`ANR in`、`Uncaught`、`TypeError`、`ReferenceError` 匹配数为 0。
- 最终 crash buffer 为 0 行。
- `ApplicationExitInfo` 中未匹配 crash、ANR、native crash 或 initialization failure；记录的 `USER REQUESTED` 来自测试中的显式 `am force-stop`。
- 最终模式：考公。
- 最终主题：浅色。
- 最终启动动画：开启。
- 最终测试业务数据：无有效 `KG-QA` 任务，无计时测试记录。
- 最终系统动画：animator 使用系统默认值，transition `1.0`，window `1.0`。
- 最终自动旋转：开启（`accelerometer_rotation=1`）。

## 9. 证据索引

本机证据目录：`artifacts/qa-pixel-motion-20260811/`

| 路径 | 内容 |
| --- | --- |
| `screenshots/` | 新建、删除确认、通用复盘、模式与主题截图 |
| `ui/` | UIAutomator 控件树与原生确认框证据 |
| `cold-frames-portrait/` | 竖屏冷启动逐帧截图和时间点 |
| `cold-launch.mp4` | 首轮冷启动录像 |
| `final-cold-launch.mp4` | 压力测试后的最终冷启动录像 |
| `gfxinfo-after-stress.txt` | 极端压力帧统计 |
| `gfxinfo-normal-interaction.txt` | 正常手速帧统计 |
| `meminfo-after-stress.txt` | 压力后内存统计 |
| `meminfo-cold-idle.txt` | 冷启动空闲内存统计 |
| `logcat/after-stress.txt` | 压力测试应用日志 |
| `logcat/final-cold-regression.txt` | 最终冷启动回归日志 |
| `logcat/final-crash-buffer.txt` | 最终 crash buffer |
| `final-exit-info.txt` | 最终应用退出原因记录 |

MIUI 的 `uiautomator dump` 会额外输出系统缺少 `/data/system/theme_config/theme_compatibility.xml` 的兼容性警告，但控件树仍正常生成；该警告不来自格记应用进程。
