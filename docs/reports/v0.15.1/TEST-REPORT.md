# 格记 v0.15.1 发布测试报告

## 1. 验收结论

- 版本：v0.15.1，Android versionCode 20，应用包名 com.wjy.kaogong。
- 本轮完成二级页面深度过渡、学习概况热力图折叠、计时模式切换动画和圆形按钮尺寸修复。
- Xiaomi M2007J1SC（Android 13）已通过 ADB 覆盖安装最终 APK；未卸载、未清数据、未重启手机。
- 自动化测试共 244 项通过、0 失败；TypeScript、Vite、Android JVM 与 APK 构建全部通过。
- 8 个二级路由、同组件二级路由、Android 返回键、快速重复切换、热力图持久化、计时 7 次打点及横竖屏均通过真机验收。
- Android 与 Windows 发布产物身份一致，最终 Windows 安装器内嵌 APK 的 SHA-256 与独立 APK 完全一致。

## 2. 发布产物

| 产物 | 文件 | 大小 | SHA-256 |
| --- | --- | ---: | --- |
| Android APK | kaogong-checkin-v0.15.1.apk | 50,242,861 字节（47.92 MiB） | 8E3A1BABDD442321A2F2340A4E42BE4940D82127F70E7D870020D292EEAD83C2 |
| Windows NSIS | kaogong-checkin-windows-x64-setup-v0.15.1.exe | 114,413,285 字节（109.11 MiB） | 79A5ACB0A93A0B1A425DFF3ACF08CD9574C58D14B22DC592A760B994696C7255 |

Windows 安装器文件版本、产品版本均为 0.15.1，产品名为“格记电脑伴侣”。从最终 NSIS 安装器直接解出的 APK 为 50,242,861 字节，SHA-256 与 Android 发布 APK 完全一致。

## 3. 本轮修改验收

| 项目 | 实现 | 结果 |
| --- | --- | --- |
| 二级页面过渡 | 根舞台保活，二级层淡入并右侧轻移；返回时反向退出 | 通过 |
| 同组件二级路由 | router-view 使用 route.fullPath 作为稳定 key | 通过 |
| 热力图折叠 | 默认收起，标题按钮控制，CSS grid 0fr/1fr 过渡 | 通过 |
| 热力图可访问性 | aria-expanded、aria-controls、inert 与键盘焦点保护 | 通过 |
| 热力图偏好 | localStorage 保存最后展开状态 | 通过 |
| 计时模式切换 | 三槽位移动指示器，内容按方向淡入/位移 | 通过 |
| 圆形按钮 | flex 不压缩、1:1 宽高比、固定最小尺寸 | 通过 |
| 横屏打点列表 | 收紧内部最小列宽，消除右侧文本裁切 | 通过 |
| 低动态模式 | prefers-reduced-motion 下过渡缩短到 0.01ms | 通过 |

## 4. 自动化与构建

| 模块 | 结果 |
| --- | --- |
| Web 功能与回归 | 199 通过，0 失败 |
| Server 备份、CAS、同步与更新 API | 33 通过，0 失败 |
| Desktop 资源选择 | 3 通过，0 失败 |
| 发布产物与元数据脚本 | 9 通过，0 失败 |
| Desktop JavaScript 语法检查 | 通过 |
| TypeScript `tsc --noEmit` | 通过 |
| Vite 生产构建 | 312 个模块成功构建 |
| Android `testDebugUnitTest` | 通过 |
| Android `assembleDebug` | 通过 |
| 版本一致性检查 | 0.15.1 / versionCode 20 / schema 3 / protocol 3 全部一致 |
| `git diff --check` | 通过 |

新增静态回归断言覆盖：根页保活、二级路由 fullPath key、热力图折叠语义和持久化、计时模式双向过渡、移动指示器、主/副/打点按钮最小尺寸、横屏内部列宽及低动态降级。

## 5. Android 真机环境

| 项目 | 值 |
| --- | --- |
| 设备 | Xiaomi M2007J1SC |
| Android | 13 |
| 物理分辨率 | 1080 x 2340 |
| WebView CSS 视口 | 392 x 818（竖屏）、818 x 360（横屏） |
| 安装方式 | `adb install -r` 覆盖安装 |
| 最终版本 | versionName 0.15.1，versionCode 20 |
| 首次安装时间 | 2026-08-05 23:55:21，覆盖安装后未变化 |

## 6. 二级页面与导航测试

逐项进入并返回以下 8 个二级路由：

| 路由 | 结果 | 动画与布局 |
| --- | --- | --- |
| `/overview?date=2026-08-17` | 通过 | 根层退出与二级层进入均为 320ms，无横向溢出 |
| `/tasks` | 通过 | 320ms，无横向溢出 |
| `/timer/history` | 通过 | 320ms，无横向溢出 |
| `/stats` | 通过 | 320ms，长页面独立滚动 |
| `/stats/day/2026-08-17` | 通过 | 320ms 深度过渡与日期页入场并存 |
| `/review/day/2026-08-17` | 通过 | 320ms 深度过渡与日期页入场并存 |
| `/settings/device-sync` | 通过 | 320ms，无横向溢出 |
| `/settings/computer-sync` | 通过 | 320ms，无横向溢出 |

