# Codex-Claude 功能级融合实施计划

> 设计依据：`docs/superpowers/specs/2026-08-07-codex-claude-functional-integration-design.md`
>
> 当前基线：`main` 为 `76db0cb`；工作分支为 `codex-Claude`；Claude 参考 SHA 为 `e8dba753ea55da0c6a10c22254a43dbfd32408aa`。

## 实施原则

- 所有业务改动只进入 `codex-Claude`，不改 `main`。
- 以当前 Vue/Capacitor、Node server、Electron desktop 为产品架构，不复制 Claude 原生工程。
- 每个阶段先补会失败的测试，再实现，再运行该模块完整测试。
- 只显式暂存预期文件；`artifacts/`、构建产物、密钥和本机配置永不暂存。
- 现有数据、应用 ID、同步关闭边界和签名链优先级高于新功能。

## 阶段 0：仓库与隐私边界

### 任务 0.1：阻止 QA 私有产物被误提交

文件：

- 修改 `.gitignore`
- 新增 `test/release-privacy.test.mjs` 或复用现有隐私测试位置

步骤：

1. 为根目录 `artifacts/`、临时日志、设备备份与测试截图补充忽略规则。
2. 保留已经发布到 `docs/reports/` 的脱敏报告。
3. 测试 `git check-ignore artifacts/...`，并扫描 tracked 文件中是否出现 Cookies、Local Storage、配对令牌、keystore 密码或本机绝对私有路径。

验收：`git status --short` 不再显示 `artifacts/`，但文件仍留在磁盘。

## 阶段 1：v2 状态、数量型任务与同步兼容

### 任务 1.1：建立纯迁移器

文件：

- 新增 `web/src/lib/stateMigration.ts`
- 修改 `web/src/types.ts`
- 修改 `web/src/api/sync.ts`
- 新增 `web/test/state-migration.test.mjs`

步骤：

1. 在 `AppState` 增加 `schemaVersion`，在 `Task` 增加 `target/unit`，在 `Checkin` 增加 `progress/targetSnapshot/unitSnapshot`。
2. 实现不修改输入的 `migrateAppState`，将无版本状态解释为 v1。
3. 迁移旧有效打卡为 1/1，软删除记录保持删除；任务默认 1 和空单位。
4. 覆盖重复迁移、缺失集合、未知字段、非法数值和损坏 JSON。
5. 本地加载先保留 `kgc-state-v1-backup`，验证新状态可解析后才写回。

验收：v1 夹具逐字段保留，迁移两次等于迁移一次，失败不覆盖原始字符串。

### 任务 1.2：让服务端理解 v2 并保护旧客户端

文件：

- 修改 `server/src/stateStore.js`
- 修改 `server/src/server.js`
- 修改 `server/src/eventNormalizer.js`（若实际校验位于该文件）
- 修改 `server/test/server.test.js`
- 修改 `server/test/state-utf8.test.js`
- 修改 `desktop/src/main.js` 与相关测试（仅在其校验状态结构时）

步骤：

1. 服务端规范化 v1/v2 快照，持久化 v2。
2. 握手和 `/api/info` 返回 `stateSchemaVersion=2`、`minimumClientStateSchemaVersion=2`。
3. 拒绝旧客户端以缺少 v2 字段的全量快照覆盖 v2 数据，返回明确 409。
4. WebSocket upsert 保留新增字段，离线队列恢复后仍按 `updatedAt` 合并。

验收：合法 v1 可升级读取，合法 v2 可读写，降级覆盖被拒绝且原文件字节不变。

### 任务 1.3：数量进度交互

文件：

- 修改 `web/src/stores/app.ts`
- 修改 `web/src/lib/plan.ts`
- 修改 `web/src/lib/completion.ts`
- 修改 `web/src/components/TaskCard.vue`
- 修改 `web/src/components/TaskEditorSheet.vue`
- 修改 `web/src/views/TodayView.vue`
- 修改 `web/src/views/TasksView.vue`
- 新增 `web/test/task-progress.test.mjs`
- 扩展现有计划/同步测试

步骤：

1. 将二值 toggle 重构为 `setProgress`、`incrementProgress`、`decrementProgress`，保留二值兼容包装。
2. 首次进度写入目标和单位快照；目标编辑不改历史。
3. 数量卡使用减号、当前值、加号和完成状态，触控尺寸稳定且可读屏。
4. 编辑器加入模式、目标和单位；有子任务时锁定清单模式。
5. 今日欠账按任务聚合展示，展开后仍以原始日期写回。
6. 完成后保持原列表位置，不自动重排。

