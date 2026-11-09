# MC 下载面板分析

Chrome / Edge 扩展（Manifest V3）。在 CurseForge 作者后台（`authors.curseforge.com`）右下角显示一个浮动面板，汇总自己的项目下载量、每日增长与更新优先级。

## 安装

1. 打开 `chrome://extensions`（Edge：`edge://extensions`）
2. 打开「开发者模式」
3. 「加载解压缩的扩展」→ 选择本目录

## 使用

1. 打开 <https://authors.curseforge.com/dashboard/projects>
2. 点右下角胶囊展开面板，首次使用时填入自己的 CurseForge 用户名或作者 ID
3. 面板自动同步项目数据；之后每 6 小时或手动点刷新时更新

三个页签：

- **总览**：总下载量、昨日增长、近 7 日、近 30 日、增长最快的项目
- **项目**：每个项目的总下载、昨日 / 7 日 / 30 日增长、文件数、最近更新时间，可按任一指标排序
- **分析**：更新优先级排序、MC 版本下载分布、建议优先补的版本

胶囊与面板可以拖动，位置记在本地。

## 数据来源

项目与下载数据来自 [cfwidget](https://cfwidget.com)（CurseForge 公开数据的第三方镜像），不需要登录凭据，也不读取站点 Cookie。

- 总下载量取 cfwidget 的 `downloads.total`
- 昨日 / 7 日 / 30 日增长由本机每日快照差分计算，快照存在 `chrome.storage.local`
- 首次安装当天没有历史快照，所以「昨日增长」从第二天开始出现
- cfwidget 有缓存，数字与 CurseForge 后台可能有几小时偏差

## 指标口径

- 更新优先级 = 45% 近 7 日相对增速 + 30% 距上次发布天数（90 天封顶）+ 25% 最新 MC 版本缺口
- 没有文件的项目单独归为空项目，不参与优先级排序
- MC 版本下载量按文件标注累加；一个文件标注多个 MC 版本时会在各版本重复计数

## 权限

| 权限 | 用途 |
|---|---|
| `storage` | 保存每日快照与设置 |
| `alarms` | 每 6 小时检查一次，必要时后台补一份当日快照 |
| `https://authors.curseforge.com/*` | 注入面板 |
| `https://api.cfwidget.com/*` | 获取项目下载数据 |

扩展只读公开数据，不修改 CurseForge 上的任何内容，不发遥测。

## 已知限制

- 只做 CurseForge；Modrinth 等其它平台未接入
- 面板只出现在 `authors.curseforge.com`，公开作者页不注入
- 站点改版后如果胶囊不出现，刷新页面；仍不行则是注入点或页面结构变化