设备直连切换到电脑同步时，复用的 SettingsView 检测到 280ms `fade-slide` 退出动画，最终 DOM 只保留一个页面。Android 返回键从设备直连返回 `/settings` 后，二级层卸载、设置根页恢复且底部导航选中状态正确。

根 Tab 保活验证：计时页选择“倒计时”后进入历史记录再返回，仍保持“倒计时”模式，证明二级页动画没有销毁根页面实例。

## 7. 热力图测试

| 用例 | 结果 | 实测 |
| --- | --- | --- |
| 默认状态 | 通过 | aria-expanded=false，折叠轨道 0px，内容 inert=true |
| 展开动画 | 通过 | 箭头 320ms、轨道 320ms、内容 220/320ms |
| 展开尺寸 | 通过 | 内容轨道 382px，inert=false |
| 偏好持久化 | 通过 | 离开统计页再进入仍保持展开 |
| 收起恢复 | 通过 | 测试结束恢复为 false，不遮挡后续内容 |
| 视觉检查 | 通过 | 标题、箭头、月份控制和星期栏无重叠 |

## 8. 计时器测试

### 模式切换

- “计时 / 倒计时 / 番茄钟”三个 Tab 的触控尺寸均为 89 x 44 CSS px。
- 指示块从 0px 移动到约 91.33px、182.66px，对应三个等宽槽位。
- 正向和反向切换均检测到 320ms 内容过渡；稳定后只保留一个 `.timer-mode-view`。
- 倒计时页面保留两个数字滚轮，番茄钟页面保留四个设置入口。
- 连续快速点击模式按钮 18 次后：一个选中项、一个模式视图、零残留运行动画。

### 打点与按钮

启动秒表后连续打点 7 次，测试结果：

| 元素 | 实测尺寸 | 结果 |
| --- | ---: | --- |
| 结束 | 64 x 64 CSS px | 正圆，通过 |
| 暂停 | 96 x 96 CSS px | 正圆，通过 |
| 打点 | 80 x 80 CSS px | 正圆，通过 |

- 三个按钮计算样式均为 `flex: 0 0 auto`、`aspect-ratio: 1 / 1`。
- 竖屏打点滚动区 clientHeight 180px、scrollHeight 251px，超过五条后在框内滚动。
- 打点前后控制区 y 坐标均为 550px，高度均为 124px，记录增长没有挤压按钮。
- 保存面板可以正常打开；测试选择“丢弃”，历史记录未新增测试条目。

### 横屏

- 横屏视口 818 x 360，页面无水平或垂直溢出。
- 打点面板位于 x=225..482，右边界与计时区右边界一致。
- 所有耗时文本最大右边界为 474，小于面板右边界 482，不再裁切。
- 控制区位于 x=494..794，三个按钮尺寸与竖屏完全一致。
- 测试结束将设备方向设置恢复为原始值 `user_rotation=0`。

## 9. 稳定性与数据安全

- 快速切换 5 个二级路由后，最终只有一个二级页面、一个可见路由层、零残留页面动画。
- CDP 模拟 `prefers-reduced-motion: reduce` 时媒体查询命中；源码和自动化断言确认新增动画统一降为 0.01ms。
- logcat 未发现本应用的 AndroidRuntime、Chromium 或 Capacitor 致命错误。
- 全程没有执行卸载、`pm clear`、恢复出厂设置或设备重启。
- 测试秒表全部丢弃，没有新增计时历史；没有新增、删除或修改用户任务与打卡记录。
- 测试结束应用停留首页，无活动计时，屏幕方向和 Android 动画比例均恢复原值。

## 10. Windows 与 Pages

- 完整 electron-builder packaging 在当前环境静默运行 10 分钟后达到工具上限，未输出失败日志。
- 按上一版已验证流程，使用现有 Electron 37 运行时重新生成当前 app.asar，替换 Server、Web 和 APK，并将内部 EXE 文件/产品版本更新为 0.15.1。
- `electron-builder --prepackaged` 成功生成 NSIS 安装器和 blockmap。
- 7-Zip 直接列出最终安装器中的当前 Web 哈希文件、app.asar 和唯一 APK；解出的 APK 哈希与发布 APK 一致。
- GitHub Pages 主产品页、9 套风格页、发布数据、下载链接、缓存键和报告目录全部更新为 v0.15.1。

测试日期：2026-08-17（Asia/Shanghai）

测试方式：ADB、WebView CDP、UIAutomator/Android 返回键、Node 自动化、Gradle、electron-builder、7-Zip