验收：旧任务行为不变；20 题任务可逐次增减；跨三天欠账可聚合查看但逐日追溯不丢失。

## 阶段 2：背诵内容与精确判分

### 任务 2.1：移植 36 条分类公式

文件：

- 修改 `web/src/lib/formula.ts`
- 修改 `web/src/views/FormulaDrillView.vue`
- 修改对应样式/组件
- 新增 `web/test/formula-data.test.mjs`

步骤：

1. 从 Claude `FormulaData.kt` 转换全部 36 条和 8 个分类。
2. 维持稳定 key，字段映射为名称、分类、公式、条件和提示。
3. 增加分类筛选，不改变全量顺序、随机模式或历史 key。
4. 验证每条 key 唯一、分类非空、公式可渲染、答案未在题面预览泄露。

验收：36 条、8 分类、无重复 key，完整和随机模式均可结束并写历史。

### 任务 2.2：百化分改用有理数判分

文件：

- 修改 `web/src/lib/drill.ts`
- 修改 `web/src/views/DrillView.vue`
- 新增 `web/test/fraction-grading.test.mjs`

步骤：

1. 移植 24 项标准分数和明确近似答案。
2. 解析整数分子分母，先用安全整数，超限改用 `BigInt` 交叉相乘。
3. 对零分母、符号、空白、额外字符和超大输入给出稳定结果。
4. 保持历史 `percent` 字段和会话统计兼容。

验收：等值分数、登记近似值、错误近似值、负号和零分母测试全部通过。

## 阶段 3：统计视图与返回导航

### 任务 3.1：统计数据投影

文件：

- 新增 `web/src/lib/statistics.ts`
- 新增 `web/test/statistics.test.mjs`

步骤：

1. 纯函数生成月历日状态、14 天完成率、最近 12 次计时分组和最近记录日期。
2. 缺席日保留 0，删除记录排除；倒计时与秒表分组。
3. 平均值、最快项和全勤天数在空数据、跨月和时区边界下稳定。

验收：固定夹具的图表投影可重复，时区不改变本地日期归属。

### 任务 3.2：构建可访问统计页

文件：

- 修改 `web/src/views/StatsView.vue`
- 新增或修改 `web/src/components/MonthlyHeatmap.vue`
- 新增或修改 `web/src/components/BarChart.vue`
- 修改 `web/src/styles/app.css`

步骤：

1. 实现四项摘要、可翻月热力图、14 天完成率、计时对比和 14 日记录入口。
2. 所有图表提供文字摘要、键盘焦点和稳定容器尺寸。
3. 适配深浅主题、360 px 窄屏、818 x 360 横屏和 200% 字体缩放。
4. reduced motion 下取消图表位移和错峰。

验收：无横向溢出、无嵌套卡片、标签不遮挡、空状态不跳动。

### 任务 3.3：统一父路由返回

文件：

- 修改 `web/src/router/index.ts`
- 修改 `web/src/main.ts`
- 新增 `web/src/lib/backNavigation.ts`
- 修改二级页面返回按钮
- 新增 `web/test/back-navigation.test.mjs`

步骤：

1. 为日期详情、任务管理、计时历史和计时详情声明父路由。
2. 页面按钮、浏览器 popstate 和 Android backButton 共用决策函数。
3. 深链无历史时回明确父页；仅四个根 Tab 最小化应用。

验收：`BACK-001` 的设置到日期详情路径返回设置页，根页返回仍最小化。

## 阶段 4：统一版本与 APK SHA-256

### 任务 4.1：单一版本清单

文件：

- 新增 `release/version.json`
- 新增 `scripts/sync-version.mjs`
- 新增 `scripts/verify-version.mjs`
- 修改 Web/server/desktop package、Android Gradle 和更新常量
- 修改根 README 的开发版本说明（不改已发布 v0.7.1 下载记录）

步骤：

1. 设定开发版本 `0.8.0`、Android versionCode `11`、applicationId `com.wjy.kaogong`。
2. 同步脚本通过结构化读写更新消费者，验证脚本发现漂移即失败。
3. 不创建 tag，不发布 Release。

验收：验证脚本能发现任一人工改坏的版本字段，正常树全部一致。

### 任务 4.2：生成并消费发布清单

文件：

