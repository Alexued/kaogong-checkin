# 格记 · 小红书小工具

独立的离线小红书小工具目标，保留经典青绿色界面与学习/番茄钟/宠物/奖励/离线签名愿望能力。不会修改现有 Android、Windows 或“打卡助手”“考公打卡”产品。

## 构建与验收

```powershell
npm install
npm run build
npm test
npm run audit
npm run package
```

发布 ZIP：`minitool/release/geji-xhs-minitool.zip`。完整实测边界见 `minitool/docs/ACCEPTANCE.md`。

生产构建默认关闭开发者测试模式；测试星星不会写入生产配置。

当前阶段：迁移设计与适配准备，尚无可上传产物，尚未完成平台验收。

本目录用于新建「格记」小工具，不更新现有「打卡助手」「考公打卡」，不影响 Android / Windows 产品。

迁移设计见 ../docs/superpowers/specs/2026-09-08-xhs-minitool-migration-design.md。

## 官方规范

- 开发文档：https://fe-video-qc.xhscdn.com/fe-platform-file/104101b8324ihuc967a06277180ac7t8006ptl0fm199r4.html
- Skill：https://fe-static.xhscdn.com/mini-tool/20260831163932/minitool-zip-builder-1.6.0.skill
- Skill 版本：1.6.0
- 下载日期：2026-09-08
- 下载文件 SHA-256：29C04115FD89D7EAB7B81775F4287AE20C569AD3794D25D8404DC0EC3EC3B65E
- 工作区安装位置：../.codex/minitool-zip-builder/

后续产物仅包含离线静态资源；不得将个人存档、签名私钥、手机截图或平台登录信息纳入本目录的发布包。
