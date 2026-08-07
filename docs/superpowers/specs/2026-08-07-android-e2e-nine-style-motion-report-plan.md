# Android 真机验收、九风格动效与报告实施计划

## 1. 基线与备份

1. 记录 Git commit、APK SHA-256、证书 SHA-256 和手机已安装版本。
2. 使用 `run-as` 备份 `com.wjy.kaogong` 私有数据到 `artifacts/device-backups/<run-id>/`。
3. 生成文件清单、大小和哈希，保存只用于本地恢复的原始备份。
4. 记录 localStorage 核心键存在性、实体计数和 ID 哈希，不输出正文。
5. 运行现有 Web、server、desktop、Android 单元测试和 Web 生产构建。

## 2. 共享动效基础

1. 新增 `docs/styles/shared/motion.js`，实现 motion-ready、IntersectionObserver、prev/current/next、滚动方向、bfcache 恢复和 reduced-motion。
2. 修改 `reset.css`，将等待进入状态从 `.js` 改为 `.motion-ready`，保证部分脚本失败时内容仍可见。
3. 扩展 `style-switcher.js/css`，加入切换方向、快速点击保护、目标材质语义和 reduced-motion 的 View Transition 降级。
4. 更新九页 HTML 的共享脚本版本键，并添加语义化 `data-motion-scene`、`data-reveal` 标记。

## 3. 九页独立编舞

1. 古风：卷轴、墨线、朱记与纸幕。
2. 赛博：扫描、切片、节点锁定与模块交接。
3. 终端：提示符、逐行输出与面板交接。
4. 政府：公文阅读序、表格线和盖章反馈。
5. 冲刺：分道线、计分冲线与赛段接棒。
6. 包豪斯：正交色块装配与网格吸附。
7. 文具：页签、装订边换页、笔迹和便签方向。
8. 蓝图：尺寸线、连接线、标注和流程逐级点亮。
9. 报刊：栏线、排印顺序、填墨和版面下推。
10. 将 Terminal、Stationery、Newspaper 等瞬时 `hidden` 交互改为两阶段退出/进入。

## 4. 自动化覆盖

1. 扩展 `web/test/pages-motion.test.mjs`，覆盖九页 motion.js 引用、语义标记、独立风格 token、reduced-motion 和 no-JS 失效安全。
2. 为共享控制器增加可测试的纯函数或 DOM 夹具，覆盖当前章节和方向判定。
3. 运行 `npm test`、`npm run build`、`node --check` 和 `git diff --check`。

## 5. 浏览器视觉与动效 QA

1. 在 `1440x900`、`1024x768`、`375x812`、`320x700` 验证九页。
2. 覆盖首次进入、慢速/快速双向滚动、重复交互、风格切换、浏览器前进后退和 resize。
3. 覆盖正常、减少动态和禁用 JavaScript。
4. 检查 console、资源失败、横向溢出、布局移动和不可见内容。
5. 运行 animation-jank QA，确认滚动路径只依赖合成属性，没有动画队列堆积。

## 6. 真机升级与业务验收

1. 完成备份校验后执行同签名 `adb install -r`。
2. 验证版本升级和原数据、偏好保留。
3. 采集冷启动、热启动、返回键、Tab 手势和生命周期证据。
4. 创建 `KG-QA` 任务、子任务、打卡、计时和背诵记录，覆盖新增、编辑、归档、恢复与删除。
5. 验证日历、补卡、排序、庆祝、热力图和日详情。
6. 验证同步关闭、重启持久化、重新开启、发现、配对、补传和回流。
7. 验证 GitHub/LAN 更新发现、下载、取消、重试和系统安装器边界。
8. 覆盖断网、服务重启、横竖屏、软键盘、锁屏和进程重启。
9. 收集脱敏截图、UI hierarchy、logcat 错误摘要、gfxinfo 和本地状态哈希。
10. 删除 `KG-QA` 隔离数据并验证真实数据基线仍在。

## 7. 网页报告

1. 生成 run ID 和版本化目录。
2. 写入 `report.json`、`evidence-manifest.json` 和静态 `index.html`。
3. 报告页面采用安静、严谨的测试控制台视觉，优先扫描与比较，不使用营销式 hero。
4. 添加报告目录页、产品页入口和 README 入口。
5. 本地验证所有链接、脱敏规则、长文本、桌面与移动布局。

## 8. 发布与最终验证

1. 只暂存本阶段已跟踪改动和新报告，不包含 `artifacts/` 原始证据目录。
2. 提交并推送 `main`，等待 GitHub Pages 构建状态为 `built`。
3. 使用带 commit 查询参数验证最新目录，再核对无参数的不可变报告 URL。
4. 验证 Pages 根页、九套风格、报告目录、版本化报告、APK 和 Windows 下载链接。
5. 在浏览器保留最终报告和产品页供用户验收。

