# Windows 伴侣、电脑同步总开关与连续章节动效设计

## 目标与范围

本阶段将“考公打卡”从只有 Android APK 和手工启动 Node 服务的项目，扩展为 Android + Windows 的本地优先产品，并完成三项交付：

1. 提供可安装的 Windows x64 伴侣程序，用户不需要安装 Node.js 或执行命令即可启动局域网服务。
2. 将现有“上传同步”开关收敛为真正的“电脑同步”总开关，关闭后不访问电脑，同时保留全部本地能力和待同步变更。
3. 将苹果官网样板从一次性元素揭示升级为可逆的连续章节转场，让上一章、当前章和下一章在自然滚动中完成视觉接力。

目标版本统一为 `v0.6.0`。发布资产包括：

- `kaogong-checkin-v0.6.0.apk`
- `kaogong-checkin-windows-x64-setup-v0.6.0.exe`
- 两个文件对应的 SHA-256 校验值

本阶段不实现 macOS、Linux、Microsoft Store、静默安装、自动更新、USB/ADB 安装 APK 或云同步。Windows 程序通过二维码帮助手机获取 APK，最终安装确认仍由 Android 系统负责。

## 方案选择

### 已选方案：Electron + NSIS

Windows 程序使用 Electron 承载托盘、安装状态窗口和现有 Node 服务，通过 `electron-builder` 生成 NSIS 安装程序。

选择原因：

- 现有电脑端已经是 Node.js、Express 和 WebSocket，Electron 可以直接复用协议与存储实现。
- 安装包自带运行时，用户无需部署 Node.js、npm、Web 服务或环境变量。
- Electron 原生支持托盘、开机启动、单实例和 Windows 安装程序，首版交付路径最短。
- Tauri 仍需处理 Node sidecar；Node SEA 加原生托盘需要维护两套运行时；两者当前都不会降低总体工程风险。

代价是安装包体积较大。首版优先保证可安装、可诊断和可维护，不为了缩小体积重写稳定的同步服务。

### 不采用 ADB 自动安装

ADB 安装仍要求 Android 驱动、开发者选项、USB 调试、RSA 授权和系统安装确认，在国产手机、多设备和企业策略环境下维护成本很高。首版改为：Windows 程序内置当前 APK，显示局域网下载二维码，手机扫码后使用系统下载与安装流程。

## Windows 伴侣架构

### 目录和模块

新增 `desktop/`：

- `src/main.js`：Electron 生命周期、单实例、托盘、主窗口、开机启动和服务启动/停止。
- `src/preload.js`：通过 `contextBridge` 暴露最小、白名单化的 IPC API。
- `src/renderer/`：纯 HTML/CSS/JavaScript 控制台，显示服务、配对、APK 安装和诊断状态。
- `assets/`：Windows 图标和托盘图标。
- `package.json`：Electron、electron-builder、二维码生成和构建脚本。

现有 `server/src/index.js` 拆分为：

- `server/src/server.js`：导出 `createKgcServer(options)`。
- `server/src/index.js`：保留命令行入口，调用同一工厂，继续支持 `npm start`。

`createKgcServer()` 返回明确的 `start()`、`close()` 和状态查询接口。它必须持有并释放 HTTP server、WebSocket server、UDP socket、广播 interval 和所有监听器，保证托盘退出、端口重试和测试不会留下后台资源。

### 资源和数据位置

安装目录及 `app.asar` 只保存只读资源：

- 构建后的 `web/dist`
- 当前版本 APK
- 桌面控制台资源

运行数据写入 `%APPDATA%\KaogongCheckin`：

- `data/data.json`
- `data/data.json.bak`
- 配对信息和桌面设置
- 运行日志

安装升级不得覆盖数据目录；卸载默认不删除学习数据。控制台提供“打开数据目录”命令，删除数据必须由用户自行确认，不在卸载过程中隐式执行。

### 首次运行和主界面

首次运行流程：

1. 应用取得单实例锁并启动局域网服务。
2. 优先使用 HTTP `8321` 和 UDP `8322`；HTTP 端口冲突时在 `8321` 至 `8330` 中选择可用端口并广播实际端口。
3. 生成稳定的 `serverId`、配对令牌存储和当前六位配对码。
4. 打开控制台，显示运行状态、局域网地址、配对码和 APK 二维码。
5. Windows 防火墙阻止访问时，控制台显示“仅允许专用网络”的诊断说明，不伪装成连接成功。

主界面提供：

- 服务运行状态和启动/停止按钮
- 当前局域网地址及复制按钮
- 手机 APK 下载二维码
- 当前六位配对码和重新生成按钮
- 打开网页版
- 打开数据目录
- 开机启动开关，默认关闭
- 连接诊断和最近错误

