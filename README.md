<div align="center">
  <img src="https://raw.githubusercontent.com/mks155/DouyinLiveOptimizer/refs/heads/main/docs/icon.svg" alt="抖音直播优化器" width="76" height="76">
  <h1>抖音直播优化器 | DouyinLiveOptimizer</h1>
  <p>进直播间自动优化清晰度、弹幕、静音等，进房即生效，无需每次手动点</p>
  <p><sub>Auto-optimize Douyin live rooms (quality, danmaku, mute) so the right setup is ready the moment the room opens.</sub></p>
  <p>
    <a href="https://scriptcat.org/"><img src="https://img.shields.io/badge/ScriptCat-2f6fed?label=%E9%A6%96%E9%80%89" alt="脚本猫 ScriptCat（首选）"></a>
    <a href="https://www.tampermonkey.net/"><img src="https://img.shields.io/badge/Tampermonkey-42a5f5" alt="Tampermonkey"></a>
    <a href="https://violentmonkey.github.io/"><img src="https://img.shields.io/badge/Violentmonkey-185ABD" alt="Violentmonkey"></a>
  </p>
  <p>
    <a href="https://github.com/mks155/DouyinLiveOptimizer"><img src="https://img.shields.io/github/stars/mks155/DouyinLiveOptimizer?style=social" alt="GitHub Stars"></a>
    <a href="https://github.com/mks155/DouyinLiveOptimizer/blob/main/LICENSE"><img src="https://img.shields.io/github/license/mks155/DouyinLiveOptimizer" alt="Apache-2.0 License"></a>
  </p>
</div>

---

## 链接

- [作者主页](https://mks155.github.io) — 查看作者其他脚本
- [GitHub 仓库](https://github.com/mks155/DouyinLiveOptimizer) — 欢迎 [Star](https://github.com/mks155/DouyinLiveOptimizer)，反馈请提 [Issue](https://github.com/mks155/DouyinLiveOptimizer/issues)
- **[ScriptCat 安装页](https://scriptcat.org/)** — 首选推荐
- [Greasy Fork 安装页](https://greasyfork.org/)
- ~~[OpenUserJS 安装页](https://openuserjs.org/)~~

## 功能清单

- **首页默认静音**：静音首页自动播放的直播卡片
- **自动最高画质**：进房自动切到当前可用的最高画质
- **画面弹幕悬停 +1**：鼠标移到视频画面上飘过的弹幕，旁边弹出 +1 按钮，点一下发同款
- **历史弹幕功能**：弹幕输入框按 ↑ / ↓ 快速找回刚才发过的内容
- **深浅模式**：直接改官方那套配置（跟随系统 / 浅色 / 深色），官方界面里也同步显示
- **进房间停掉首页大直播间**：点进直播间时，把首页左上角那个大直播间的流停掉（不然它还在后台播）
- **清理房间 URL 参数**：进房间后地址栏只留 `https://live.douyin.com/<房间号>`，`?` 后面那一长串去掉

## 安装

1. 装一个脚本管理器，**首选 [Tampermonkey](https://www.tampermonkey.net/)**，也兼容 [脚本猫 ScriptCat](https://scriptcat.org/) 和 [Violentmonkey](https://violentmonkey.github.io/)
2. 从脚本猫安装页一键装，或手动导入本仓库的 `DouyinLiveOptimizer.user.js`
3. 打开任意 `live.douyin.com` 页面，进房后自动生效

## 怎么设置

直播间礼物栏最右侧的 **设置** 按钮（图标 + 文字，排在官方动态按钮之后）：

| 选项 | 说明 |
|------|------|
| 配色 | 面板右上角的图标按钮切换：跟随系统 / 浅色（白天）/ 深色（夜晚） |

改完点 **保存并应用** 即可。

## License

[Apache-2.0](https://raw.githubusercontent.com/mks155/DouyinLiveOptimizer/refs/heads/main/LICENSE) © 2026 [mks155](https://mks155.github.io)