- 新增 `scripts/create-release-manifest.mjs`
- 修改 `.github/workflows/release.yml`
- 修改 `web/src/api/update.ts`
- 修改 `web/android/app/src/main/java/com/wjy/kaogong/NativeUpdatePlugin.java`
- 修改 `server/src/updateCatalog.js` 或实际 APK 元数据模块
- 扩展 Web/server/Android 测试

步骤：

1. 为 APK 生成包含版本、文件名、字节数、SHA-256 和 applicationId 的 JSON。
2. GitHub 更新优先读取 asset digest，回退同 Release 清单；LAN 使用服务端摘要。
3. 下载完成后在 Android 原生层流式计算 SHA-256，再启动安装器。
4. 摘要不一致删除文件并返回可重试错误；无摘要不允许应用内直接安装。

验收：正确文件通过，单字节篡改失败并删除，取消/重试状态不回退。

## 阶段 5：UDP、横屏与性能

### 任务 5.1：修复定向 UDP 发现

文件：

- 修改 `server/src/server.js`
- 修改 `desktop/src/main.js`
- 修改 `web/src/api/discover.ts`
- 扩展 `server/test/server.test.js`
- 扩展 `web/test/update-automation.test.mjs`

步骤：

1. 枚举活动 IPv4 网卡并计算每个定向广播地址。
2. 广播公共身份字段到各定向地址和兼容全局地址，去重发送。
3. Android 绑定所有接口、扫描窗口内按 serverId 去重并记录脱敏诊断计数。
4. stop/关闭同步释放 socket、timer 和监听器，迟到结果不更新 UI。

验收：loopback 自动化收到发现包；多网卡计算有单测；关闭后计数不再增长。

### 任务 5.2：修复横屏安全区

文件：

- 修改 `web/src/views/TodayView.vue`
- 修改 `web/src/App.vue`
- 修改 `web/src/styles/app.css`
- 修改相关页面局部样式

步骤：

1. 使用逻辑方向 inset 和 visual viewport 约束 FAB、底栏与 sheet。
2. 小高度横屏启用紧凑间距，保持至少 44 x 44 CSS px 触控区域。
3. 键盘弹出和旋转后重新计算可用高度，不保留越界 transform。

验收：818 x 360 下 FAB 右边界不超过 818，页面无横向溢出。

### 任务 5.3：有测量依据的 120 Hz 优化

文件：按性能追踪结果限定修改，优先检查：

- `web/src/lib/swipeTabs.ts`
- `web/src/lib/motion.ts`
- `web/src/App.vue`
- 大列表与图表组件

步骤：

1. 复用 v0.7.1 操作脚本采集基线。
2. 合并滚动/手势写入到 requestAnimationFrame，清理重复观察器和大面积滤镜。
3. 原生 WebView 关闭无收益的整页 View Transition，保留控件级 transform/opacity。
4. reduced motion 与页面隐藏时停止循环动画。

验收：同设备同场景给出前后 gfxinfo；janky frame 比例相对 35.33% 明显下降，P99 不高于 22 ms。

## 阶段 6：统一验证与提交

### 任务 6.1：自动化与构建

依次运行：

```powershell
cd web
npm test
npm run build
npx cap sync android
cd android
.\gradlew.bat testDebugUnitTest assembleDebug

cd ..\..\server
npm test

cd ..\desktop
npm test
npm run check
```

若实际 package scripts 不同，先读取清单并使用仓库已有等价命令，不擅自跳过模块。

### 任务 6.2：浏览器视觉验收

启动 Vite 开发服务器，使用 Playwright 检查：

- 1440 x 900
- 393 x 852
- 360 x 800
- 818 x 360
- 浅色、深色、reduced motion

保存脱敏截图到临时目录，不默认提交。检查控制台错误、失败请求、横向溢出、文字重叠、稳定尺寸和键盘导航。

### 任务 6.3：Android 真机回归

1. 确认 ADB 设备、安装包 applicationId、签名和版本。
2. 先备份并校验用户数据；使用隔离服务端和 `KG-QA` 前缀测试数据。
3. 覆盖安装开发包，比较升级前后状态摘要。
4. 回归 `BACK-001`、`DISC-001`、`ORIENT-001`、`PERF-001` 及核心业务、更新和生命周期。
5. 清理测试数据并恢复用户原始状态与正式服务。

### 任务 6.4：最终 Git 审计

1. `git diff --check`。
2. `git status --short` 只出现预期源码/测试/脱敏文档。
3. `git ls-files` 不包含 `artifacts/`、密钥、缓存、APK 或本机配置。
4. 按阶段提交，提交信息记录 Claude 来源 SHA。
5. 不推送，除非用户明确要求。
