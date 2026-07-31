# 考公打卡 App 设计文档

日期：2026-07-30
状态：已确认（用户已批准方案 A、电脑做服务器、浅色清新默认 + 可切深色质感）

## 1. 目标

一个用于考公每日任务打卡的应用：

- 安卓 APK（手机端主力）
- 局域网网页端（电脑浏览器），与手机实时同步
- 电脑作为服务器（数据唯一真相源），电脑开机时两端实时同步；手机离线可正常打卡，回到局域网自动合并

## 2. 技术栈（方案 A）

- **UI**：Vue 3 + Vite + TypeScript，一套代码同时用于 APK 和网页端
- **打包**：Capacitor → 安卓 APK（本地 Android SDK：platforms 34/36，build-tools 34/35/36）
- **服务端**：Node.js（v24）+ Express + ws（WebSocket），静态托管网页端 `web/dist`
- **存储**：服务器端 JSON 文件（原子写入：写临时文件 + rename）。单用户场景足够，零原生依赖
- **动画**：@vueuse/motion（spring 物理曲线，非线性、iOS 风格）+ SVG 描边对勾 + canvas-confetti 粒子庆祝
- **主题**：CSS 变量 + `data-theme` 属性切换，浅色清新（默认）/ 深色质感，切换带过渡动画

## 3. 目录结构

```
F:\KIMI-CODE\kaogong-checkin\
├── docs/superpowers/specs/2026-07-30-kaogong-checkin-design.md
├── server/           # Node 服务端：REST + WebSocket + 静态托管 + 数据文件
│   ├── src/index.js
│   └── data/         # data.json（gitignore）
├── web/              # Vue3 + Vite 前端（APK 与网页端共用）
│   └── src/
│       ├── api/      # REST + WS 客户端、离线队列、状态同步
│       ├── stores/   # Pinia：tasks / checkins / settings / sync
│       ├── views/    # TodayView / HistoryView / TasksView / SettingsView
│       ├── components/
│       └── styles/   # 主题变量
└── android 由 Capacitor 生成在 web/android/
```

## 4. 数据模型（data.json）

```jsonc
{
  "tasks": [
    {
      "id": "uuid",
      "title": "行测刷题 50 道",
      "type": "daily",            // "daily" 每日重复 | "deadline" 截止型
      "endDate": "2026-12-20",    // daily 可设结束日；deadline 必填截止日
      "createdAt": "2026-07-30T10:00:00.000Z",
      "updatedAt": "...",
      "archived": false,
      "order": 0
    }
  ],
  "checkins": [
    {
      "id": "uuid",
      "taskId": "uuid",
      "date": "2026-07-30",       // 该任务"应完成"的日期（结转补卡时记原始日期）
      "createdAt": "...",
      "updatedAt": "...",
      "deleted": false            // 取消打卡 = 软删除，便于同步合并
    }
  ],
  "settings": {
    "planEndDate": "2026-12-20",  // 整个打卡计划的结束日（可空）
    "theme": "light"              // "light" | "dark"
  }
}
```

所有实体带 `updatedAt`，合并策略为逐实体 last-write-wins。

## 5. 每日计划生成逻辑（前端计算，纯函数）

给定日期 D（本地时区 yyyy-MM-dd），"今日计划" = A + B：

- **A. 今日应做**：满足 `createdAt(日期部分) <= D && (endDate 为空 || endDate >= D)` 且未归档的任务
  - daily：每天都出现，需当日有 checkin 才算完成
  - deadline：在完成前每天出现；一旦存在任意 checkin 即视为完成，之后不再出现
- **B. 结转任务**：对每个日期 D' < D（从任务创建日起），任务在 D' 应做但该日无有效 checkin → 结转到 D，标记 `overdueDays = D - D'`（逾期天数），UI 上用橙色"逾期 N 天"角标与今日任务区分，按逾期天数降序排在今日任务之后
- **补卡**：勾选结转任务 → 写入 `checkin{taskId, date: D'}`（记原始日期），之后不再结转
- 计划结束日 `settings.planEndDate` 非空时，超过该日不再生成新任务（结转仍显示）

## 6. 同步协议

- **传输**：HTTP REST（CRUD）+ WebSocket（`/ws`）推送变更
- **连接**：客户端启动 → `GET /api/state` 全量快照 → 建立 WS；之后所有变更走 WS 消息：
  - 客户端→服务器：`{kind:"upsert"|"delete", entity:"task"|"checkin"|"settings", payload}`
  - 服务器：应用（按 `updatedAt` last-write-wins）→ 落盘 → 广播 `{kind, entity, payload}` 给其他客户端
