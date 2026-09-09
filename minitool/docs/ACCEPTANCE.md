# 格记小红书小工具验收记录

日期：2026-09-09。构建目标：离线静态小工具，生产构建不含测试模式。

## 已完成

- `npm test`：20/20 通过，覆盖本地持久化失败回滚、损坏备份保护、任务保存失败、桥接缺失/拒绝、签名愿望二维码离线往返与重放拒绝。
- 原 Web 回归：1284/1284 通过；原 TypeScript 检查通过。
- 小工具 TypeScript 检查通过；官方资源审计通过（15 个文件，0 warnings）。
- 题库精简为 200 题、约 305 KiB；原 Android 题库未修改。
- 11 个宠物资源独立输出；测试模式下已实测购买、装备、喂养、宠物切换、番茄钟奖励、自定义奖励。
- 生产构建已确认关闭 99999 星、5 秒番茄钟和开发者模式入口。

## 尚未能由本地浏览器证明

- 小红书容器内真实桥接、真实相册保存、`postNote` 发布及平台审核结果。
- 真实摄像头权限和容器文件选择器；当前 in-app browser 不支持自动化 file chooser 注入。
- Chrome 61 真机渲染；已加入兼容层与静态审计，但没有把现代浏览器结果冒充旧内核验收。

## 产物

运行 `npm run build`, `npm test`, `npm run audit`, `npm run package` 后，产物位于 `minitool/release/geji-xhs-minitool.zip`，校验文件为 `minitool/release/geji-xhs-minitool.sha256`。
