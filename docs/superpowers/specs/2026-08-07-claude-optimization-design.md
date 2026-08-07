# Claude 功能融合后全量优化设计

## 1. 背景

本设计用于当前工作分支 `codex/claude-optimization`，基线为已经完成功能级融合并通过自动化与 Android 真机验收的提交 `f5620ad`。`codex-Claude` 是父集成分支，本阶段不改动它。

Claude 参考仓库当前仍停在提交 `e8dba75`，没有新的已提交功能。参考仓库中未提交且不完整的背诵页 XML 不作为迁移来源。后续工作以当前融合版本为唯一代码基线，继续吸收 Claude 版本的产品思路，而不是再次复制原生 Android 工程。

## 2. 已确认决策

- 优化范围覆盖稳定性、性能、任务学习闭环、背诵训练、统计、电脑同步和更新发布。
- 采用基础优先、分阶段重构，不并行混改共享状态。
- 允许重构数据结构和同步协议，不要求旧电脑端继续兼容新协议。
- 现有手机数据必须尽力迁移；迁移失败时保留原始备份、停止写入，并提供重试、导出和重置入口。
- 手机离线优先，是默认主数据源；电脑端只提供可选备份、恢复、配对和更新服务。
- 保留 Vue、Pinia、Capacitor、Node Server 和 Electron 技术栈。
- Android 原生层只承载必须依赖系统 API 的能力，不持有业务状态。
- 目标版本为 `0.9.0`，Android `versionCode` 为 `12`。

## 3. 目标

### 3.1 产品目标

1. 让“计划任务 -> 今日执行 -> 欠账处理 -> 统计复盘”成为连续、可解释的学习闭环。
2. 让百化分和公式训练使用一致的会话模型、反馈语言和历史统计。
3. 让统计页的每个汇总数字都能追溯到稳定的历史快照。
4. 让手机在没有电脑和网络时仍能完整工作。
5. 让电脑同步从隐式双向状态合并改为显式、可审计的手机备份与恢复。
6. 让 APK 更新从发现、下载、摘要校验到安装失败清理形成完整可信链路。

### 3.2 工程目标

1. 把业务规则从页面和 Pinia Store 中拆到可独立测试的领域与应用层。
2. 用统一 Repository 管理读取、迁移、验证、备份和原子写入。
3. 消除真机测试中的控制台错误、资源泄漏和生命周期竞态。
4. 为 Web、Server、Desktop、Android 和发布脚本建立一致的版本与协议元数据。
5. 保持构建产物、私密备份、设备信息和本机路径不进入 Git。

## 4. 非目标

- 不重写为 Kotlin 或 Jetpack Compose。
- 不同时维护 Vue 与原生两套手机应用。
- 不引入账号、云服务、社交、排行榜或远程推送。
- 不让电脑端成为默认主数据源。
- 不在本阶段新增与公考学习无关的任务类型。
- 不为了视觉变化重做全部页面；视觉优化服务于信息层级、响应式布局和操作效率。

## 5. 总体架构

代码按五层组织：

1. **UI 层**：Vue 页面和组件，只负责展示、输入、无障碍语义和导航。
2. **应用层**：执行完整用例，例如更新任务进度、结束训练会话、生成恢复预览。
3. **领域层**：纯函数和不可变模型，承载任务计划、进度快照、欠账、训练评分和统计规则。
4. **存储层**：Repository、schema v3、迁移、备份、验证、写入锁和导入导出。
5. **集成层**：电脑同步、UDP、更新源，以及 Android 原生插件。

依赖只能由外向内：UI 和集成层依赖应用层，应用层依赖领域和存储接口，领域层不依赖 Vue、Capacitor、网络或 localStorage。

Pinia Store 保留为 UI 响应式适配器，但不再直接实现迁移、同步协议或复杂统计。

## 6. v3 数据模型

### 6.1 存储信封

```ts
interface StorageEnvelopeV3 {
  schemaVersion: 3;
  revision: number;
  deviceId: string;
  savedAt: string;
  state: DomainStateV3;
}
```