- **离线**：APK 内所有变更先写入本地队列（localStorage）并乐观更新 UI；WS 重连成功后按序重放队列，再拉一次全量快照对齐
- **冲突**：单用户场景，last-write-wins 足够
- **CORS**：服务器开放 `Access-Control-Allow-Origin: *`（APK WebView 源为 `capacitor://localhost`，网页端同源）

## 7. 服务器发现

- 首选：APK 启动时 UDP 监听局域网广播；服务器每秒广播一次 `{name, httpPort}`（`@capacitor-community/udp`，best effort）
- 兜底：设置页手动输入服务器地址（如 `192.168.1.5:8321`），保存记忆；网页端首页醒目展示本机局域网地址 + 二维码（`qrcode` 库生成），手机可对照输入
- 端口：HTTP/WS 固定 `8321`，UDP 广播 `8322`

## 8. 界面与动效

四个页面（底部 Tab Bar，iOS 风格）：

1. **今日**（默认，启动自动定位当天）：
   - 顶部日期 + 本周日期条（可切换查看历史日）+ 总进度环
   - 今日任务列表：圆角卡片、左滑/点击圆形勾选框打卡
   - 结转区块：分隔标题"之前未完成"，卡片带橙色逾期角标
2. **任务管理**：任务列表（类型徽标、结束日/截止日）、新建/编辑弹层（标题、类型、结束日期）、归档
3. **统计**：连续打卡天数、近 30 天完成热力图（GitHub 风格）、总完成数
4. **设置**：计划结束日、主题切换（浅色/深色，带动画过渡）、服务器地址（APK 显示）、本机访问地址 + 二维码（网页端显示）

**动效清单**（全部 spring 物理曲线，非线性）：

- 点击打卡：圆形勾选框弹簧缩放（stiffness 高、damping 中，iOS 手感）→ SVG 对勾描边动画 → canvas-confetti 粒子爆发 → 卡片弹性滑出/变为完成态 → 顶部进度环弹性增长
- 列表项进入：stagger 错落入场（透明度 + 位移 spring）
- 页面切换：淡入 + 轻微位移
- 主题切换：全屏颜色 300ms 过渡
- 按钮/卡片按压：`scale(0.97)` spring 回弹

## 9. 主题

- 浅色清新（默认）：白底 `#FAFAFC`，强调色渐变（青绿 → 蓝），柔和阴影
- 深色质感：`#0E1116` 底，玻璃拟态卡片，强调色同系亮色
- 两套 CSS 变量，`html[data-theme="dark"]` 切换；`color 280ms ease` 过渡

## 10. 错误处理

- 服务器不可达：APK 顶部显示"离线模式，数据将在恢复连接后同步"横幅，功能不受影响
- WS 断开：指数退避重连（1s→2s→…→30s 封顶）
- 数据文件损坏：启动时校验 JSON，失败则从 `data.json.bak`（每次写入前备份）恢复
- 日期边界：所有"今天"计算用设备本地时区

## 11. 构建与运行

- 开发：`server: node src/index.js`；`web: vite dev`（代理 `/api`、`/ws` 到 8321）
- 部署：`vite build` → 服务器静态托管 `web/dist` → 浏览器访问 `http://<电脑IP>:8321`
- APK：`npx cap sync` → `gradlew assembleDebug`（`ANDROID_HOME=C:\Users\wjy\AppData\Local\Android\Sdk`）→ 产出 `app-debug.apk`
- 交付时启动服务器验证：网页端可访问、APK 打包成功

## 12. 范围外（YAGNI）

- 多用户 / 账号体系 / 云同步
- 通知提醒（安卓本地通知留作后续增强）
- 任务子项、标签、优先级
- iOS 版本

---

## 13. 迭代追加（2026-07-30，第二轮）

### 13.1 全天任务完成庆祝

今日页在当次打卡后「今日任务全完成 + 结转清零」时触发全屏庆祝（`CelebrationOverlay`）：
canvas-confetti 多发连射（中心爆发 + 两侧礼花 1.2s）+ 居中 spring 弹性弹出鼓励卡片（随机文案），
点击任意处或 3s 自动关闭。只在"从未完成变为全完成"的当次打卡触发（打卡前该项必未完成，天然保证跃迁）；
打开页面时已是全完成不触发；当天没有任务不触发；补卡清零结转同样触发。

### 13.2 计时器 + 打点器（TimerView，"/timer"）

- 秒表单例 `lib/stopwatch.ts`（模块级 reactive，切页不丢失）；rAF 驱动显示 mm:ss.cs，满 1 小时切 hh:mm:ss
- 开始/暂停/继续/结束；计时中可多次打点，记录分段（splitMs）与累计（elapsedMs）
- 结束时可填备注标签、可选关联任务（下拉，可空），保存为 `timers` 记录同步
- 历史按日期分组展示（标签/总时长/各打点分段 chip），可软删除
- 数据对比：最近 10 次记录横向条形图（纯 CSS），标注均值/最快/最慢