点击窗口关闭按钮时缩到托盘；只有托盘“退出”才停止服务并退出进程。托盘菜单提供显示窗口、打开网页版、启动/停止服务和退出。

### 安全边界与配对

现有服务监听全部网卡、允许任意 CORS，且状态接口没有认证。将它直接做成常驻软件会让同一局域网的任意设备读取或覆盖学习数据，因此 Windows 版必须启用配对保护。

公开接口：

- `GET /api/info`
- `GET /api/update/latest`
- `GET /updates/:fileName`
- `POST /api/pair`

受保护接口：

- `GET /api/state`
- `PUT /api/state`
- WebSocket `/ws`

配对流程：

1. UDP 只广播 `serverId`、名称、HTTP 端口和 `pairingRequired`，不广播秘密。
2. 手机选择服务器后输入 Windows 控制台显示的六位配对码。
3. `POST /api/pair` 校验配对码并返回随机客户端令牌。
4. 手机按 `serverId` 将令牌保存在本机，不写入同步的 `AppState.settings`。
5. REST 使用 `Authorization: Bearer <token>`；WebSocket 使用连接参数携带令牌。
6. 配对接口按来源地址限速；用户可以重新生成配对码并撤销已有令牌。

该机制用于阻止同一局域网中的随意访问，不承诺在不可信公共 Wi-Fi 上替代 TLS。README 和 Windows 控制台明确要求仅在家庭或专用网络使用。

CLI 模式保留显式的兼容开关，但默认同样启用认证。需要兼容旧客户端时，用户必须主动设置 `KGC_ALLOW_LEGACY=true`，控制台和日志应明确显示“不安全兼容模式”。

### Electron 安全设置

- `contextIsolation: true`
- `nodeIntegration: false`
- 禁止 renderer 任意导航、新窗口和远程模块
- IPC 只允许服务状态、复制、打开本地目录、打开已验证 URL、开机启动和退出等明确命令
- 使用内容安全策略，不加载远程脚本、字体或分析代码
- 外部链接只允许预定义的 GitHub 仓库和 Release 地址

## 电脑同步总开关

### 用户语义

设置页将“上传同步”改名为“电脑同步”。

关闭时：

- 不请求电脑的 REST 状态接口
- 不创建或保持 WebSocket
- 不安排重连
- 不创建 UDP 发现 socket
- 检查更新时不请求局域网更新接口，只使用 GitHub
- 隐藏服务器选择、地址和“用本地覆盖服务器”操作
- 本地任务、计时、背诵、主题和统计继续正常工作
- 本地状态、服务器地址、配对令牌和待同步队列继续保留

文案明确说明：“关闭期间的数据只保存在本机；再次开启后会同步这些变更。”

重新开启时：

1. 读取本地完整状态和待同步队列。
2. 如果需要，发现并配对电脑服务器。
3. 拉取服务器快照。
4. 在本地应用服务器快照。
5. 依次重放关闭期间的本地变更。
6. 建立 WebSocket 并进入在线状态。

开关保存在独立的 `kgc-sync-enabled`，不进入同步数据。旧安装若已有 `kgc-state` 且没有该键，继续默认开启；全新安装没有本地状态时默认关闭。首次判定后立即写入明确值，避免后续歧义。

### 生命周期编排

新增单一的电脑同步编排入口，负责同步和发现的共同启动/停止。设置页与应用冷启动都调用这个入口，不再依赖多个调用点分别记得关闭 WebSocket 和 UDP。

每次同步运行生成递增 generation。HTTP 返回、WebSocket `open/message/close/error` 和 UDP 启动完成都必须同时校验：

- 当前 generation 仍有效
- 电脑同步仍开启
- 回调属于当前 socket

`stop` 会先递增 generation，再取消重连、解绑 socket 回调、关闭 socket、停止 UDP、清理监听器并将 `online=false`。因此关闭瞬间到达的旧快照或旧消息不能再覆盖本地数据。

本地水合和本地持久化订阅独立于网络分支，无论同步是否开启、初始请求是否被取消，都必须完成一次。

### 队列一致性

本版本修正现有“队列发送后立即读取快照”的竞态：重放完成后不再用一个可能较旧的 HTTP 快照覆盖刚发送的本地变更。

协议增加可选 `clientMutationId` 和服务器 `ack`：

- 新服务器按顺序确认收到的变更。
- 新客户端收到确认后才从本地队列移除对应项。
- 断线前未确认的消息保留并在重连后重发。
- 服务端现有 `updatedAt` last-write-wins 规则保证重复重放是幂等的。
- `/api/info` 返回 `protocolVersion`。旧服务器没有确认能力时，客户端使用兼容路径，但不执行重放后的旧快照覆盖。