- `revision` 每次成功提交后递增。
- `deviceId` 在首次创建 v3 状态时生成，后续保持稳定。
- `savedAt` 只用于诊断，不参与业务冲突判断。
- `revision` 从迁移成功后的 `1` 开始；每次本地领域状态成功提交递增一次，恢复导入也递增一次。
- 正式状态和 outbox 写入同一个 `kgc-repository-v3` 记录，避免当前 localStorage 多键写入的半提交状态。记录包含 `{ formatVersion: 1, envelope, outbox }`，一次 `setItem` 成功才算提交；写入异常保留旧记录并回滚内存状态。
- 原始迁移备份使用独立的 `kgc-migration-backup-v3` 键，保存来源键名、原始字符串、UTF-8 字节长度、SHA-256 和创建时间；备份成功前不得替换正式记录。
- 迁移源 `kgc-state` 与 `kgc-queue` 的原始字符串都进入同一份备份。备份和锁记录不得写入同步 outbox，也不得上传。

### 6.2 领域状态

```ts
interface DomainStateV3 {
  tasks: TaskV3[];
  dailyProgress: DailyProgressV3[];
  timerSessions: TimerSessionV3[];
  drillAttempts: DrillAttemptV3[];
  settings: SettingsV3;
}
```

### 6.3 任务

任务把计划方式与完成方式拆开：

