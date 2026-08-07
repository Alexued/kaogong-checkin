# Claude 优化 v3 实施计划

> 设计依据：`docs/superpowers/specs/2026-08-07-claude-optimization-design.md`
>
> 当前基线：`codex/claude-optimization` / `f5620ad`；Claude 来源：`F:\Claude\GongkaoCheckin` / `e8dba75`。

## 实施原则

- 手机本地状态是唯一业务真源；电脑只保存手机主动提交的快照。
- 每个阶段先补失败测试，再实现，再运行该阶段全部测试。
- v3 正式状态和 outbox 使用单 key repository；迁移源和备份在任何失败时保持不变。
- 只显式暂存源码、测试和脱敏文档；不暂存 `artifacts/`、APK、设备备份、`local.properties`、`node_modules` 或签名材料。
- 每完成一个阶段运行 `git diff --check` 和对应模块测试，阶段结果写入最终报告。

## 阶段 0：稳定性与版本基线

### 0.1 修复手势取消竞态

文件：`web/src/lib/swipeTabs.ts`、手势测试。

1. 在 `touchmove` 调用 `preventDefault` 前检查 `event.cancelable`。
2. 明确 `touchcancel`、多指、旋转中断、边界回弹和内部横向容器优先级。
3. 保持路由提交单次化，取消时清理 RAF、定时器和 pointer state。
4. 添加纯函数覆盖和回归测试，真机重复固定 12 次滑动协议。

### 0.2 统一版本元数据

文件：新增 `release/version.json`、`scripts/sync-version.mjs`、`scripts/verify-version.mjs`；修改 Web、Server、Desktop、Android 消费者。

1. 写入 `0.9.0`、`versionCode=12`、`stateSchemaVersion=3`、`syncProtocolVersion=3`、`minCompatibleSyncProtocolVersion=3`、`backupFormatVersion=1`、`applicationId=com.wjy.kaogong` 和内部 `debug` 渠道。
2. 同步脚本结构化更新 package、Gradle 和运行时常量；验证脚本拒绝任意漂移、缺字段或协议降级。
3. 版本测试覆盖正常同步、人工破坏字段和 Android aapt 身份。

## 阶段 1：领域与存储 v3

### 1.1 领域模型与验证器

文件：新增 `web/src/domain/*`、`web/src/storage/*`、测试夹具。

1. 定义 Task、Subtask、DailyProgress、TimerSession、DrillAttempt、Settings 和查询结果类型。
2. 实现日期、引用、唯一键、安全整数、单位长度、目录 key、软删除 tombstone 验证。
3. 将任务完成、欠账、快照和训练汇总实现为无 Vue 依赖纯函数。

### 1.2 v1/v2 到 v3 迁移与单 key repository

文件：修改 `web/src/lib/stateMigration.ts`、`web/src/api/sync.ts`、`web/src/types.ts`；新增 repository/迁移测试。

1. 读取 `kgc-repository-v3`；不存在时精确读取 `kgc-state` 与 `kgc-queue`。
2. 写入 `kgc-migration-backup-v3` 前不替换正式状态；备份记录原始字符串、UTF-8 长度和 SHA-256。
3. 回放旧队列，按设计的 `(updatedAt,id)` tie-break 合并同日父/子 checkin，并生成迁移报告。
4. 迁移成功后写 `{formatVersion,envelope,outbox}` 单 key，失败持久化 `kgc-migration-lock-v3`，禁止业务写与同步。
5. 实现 retry/export/reset；reset 二次确认且保留可导出的原始备份。
6. 测试损坏 JSON、未来 schema、非法引用、重复记录、配额/写失败、幂等迁移、重启锁定和精确备份。

### 1.3 Store/Application 适配

1. Pinia 仅负责响应式投影；业务提交统一经过 repository transaction。
2. 本地提交递增 local revision；outbox 最多一个 in-flight 加一个 coalesced pending snapshot。
3. recovery lock 时所有业务写、同步上传、更新安装均拒绝并显示诊断入口。

## 阶段 2：学习闭环与统计

文件：`web/src/lib/plan.ts`、`completion.ts`、`statistics.ts`、Today/Tasks/Stats 视图及组件。

1. 从 v3 DailyProgress 快照派生今日任务、deadline、逐日欠账和来源展开；日期切换只读。
2. quantity 控制保持固定宽度、44px 触控、键盘/读屏语义；切换到子任务前显示原子重置提示。
3. 统计汇总、月历、14 日序列、计时比较和记录日全部使用同一查询模型，空状态不产生 NaN/Infinity。
4. 路由声明显式父页；弹层优先于父路由，根 Tab Back 最小化；未知路径和非法日期重定向到明确父页。
5. 根 Tab 非活动页面 `inert + aria-hidden`，活动 Tab 的 `aria-current`、focus、roving tabindex 和 dialog focus trap 完整。

## 阶段 3：背诵训练

文件：`web/src/lib/drill.ts`、`formula.ts`、训练视图/组件及测试。

1. 统一 `setup -> playing -> summary` 会话；未作答退出不写，已确认 attempt 原子保存。
2. 保持 36 条公式/8 分类和 24 条百化分稳定 key；随机初始不重复，错题可重新入队。
3. 百化分使用安全整数/BigInt 交叉相乘，覆盖等值分数、近似、符号、零分母、超大整数。
4. 训练焦点、隐藏答案、分类筛选、宽表内部滚动和 reduced-motion 可访问性回归。

## 阶段 4：同步、恢复与更新

### 4.1 手机单向备份协议 v3

文件：`web/src/api/sync.ts`、`server/src/*`、`server/test/*`、Desktop 同步 UI。

1. mutation 携 `localRevision`、`expectedBackupRevision`、`snapshotId`、摘要和显式 protocol version。
2. Server 按设备维护 append-only 快照索引，幂等 mutation，拒绝 revision mismatch、同 revision 异摘要、未来协议和坏状态。
3. 电脑恢复先返回 `restoreId/snapshotId/hash/diff/expiresAt`，确认时做 expected revision/hash CAS；手机先写 pre-restore backup，再导入 DomainState。
4. token 不进入日志；UDP 只做未认证候选，已配对地址必须通过固定服务器身份校验。

### 4.2 更新与发布门禁

1. 发布 manifest 包含 version/versionCode/applicationId/channel/signer/sha256/size。
2. Android 安装前校验摘要、包身份、versionCode 和 signer；缺摘要或证书不匹配时删除并禁止安装。
3. Desktop 用 aapt、apksigner 和固定 signer digest 选择唯一规范 APK；debug 渠道明确只用于测试。

## 阶段 5：全量验收与交付

1. 运行 Web、Server、Desktop、Android JVM、TypeScript、Vite、Capacitor、Gradle、版本和发布脚本测试。
2. 浏览器/CDP 检查 1440x900、393x852、360x800、818x360，浅深主题、200% 字体和 reduced motion；只测活动页的 overflow。
3. 真机先采集 APK 身份、UID、迁移前备份和关键状态摘要，再 `adb install -r`；覆盖冷/热/进程恢复、Back、横竖屏、安全区、UDP、业务冒烟和更新失败清理。
4. 性能按固定协议预热 5 次、测量 12 次、三轮取中位数，保存原始 gfxinfo 和脱敏日志；同时满足绝对/相对门槛。
5. 最终报告写入 ignored 的 `artifacts/device-qa-v090-final/TEST-REPORT.md`，包含 APK SHA-256、debug signer、设备/系统、命令、QA-ID、通过/失败和残余风险。
6. 最终 Git 审计只允许预期源码、测试、规格/计划和脱敏报告；不推送远端。
