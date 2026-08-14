# Android NSD 搜索重启设计

## 背景

`v0.13.1` 最终 APK 在 Xiaomi M2007J1SC / Android 13 上首次搜索可以发现另一台设备，但停止搜索后立即重开时，偶尔会在 30 秒内保持空列表。此时搜索开关已开启、界面无错误，Xiaomi M2006J10C / Android 12 的托管卡片和监听端口仍在线。

根因是 `NsdManager.stopServiceDiscovery()` 异步完成，旧实现发出停止请求后立即清空 listener 并允许下一次 `discoverServices()`。Android 13 可能接受新的调用，却不为这个重叠会话重新投递已经存在的服务。

## 目标

- 搜索关闭后停止系统 NSD 浏览和组播锁占用。
- 连续关闭、重开时，新会话必须等旧会话停止完成后再启动。
- 页面暂停、恢复与用户开关共用同一停止状态，不制造并行会话。
- 保持现有设备协议、配对码、传输确认和业务数据路径不变。
- 不以重启应用或手机作为恢复手段。

## 方案选择

采用“原生停止确认 + 待启动队列”。不采用常驻搜索，因为关闭开关应真实停止附近设备发现；不采用进程重启，因为侵入性高且不能消除竞态。

## 状态与流程

原生插件增加以下状态：

- `discoveryStopping`：旧 listener 已收到停止请求，等待系统终态。
- `discoveryStopCallbacks`：停止完成后顺序执行的动作，包括启动最新搜索和解析 `stopDiscovery` 调用。
- `discoveryStopTimeout`：OEM 未回调时的 2 秒有限兜底。
- `discoveryRequestGeneration`：只允许最新启动意图创建新会话，过期意图以无错误方式结束。

启动流程：

1. 校验设备标识并生成新的启动意图 generation。
2. 请求停止当前会话；若已经停止则直接进入下一步。
3. 等待 `onDiscoveryStopped`、`onStopDiscoveryFailed` 或 2 秒兜底完成统一清理。
4. 仅当启动意图仍是最新时创建新 listener、获取组播锁并调用 `discoverServices()`。

停止流程：

1. 立即把业务态设为未搜索，递增活动 generation，清空解析队列和已发现服务。
2. 对同一个 listener 只调用一次 `stopServiceDiscovery()`。
3. 系统终态到达后清空 listener、释放空闲组播锁并执行等待动作。
4. 多次停止请求合并到同一终态，不会重复调用系统接口。

## 错误处理

- `onStartDiscoveryFailed` 继续通知前端现有 `DISCOVERY_START_FAILED`，并清理失败会话。
- `onStopDiscoveryFailed` 记录 `DISCOVERY_STOP_FAILED`，但仍完成本地终态，防止界面永久卡在切换中。
- 2 秒兜底只用于系统没有任何停止回调的 OEM；generation 过滤保证迟到回调不能清除新会话。
- 页面暂停取消尚未开始的旧启动意图，但保留用户的搜索偏好，页面恢复后由现有前端生命周期重新发起。

## 验证

- 静态回归覆盖停止状态、回调排队、超时兜底和 generation 隔离。
- Web、Server、Desktop、发布脚本、TypeScript、Vite 与 Android 构建全部重跑。
- 两台现有真机使用 `adb install -r` 覆盖安装，不清除数据、不卸载、不重启。
- Android 13 连续执行至少五轮“关闭搜索、开启搜索、发现 Android 12 `v0.13.1`、关闭搜索”，每轮最长等待 30 秒。
- 测试结束恢复 Android 12 `true / true`、Android 13 `false / false` 的原开关状态，并核查运行错误和业务数据摘要。