```ts
interface TaskV3 {
  id: string;
  title: string;
  schedule: {
    kind: 'daily' | 'deadline';
    startDate: string;
    endDate: string | null;
  };
  completion: {
    kind: 'checklist' | 'quantity';
    target: number;
    unit: string;
  };
  subtasks: SubtaskV3[];
  order: number;
  archivedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

- `daily` 表示从 `startDate` 到 `endDate`（含首尾）每天一个完成机会；`endDate=null` 表示无结束日。`deadline` 必须有非空 `endDate`，表示该日期一个完成机会，未到期任务可在任务管理中查看但不计入当天完成率。
- 有子任务时完成方式固定为 checklist，target 固定为 1，unit 为空；主任务的 completed 仍由主任务勾选决定，子任务只作为同一日快照展示，不隐式替换主任务语义。
- 没有子任务的 checklist 使用 `completed` 的 `0/1` 值；quantity 的 target 必须是大于等于 2 的安全整数。
- `order` 必须是非负安全整数；归档写入 `archivedAt`，用户删除写入 `deletedAt`，二者都不删除历史进度。删除的任务只读，恢复会清除对应时间戳。

```ts
interface SubtaskV3 {
  id: string;
  title: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
```

### 6.4 每日进度

```ts
interface DailyProgressV3 {
  id: string;
  taskId: string;
  date: string;
  completed: number;
  targetSnapshot: number;
  unitSnapshot: string;
  subtaskSnapshot: Array<{ id: string; title: string; done: boolean }>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
```

- 历史统计只读快照，不读取任务当前 target。
- 欠账由计划和每日快照派生，不重复存储。
- 同一任务同一天只有一个有效进度记录。
- completed 为 0 时可软删除，但同步和迁移必须保留可审计的删除操作。
- `(taskId, date)` 是唯一键，包含 deleted tombstone；更新同一日期复用原 id，不新建第二条。未知 taskId 的进度不会被静默丢弃：迁移报告记录 orphan 数量，原始备份保留其完整内容，v3 正式状态拒绝带孤儿引用的提交。

### 6.5 计时与背诵

- 计时记录统一使用以下结构，保留 stopwatch/countdown、打点、关联任务、标签和软删除时间：

```ts
interface TimerSessionV3 {
  id: string;
  label: string;
  taskId: string | null;
  date: string;
  startedAt: string;
  durationMs: number;
  laps: Array<{ elapsedMs: number; splitMs: number }>;
  mode: 'stopwatch' | 'countdown';
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
```

- 百化分与公式统一使用以下结构，通过 `kind`、`catalogKey`、`sessionId`、结果和输入详情区分：

```ts
interface DrillAttemptV3 {
  id: string;
  kind: 'percent' | 'formula';
  catalogKey: string;
  sessionId: string;
  mode: 'full' | 'random';
  answer: string | null;
  correct: boolean | null;
  known: boolean | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
```

- 会话汇总由 attempts 派生；不再分别维护两套难以对齐的场次结构。
- 百化分继续使用安全整数或 BigInt 交叉相乘判分。
- 公式目录保持 36 条、8 个分类和稳定 key；百化分目录保持 24 条稳定 key。

### 6.6 设置

```ts
interface SettingsV3 {
  planEndDate: string | null;
  theme: 'light' | 'dark';
  markDate: string | null;
  startupAnimationEnabled: boolean;
  timerLapFontSize: number;
}
```

设置只保存用户明确选择的稳定偏好。临时 UI 状态、下载进度、同步 socket、服务器地址、配对摘要、同步开关和页面滚动位置不进入领域状态，也不随电脑备份导出。

## 7. 迁移与写入安全

迁移流程和逐字段映射：

1. 读取 `kgc-repository-v3`；不存在时读取旧 `kgc-state` 和 `kgc-queue` 的原始字符串，识别 v1、v2、v3 或未知未来版本。
2. 对 v1/v2 的两个原始字符串生成一次精确备份，备份成功前不写正式键。
3. 先在内存中按 v2 的 LWW 规则回放旧 queue，再逐字段转换：`Task.type/endDate/createdAt/updatedAt/archived/order` -> `schedule/completion/order/*At`；`Subtask` 挂入所属 Task；同一 `(taskId,date)` 的父任务与子任务 checkin 取各自 `(updatedAt,id)` 最大项，合成一个 `DailyProgressV3`；父 checkin 的有效 progress 映射到 `completed`，子 checkin 映射到 `subtaskSnapshot`；`TimerRecord` -> `TimerSessionV3`，`DrillRecord`/`FormulaDrillRecord` -> `DrillAttemptV3`；`Settings` 按字段映射并填充稳定默认值。
4. 同日重复记录不覆盖原始备份：正式 v3 只保留确定的 winner，迁移报告记录 duplicate 数量；孤儿子任务/checkin、无效日期、非法引用、超出安全整数或无法识别的记录进入失败锁，而不是静默修正。
5. 对 v3 执行结构、引用、数值范围、日期和唯一性验证；未知字段只保留在原始备份，不进入领域状态。
6. 序列化并重新解析，确认结果可稳定读取；以 `revision=1`、新 `deviceId` 和空 outbox 写入单 key repository。
7. 任一步失败时进入持久化 migration lock，不允许业务写入或同步上传。

迁移状态机为 `clean -> migrating -> ready | locked`。`locked` 记录 `sourceDigest/sourceBytesRef/errorCode/firstFailedAt`；启动时锁状态禁止加载空状态、禁止同步和业务写入。重试只重新读取同一原始备份并要求输入摘要未变化；导出生成原始 UTF-8 JSON 与 manifest（版本、字节数、SHA-256）；重置必须二次确认，先保留可导出的备份，再清理正式状态、队列和锁并创建空 v3 `revision=0`。主题、诊断查看、备份导出和重试在锁定页允许，更新安装和业务写入不允许。

验证矩阵固定为：schema/version、必填字符串和 ID、ISO 时间戳、`YYYY-MM-DD` 合法日期、引用存在、数组唯一性、非负安全整数、quantity target `>=2`、progress 在 `0..targetSnapshot`、unit 最长 12 个 Unicode 字符、duration/lap 非负且有限、目录 key 存在。结构损坏、未来版本、非法日期、孤儿引用、溢出和重复主键是 fatal 并进入锁；仅缺失可选字段才使用文档中的稳定默认值。每个 fatal 返回稳定 `errorCode`，不得用 clamp 掩盖数据损坏。

## 8. 学习闭环优化

### 8.1 今日页

- 今日任务、历史欠账和当天进度使用同一查询模型。
- quantity 任务支持稳定尺寸的减号、当前值和加号控制，不因数字变化导致布局跳动。
- 欠账按任务聚合，同时保留所有来源日期；用户可展开查看来源。
- 日期切换不修改历史快照。
- FAB、日历和底栏在横屏及安全区内不重叠。

### 8.2 任务管理

- 编辑器明确分离计划方式和完成方式。
- 切换到子任务时提示并原子重置 quantity 字段。
- 归档、恢复和删除使用一致确认语言。
- 不允许保存空标题、非法日期、非安全整数或超长单位。

### 8.3 统计

- 汇总、月历、14 天完成率、计时比较和最近记录日全部从领域查询函数派生。
- 空数据必须返回有限数值和完整空状态，不出现 NaN、Infinity 或空白图表。
- 记录日详情使用显式父路由；Android Back 行为不依赖偶然的浏览器历史。
- 图表保持稳定宽高、键盘可访问和屏幕阅读器标签。

## 9. 背诵训练优化

- 百化分和公式共用会话状态机：setup -> playing -> summary。
- 未作答退出不写记录；已经确认或自评的 attempt 立即原子保存。
- 随机模式初始抽样不重复；错题或“没记住”允许按明确规则重新入队，直到本场结束或用户退出。
- 退出、翻面、确认答案和下一题使用一致的焦点与触摸目标。
- 对照表支持隐藏答案、分类筛选和无横向页面溢出；内部宽表可以在组件内滚动。
- 历史掌握度、场次汇总和统计页读取同一 DrillAttempt 查询模型。

## 10. 同步协议 v3

### 10.1 定位

手机是主数据源，电脑保存手机提交的备份副本。正常同步只从手机推送到电脑，不从电脑隐式覆盖手机。

### 10.2 协议

每次提交包含：

```ts
interface SyncMutationV3 {
  mutationId: string;
  deviceId: string;
  localRevision: number;
  expectedBackupRevision: number;
  snapshotId: string;
  snapshotSha256: string;
  createdAt: string;
  operation: 'replace-state';
  envelope: StorageEnvelopeV3;
}
```

- `revision` 在信封中表示手机本地提交序号；服务器另维护每设备单调的 `backupRevision`。离线提交只保留最新待发送快照，最多保留一个已发送未确认项和一个合并后的待发送项，避免历史增长导致 outbox O(n²)。
- outbox 在 repository 单 key 中持久化，服务器成功确认后才移除对应 mutation；重启重发同一 `mutationId` 必须得到相同 ACK。
- 服务器按 `mutationId` 幂等处理；新 mutation 必须携带与当前值相等的 `expectedBackupRevision`，且 `localRevision` 严格递增；服务器拒绝修订不匹配、同 revision 不同摘要、未来协议、设备不匹配、无效摘要和无效 v3 状态，客户端保留本地状态并重新预览/重试。
- 配对 token 继续只存摘要；速率限制和撤销能力保留。
- 电脑恢复不是普通同步操作，必须先返回快照元数据和差异摘要，再由手机确认导入。

### 10.3 UDP

- Android 绑定 `0.0.0.0:8322`，创建 socket 时显式提供 properties。
- Server 向每个活动 IPv4 网卡的定向广播地址发送，并保留全局广播兜底。
- 客户端按 serverId 去重，忽略停止后的迟到包，停止时移除监听并关闭 socket。
- 诊断继续记录 received、accepted、duplicates、parseFailures 和 socketErrors。
- UDP 发现只提供未认证候选；已配对服务器必须校验固定的 `serverId` 与服务器公钥/证书指纹后才允许发送备份 token。当前 HTTP LAN 通道的威胁模型是可信隔离局域网，SHA-256 只证明完整性，不宣称来源真实性。

### 10.4 电脑快照与恢复

- Server 按 `deviceId` 保存 append-only 快照索引：`snapshotId`、schema/protocol、localRevision、backupRevision、字节数、SHA-256、createdAt 和来源；默认保留最近 10 代且有总容量上限，超限时拒绝新备份而不删除唯一旧快照。
- 恢复预览返回 `restoreId`、`snapshotId`、快照摘要、差异计数、当前手机 revision 和 `expiresAt`（10 分钟）。确认时携带 `expectedLocalRevision` 与快照摘要，手机原子校验未变化后先写本机 pre-restore backup，再导入 DomainState；本机 `deviceId` 保持不变，revision 为 `max(current, source)+1`。
- 预览过期、摘要变化或本机 revision 变化都必须重新预览；恢复失败回滚到 pre-restore backup。换机只能通过显式“导入到新设备”流程生成新的 deviceId，不得隐式克隆。

## 11. 更新与发布

- 版本统一为 `0.9.0 (12)`，由一个元数据源同步到 Web、Server、Desktop 和 Android。
- 版本清单同时声明 `stateSchemaVersion=3`、`syncProtocolVersion=3`、`minCompatibleSyncProtocolVersion=3`、`backupFormatVersion=1` 和 `releaseChannel`；消费者漂移或请求缺少显式协议版本时构建/握手失败。
- GitHub 与 LAN 更新都必须提供可验证的 SHA-256 完整性摘要；摘要缺失时禁用应用内下载。摘要本身不证明发布来源，来源真实性由 HTTPS、已固定的服务器身份和 APK signer 校验共同承担。
- Android 在启动安装器前验证下载文件摘要；失败时无论 UI 是否存活都清理文件与持久化下载记录。
- Desktop 发布门禁继续用 aapt 验证包名/版本，用 apksigner 验证签名证书指纹，并只嵌入唯一规范 APK。正式渠道必须沿用历史正式签名证书，否则 Android 无法覆盖升级；证书轮换必须另行设计并通过系统级迁移验证。
- 正式发布签名证书通过外部安全配置提供，不写入仓库；内部 `0.9.0` debug 渠道沿用当前 debug keystore，报告明确 `5CE8...A45F` 仅为测试签名，不可作为正式发布凭据。
- 更新 manifest 增加 `versionCode`、applicationId、channel 和 signer SHA-256；Android 安装前同时校验版本身份与当前安装包的 signer，LAN 摘要缺失或服务器身份未固定时不得自动安装。

## 12. 交互、响应式与性能

- 修复 `touchmove` 在 `cancelable=false` 时仍调用 preventDefault 的日志问题。
- 横向手势只在明确水平意图后接管，垂直滚动和内部横向容器优先。
- 拖动期间的响应式写入继续按 requestAnimationFrame 合并。
- 四个根 Tab 保持独立纵向滚动位置；二级页不参与横向切页。
- 四个根 Tab 继续常驻 DOM 以保留 scrollTop，但非活动页必须同时设置 `inert` 和 `aria-hidden=true`；切换前移出旧页焦点，切换后聚焦新页标题或约定焦点点，键盘和 TalkBack 不得访问屏外页面。
- Android Back 的优先级固定为：关闭最上层可关闭弹层/键盘 -> 返回显式父路由 -> 四个根 Tab 最小化；迁移锁不可绕过，Back 不得进入底层业务页。父路由矩阵固定为 `/tasks -> /`、`/timer/history -> /timer`、`/stats -> /settings`、`/stats/day/:date -> /settings`，深链冷启动和页面按钮使用同一规则。
- portrait 和 landscape 均不产生页面级横向溢出。
- 横屏计时页允许纵向滚动，关键控制必须完整可达。
- 支持 prefers-reduced-motion，缩减模式不隐藏内容。
- `prefers-reduced-motion` 下关闭页面/卡片/图表位移、缩放、stagger、spring 和循环动画；直接拖动可跟手，释放和 Tab 点击不做长距离空间动画，状态淡化不超过 120ms，首帧内容可读且导航不依赖 transitionend。
- 非交互图表提供稳定 accessible name 和逐条文本摘要，不进入 Tab 顺序；交互月历使用单一 roving tabindex，Arrow/Home/End 导航，Enter/Space 只激活有记录且非未来日期。sheet、确认框、恢复预览和迁移锁使用 `role=dialog`、`aria-modal`、焦点圈定和关闭后焦点归还。

## 13. 错误处理

| 场景 | 行为 |
| --- | --- |
| 迁移失败 | 保留原始备份、锁定写入、展示恢复操作 |
| 本地原子写失败 | 保留旧正式状态和 outbox，不发布成功事件 |
| 同步离线 | 本地照常工作，mutation 留在 outbox |
| 服务器拒绝修订 | 停止自动重试，展示诊断和重新备份入口 |
| UDP 不可用 | 手动地址仍可用，日志只记录一次可读错误 |
| 更新摘要缺失 | 禁用应用内下载，允许浏览器打开发布页 |
| 摘要不匹配 | 删除 APK、清除下载记录、绝不打开安装器 |
| UI 销毁 | 后台清理继续完成，不向已销毁插件回调 |

## 14. 测试与验收

### 14.1 自动化

- v1/v2 到 v3 的 fixture 迁移、幂等、精确备份和失败锁测试。
- Task、DailyProgress、欠账、快照和统计的纯领域测试。
- 百化分 BigInt 判分、公式目录、会话状态机和 attempt 汇总测试。
- Store/Application Service 只验证编排，不重复领域规则。
- 协议 v3 的幂等、修订拒绝、鉴权、UTF-8 和恢复预览测试。
- UDP 生命周期、去重、迟到包和 socket 参数测试。
- 更新摘要、失败清理、UI 销毁和 Desktop APK 门禁测试。

现有 v2 单元测试继续作为 legacy compatibility 套件运行；v3 测试替代旧协议的状态写入测试，旧电脑端只允许被明确拒绝并显示升级提示。所有新增功能必须先有失败测试，再实现。

### 14.2 真机

设备验收至少包含：

- `adb install -r` 后 UID 不变，迁移前备份存在，关键数据语义一致。
- 今日、任务、计时、背诵、设置、统计和所有二级路由冒烟。
- Android Back、冷/热启动、后台恢复、横竖屏和安全区。
- 隔离 Server 的真实 UDP 发现与开关恢复。
- 同一固定 12 次滑动协议的 gfxinfo 对比。
- FATAL、ANR、未捕获 JS、插件错误和 WebView 控制台错误均为 0。

每个真机用例记录 `QA-ID / 前置条件 / 固定手势或命令 / 预期 oracle / 脱敏 artifact / 清理步骤`。性能用例预热 5 次滑动后固定 12 次滑动，记录 `dumpsys gfxinfo <package> framestats` 的 deadline/legacy/P95/P99，并注明屏幕刷新率；横向溢出使用 CDP 对 `document.documentElement` 与当前 `.swipe-page-content` 测量 `scrollWidth-clientWidth`，四舍五入后均须不大于 1 CSS px。最终报告固定写入 `artifacts/device-qa-v090-final/TEST-REPORT.md`（目录保持 ignored）。

### 14.3 性能预算

固定协议下：

- deadline jank 不高于 3%。
- legacy jank 不高于 20%。
- P95 不高于 16 ms。
- P99 不高于 22 ms。
- 从 `/` 开始，固定设备/系统/刷新率/主题/fixture，无计时或弹层；预热 5 次后执行 `3 左 + 3 右` 重复两轮，物理坐标 `850,1170 -> 230,1170` 及反向，每次 260ms、间隔 350ms；至少 3 轮取中位数，并保存每轮原始 gfxinfo。每轮开始先 reset gfxinfo，测量时关闭录屏和性能 CDP。
- 相对 `f5620ad` 同条件基线不得回退超过 jank +0.5 个百分点、P95 +1ms、P99 +2ms；绝对门槛和相对门槛同时满足。
- 根路由在 12 次滑动后仍正确。
- portrait/landscape 的根节点和活动滚动容器横向 overflow delta 不大于 1 CSS px。

## 15. 实施阶段

### 阶段 0：稳定性基线

- 修复 touchmove 日志。
- 固化当前测试、真机和性能基线。
- 建立 `0.9.0 (12)` 版本元数据。

### 阶段 1：领域与存储 v3

- 建立领域类型、Repository、验证器和迁移锁。
- 完成 v1/v2 -> v3 迁移与备份恢复 UI。
- 将 Store 改为应用层适配器。

### 阶段 2：学习闭环

- 重构任务、每日进度、欠账和统计查询。
- 更新今日页、任务编辑器、任务管理和统计详情。

### 阶段 3：背诵训练

- 统一 DrillAttempt 与会话状态机。
- 更新百化分、公式和训练统计。

### 阶段 4：同步、恢复与更新

- 实现协议 v3、手机单向备份、恢复预览和显式导入。
- 完成 UDP、摘要、下载和 Desktop 发布门禁收尾。

### 阶段 5：全量验收

- 跑完所有自动化、构建、Desktop 离线打包和 Android 真机矩阵。
- 更新最终 APK、哈希、签名信息和测试报告。
- 最终提交前执行 Git、隐私和构建产物审计；不推送远端。

## 16. 完成定义

只有同时满足以下条件才完成：

1. 所有阶段实现和测试完成。
2. v1/v2 数据可安全迁移到 v3，失败路径不覆写原数据。
3. 手机离线使用不依赖 Server。
4. 电脑只通过显式备份与恢复影响手机状态。
5. 自动化、构建、真机、性能和日志门槛全部通过。
6. `codex/claude-optimization` 工作区干净，提交历史不包含私密路径或构建产物。