长期关闭时，队列按 `entity + payload.id` 合并连续变更，保留每个实体的最终有效操作，防止 `localStorage` 无限制增长。设置对象只保留最后一次更新。

## 苹果样板连续章节动效

### 场景结构

页面场景顺序改为：

1. Hero：产品与直接下载
2. Today：今日计划
3. Focus：专注计时
4. Drill：背诵训练
5. Windows：Windows 伴侣与扫码安装
6. Sync：电脑同步开关与局域网连接
7. Download：双平台下载和校验

每个场景标记 `data-scene`，内部使用语义化的文案、视觉和下一章提示容器。隐私三条并入 Sync 的退出段，不再作为突然变矮的独立内容带。

### 上一章、当前章和下一章

长期存在的 `IntersectionObserver` 观察视口中线区域，始终维护唯一的 `is-current`，并同步设置相邻的 `is-prev` 和 `is-next`。观察器不会在首次显示后 `unobserve`，向上滚动时状态和动画可以反向恢复。

状态表现：

- `is-next`：文案下移 `28px`，视觉下移 `36px` 并缩放至 `0.985`，透明度降低。
- `is-current`：文案和视觉归位，透明度为 `1`。
- `is-prev`：文案上移 `18px`，视觉上移 `12px` 并缩放至 `0.99`，只在退出边缘降低透明度。

桌面场景时长 `680ms`，使用 `cubic-bezier(0.22, 1, 0.36, 1)`。文案、视觉和下一章提示延迟为 `0ms / 70ms / 120ms`。控制按钮继续使用现有约 `180ms` 的短反馈，不与章节动画共用长时长。

每章底部显示统一的“下一章编号 + 标题 + 箭头”，它与下一章的 section index 在视觉上接力。快速滚动时不排队，旧状态立即取消，以最新当前章为准。

### 背景接力

页面增加两个固定、不可交互的纯色背景层。场景改变时：

1. 隐藏层先切换为目标场景纯色。
2. 两层只使用 opacity，在 `520ms` 内交叉淡化。
3. 完成后交换前后层角色。

该方案消除白、黑、蓝灰章节在 DOM 边界的硬切，同时不引入渐变、模糊、滤镜或装饰光球。无 JavaScript 时，各章节继续使用自身静态背景色。

### 性能与降级

- 高频动画只修改 `transform` 和 `opacity`。
- 不在滚动中动画 `height`、`top`、`left`、阴影、滤镜或背景色。
- IntersectionObserver 负责章节判定；现有页面进度继续通过单个 `requestAnimationFrame` 更新。
- `will-change` 只在当前转场期间添加，完成后移除。
- `800px` 以下位移缩短为 `12px` 至 `16px`，时长缩短为 `420ms` 至 `520ms`，禁用缩放和 sticky 舞台。
- `prefers-reduced-motion: reduce` 下关闭空间位移、背景交叉淡化、stagger 和平滑锚点，所有内容立即可见。
- 无 JavaScript 时保留完整内容、章节背景和下载链接。
- 场景状态不得用 `visibility: hidden` 或 `pointer-events: none` 阻断键盘焦点中的交互。

## 页面与 README 内容

### GitHub Pages

- 页面 metadata 改为 Android + Windows 双平台描述。
- 导航增加 Windows 下载入口。
- 首屏保留 Android APK 主操作，并增加 Windows 安装程序入口。
- 新增 Windows 独立章节，使用 HTML/CSS 原生绘制桌面控制台，不展示旧截图。
- Windows 章节演示服务启动、局域网地址、配对码和手机扫码安装。
- Sync 章节增加可操作的“电脑同步”开关；关闭时服务器扫描、地址和同步操作进入禁用态，文案显示“仅保存在本机”。
- 最终下载区拆为 Android APK 和 Windows 安装程序两个发布块，分别显示版本、系统要求、文件名、大小和 SHA-256。
- Windows 直接下载链接只在实际 Release 资产上传成功后写入，不能提交死链或占位链接。
- `404.html` 改为同一苹果样板视觉，并使用双平台文案。
- 删除不再引用的旧 `themes.css`，保留现有截图资产但不在苹果样板中加载。

### 根 README

新增 `README.md`，至少包含：

- 产品简介和本地优先定位
- Android 与 Windows 下载表
- Windows 安装和首次运行步骤
- 手机扫码安装 APK 步骤
- 电脑同步开关的精确定义
- 配对和专用网络安全说明
- `%APPDATA%\KaogongCheckin` 数据位置及备份说明
- Android、Windows 系统要求
- SHA-256 校验命令
- 开发、测试和构建命令
- 未签名 Windows 安装程序可能触发 SmartScreen 的说明

仓库当前没有 LICENSE。README 在许可证明确前使用“源码可查看”，不宣称已经采用某个开源许可证。