新实体：

```jsonc
{
  "timers": [{
    "id": "uuid", "label": "资料分析 20 题", "taskId": null,
    "date": "2026-07-30", "startedAt": "...", "durationMs": 754000,
    "laps": [{ "elapsedMs": 300000, "splitMs": 300000 }],
    "createdAt": "...", "updatedAt": "...", "deleted": false
  }]
}
```

### 13.3 百化分背诵（DrillView，"/drill"）

- 对照表为前端常量（`lib/drill.ts`，24 项）；判定：解析输入（`1/8` 分数或 `0.125` 小数）
  与 percent/100 比较，误差 ≤0.002 判对
- 两种模式：完整背诵（按表顺序）/ 随机抽取（打乱，默认 10 题，可设数量）
- 卡片大字显示百分数，确认后展开标准答案与对错（spring 动画）；答错插回队列尾部再考
- 全部完成后总结：正确率 + 错题列表
- 每次作答落库 `drills`（含 sessionId 分组同一场）；页面底部按百分数展示历史正确率
  （<60% 红 / <85% 黄 / 否则渐变绿），可一键清空（全部软删除）

```jsonc
{
  "drills": [{
    "id": "uuid", "percent": 12.5, "userAnswer": "1/8", "correct": true,
    "mode": "random", "sessionId": "uuid",
    "createdAt": "...", "updatedAt": "...", "deleted": false
  }]
}
```

### 13.4 导航与协议扩展

- Tab Bar 5 个：今日 / 计时 / 背诵 / 统计 / 设置；任务管理入口改为今日页右上角"管理"按钮（路由 /tasks 不变）
- 统计页追加汇总卡片：计时总时长、背诵总题数
- 服务端 entity 扩展：`task|checkin|timer|drill|settings`；checkins/timers/drills 软删除，tasks 硬删除；
  旧 data.json 无 timers/drills 字段时启动自动补空数组，不破坏现有数据

---

## 14. 迭代追加（2026-07-30，第三轮）

### 14.1 百化分：答题中退出 + 历史场次

- 答题页左上角"✕ 退出"按钮，确认文案"退出后本场进度不保留，已答题目成绩已记录"；
  已答 drill 逐题落库，无需额外处理
- 背诵主页"历史场次"区块：按 sessionId 分组，每场显示时间/模式/题数/正确数/正确率，
  点击展开该场每题明细（百分数、你的答案、标准答案、对错），spring 入场

### 14.2 计时页交互改进

- 控制按钮改为大圆形：主按钮（开始绿/暂停橙/继续绿）88px，打点（蓝）72px，结束（红灰）56px，
  spring 按压回弹，居中排列，手机上好按
- 历史记录每条可点击，弹出详情层：标签、关联任务、日期、起止时间（startedAt + durationMs 推算）、
  总时长、全部打点（序号/分段/累计）

### 14.3 统计页日维度详情（DayDetailView，"/stats/day/:date"）

- 入口：30 天热力图格子点击 + 统计页日期选择器
- 四个区块（空则"无记录"）：
  - 任务打卡：当天完成的打卡（含打卡时间）+ 当天应做未完成（借 plan.ts 对当天计算）
  - 计时记录：标签/总时长/打点数
  - 百化分：按 sessionId 分组的场次（模式/题数/正确率），按 createdAt 的本地日期归属
  - 公式背诵：同上（记住率）
- 顶部日期 + 前后日切换箭头

### 14.4 资料分析公式背诵

- DrillView 内顶部 Segmented Control 切换「百化分 / 公式」两个子模块
  （`components/drill/PercentPanel.vue` 与 `FormulaPanel.vue`，keep-alive 保住本场进度）
- 公式表为前端常量（`lib/formula.ts`，14 项：name/formula/note）
- 交互：卡片显示公式名称 → 点击翻面显示公式 → 自评「记住了 / 没记住」两个大按钮；
  没记住插回队列尾部重考；完整顺序/随机抽取两种模式；结束出本场总结（记住率 + 没记住列表）；
  主页展示每个公式历史掌握度（尝试次数 + 记住率条形，<60% 红 / <85% 黄）
- 新实体，同步协议与软删除策略同 drills：

```jsonc
{
  "formulaDrills": [{
    "id": "uuid", "formulaKey": "base", "known": true,
    "mode": "full", "sessionId": "uuid",
    "createdAt": "...", "updatedAt": "...", "deleted": false
  }]
}
```