## 错误处理

- 端口冲突：尝试限定端口范围；全部占用时显示明确错误和重试按钮，不进入假在线状态。
- 防火墙或访客 Wi-Fi：本机页面可用但手机不可达时，显示专用网络、防火墙和同一 Wi-Fi 检查项。
- 无可用局域网地址：服务可保持本机运行，二维码区显示不可用原因。
- APK 资源缺失：Windows 程序仍可运行同步服务，但禁用二维码并记录构建/资源错误。
- 配对失败：区分配对码错误、限速、服务器离线和协议版本不兼容。
- 数据损坏：沿用 `data.json.bak` 恢复；恢复失败时创建新文件并保留错误日志。
- 同步关闭：任何迟到的请求和 socket 回调都被 generation 丢弃。
- 安装程序未签名：页面与 README 明确 SmartScreen 风险，不指导用户绕过系统安全策略。
- 剪贴板失败：显示“请手动复制”，地址、配对码和校验值始终可选择。

## 构建与发布

构建顺序：

1. 安装并测试 `web/` 依赖。
2. 构建 `web/dist`。
3. 构建 Android APK v0.6.0。
4. 将生产 Web 资源和 APK 放入桌面构建资源。
5. 测试并构建 Windows NSIS 安装程序。
6. 计算 APK 和 EXE 的字节大小、SHA-256。
7. 更新 Pages 和 README 的真实发布事实。
8. 创建同一个 `v0.6.0` GitHub Release 并上传两个资产。
9. 验证公开下载链接后再发布 GitHub Pages。

本地实现阶段可以先使用相对资源和“构建中”状态进行 UI 验收，但提交用于发布的 Pages 不得包含不存在的 Windows 下载地址。

## 验证计划

### 服务端

- `createKgcServer()` 可启动、停止并再次启动，无遗留 socket 或 timer。
- 数据目录、Web 目录和更新目录显式注入且互不混淆。
- 端口回退、非法状态请求、备份恢复和 APK 路径校验。
- 未认证访问受保护接口返回 401。
- 正确配对、错误配对、限速、令牌撤销和 WebSocket 认证。
- mutation ack、重复重放和旧协议兼容。

### Android/Web 应用

- 旧安装无开关键时保持开启，新安装默认关闭。
- 冷启动关闭时 REST、WebSocket、UDP 和局域网更新调用均为零。
- 在线后关闭时 socket、重连和 UDP 全部释放，迟到回调不生效。
- 初始 HTTP 请求期间关闭时，返回快照被忽略，本地持久化仍正常。
- 关闭期间修改数据只更新本地状态和队列。
- 重新开启后先应用服务器快照，再按顺序重放并确认本地队列。
- 配对令牌按服务器保存，不进入同步设置。
- `npm run test`、`npm run build` 和 Android debug 构建通过。

### Windows

- 干净 Windows 环境无需 Node.js 即可安装和启动。
- 安装、升级和卸载不破坏 AppData 数据。
- 主窗口关闭缩到托盘，托盘退出完整释放端口。
- 单实例、开机启动开关、端口冲突和无网络状态正确。
- 二维码 URL 能从同一 Wi-Fi 手机下载正确 APK。
- 防火墙未放行时能给出可执行诊断。
- 安装包文件名、版本、大小和 SHA-256 与页面一致。

### GitHub Pages 与动效

- 1440x900、1024x768、375x812 和 320x700 无横向溢出、重叠或文本截断。
- 快速向下和向上滚动时，prev/current/next 状态唯一且可逆。
- 背景接力无白闪、无硬切、无动画队列堆积。
- Windows 章节、同步开关、任务、计时、翻卡、扫描和复制交互均可用。
- 减弱动效和禁用 JavaScript 时内容完整且下载入口可用。
- 控制台无错误或警告，资源请求和 MIME 正确。
- `node --check docs/app.js` 和 `git diff --check` 通过。

## 验收标准

- Windows 用户通过一个标准安装程序即可运行电脑同步服务，无需命令行部署。
- 手机用户可以从 Windows 控制台扫码获取 APK，并在 Android 系统流程中完成安装。
- 未配对设备不能读取或覆盖学习数据。
- 电脑同步关闭后没有任何电脑 REST、WebSocket、UDP 或局域网更新流量，本地功能不受影响。
- 重新开启同步不会因为迟到回调或旧快照覆盖关闭期间的本地修改。
- 苹果样板滚动时能感知上一章退出、当前章稳定和下一章接入，同时保持自然滚动和移动端性能。
- Pages 和 README 只展示已经生成并验证的真实下载资产、大小和校验值。
- v0.6.0 的 APK、Windows 安装程序、README 和 GitHub Pages 对版本事实的描述一致。
