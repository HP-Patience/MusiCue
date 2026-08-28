# Claudio FM

<p align="right"><a href="./README.md">English</a></p>

<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="Claudio FM：通过自然语言理解听歌意图并自动找歌播放的个人智能电台">
</p>

<p align="center">
  <strong>说出此刻的感觉，让合适的音乐就位。</strong><br>
  LLM 还能结合情绪、时间、天气和个人听歌上下文组织队列，让音乐沿着渐进的情绪轨迹自然展开。
</p>

<p align="center">
  <a href="https://github.com/HP-Patience/Claudio/stargazers"><img src="https://img.shields.io/github/stars/HP-Patience/Claudio?style=flat-square&label=stars" alt="GitHub stars"></a>
  <a href="https://github.com/HP-Patience/Claudio/network/members"><img src="https://img.shields.io/github/forks/HP-Patience/Claudio?style=flat-square&label=forks" alt="GitHub forks"></a>
  <a href="https://github.com/HP-Patience/Claudio"><img src="https://img.shields.io/github/languages/top/HP-Patience/Claudio?style=flat-square" alt="主要编程语言"></a>
  <a href="https://github.com/HP-Patience/Claudio/commits/master"><img src="https://img.shields.io/github/last-commit/HP-Patience/Claudio?style=flat-square" alt="最近提交"></a>
  <a href="https://github.com/HP-Patience/Claudio/issues"><img src="https://img.shields.io/github/issues/HP-Patience/Claudio?style=flat-square" alt="开放问题"></a>
</p>


## 从一句话到开始播放

你可以点一首明确的歌，也可以描述一个场景，或者只说出现在的情绪。Claudio 会把口语化请求转换成音乐搜索词，找到匹配歌曲，以私人 DJ 的方式回应，并在同一个界面中开始播放。

<p align="center">
  <img src="./assets/readme/dj-request-demo.gif" width="620" alt="在 Claudio 中输入口语化听歌请求，DJ 自动组织队列并开始播放">
</p>

## 播放与记忆

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="./assets/readme/player-light.png" width="100%" alt="Claudio FM 浅色播放界面，展示歌词、播放控制和聊天记录">
      <strong>浅色播放器</strong><br>
      在同一界面查看歌词、控制播放并继续与 DJ 对话。
    </td>
    <td width="50%" valign="top">
      <img src="./assets/readme/player-dark.png" width="100%" alt="Claudio FM 深色播放界面，展示歌词、播放控制和聊天记录">
      <strong>深色播放器</strong><br>
      使用深色听歌模式完成同一套本地播放流程。
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="./assets/readme/queue-view.png" width="100%" alt="Claudio FM 播放队列页面，展示待播歌曲和播放控制">
      <strong>播放队列</strong><br>
      查看待播歌曲，立即播放其中一首，或将歌曲移出队列。
    </td>
    <td width="50%" valign="top">
      <img src="./assets/readme/favorites-view.png" width="100%" alt="Claudio FM 收藏页面，展示已收藏歌曲和歌手">
      <strong>收藏</strong><br>
      保存喜欢的歌曲，需要时快速重新播放。
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="./assets/readme/playlists-view.png" width="100%" alt="Claudio FM 歌单库，展示个人歌单和新建歌单入口">
      <strong>歌单库</strong><br>
      浏览个人歌单，并在同一界面创建新的歌曲集合。
    </td>
    <td width="50%" valign="top">
      <img src="./assets/readme/playlist-detail.png" width="100%" alt="Claudio FM 歌单详情页面，展示封面、歌曲列表和播放控制">
      <strong>歌单详情</strong><br>
      打开一个歌单，查看歌曲，并播放整张歌单或其中一首。
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="./assets/readme/stats-report.png" width="100%" alt="Claudio FM 音乐统计页面，展示 LLM 生成的周期听歌报告">
      <strong>听歌报告</strong><br>
      查看周期内的听歌规律，并根据本地播放历史生成 LLM 报告。
    </td>
    <td width="50%" valign="top">
      <img src="./assets/readme/history-view.png" width="100%" alt="Claudio FM 播放历史页面，展示最近播放的歌曲">
      <strong>历史</strong><br>
      回看近期歌曲，以及形成当前听歌上下文的播放轨迹。
    </td>
  </tr>
</table>

## 开发进展

- [x] **口语化找歌播放** — 把自然语言请求转换成搜索词，查找匹配歌曲、组织队列并开始播放。
- [x] **场景感知选歌** — 在选歌前把时间、天气、日历、作息和个人音乐品味加入 LLM 上下文。
- [x] **情绪渐进播放** — 理解情绪类请求，让队列沿着渐进的情绪轨迹变化，避免突然跳到完全相反的氛围。
- [x] **周期听歌统计** — 按周、月、季度或年统计播放次数、常听歌手、常听歌曲、听歌时段和新发现。
- [x] **LLM 听歌报告** — 将指定周期的统计数据整理成关于听歌习惯、品味变化和推荐方向的简短报告。
- [ ] **持久化品味记忆** — 从每次生成的报告中提取稳定的音乐品味信号，保存为听歌记忆，并注入后续 LLM 提示词，让推荐随着使用持续改进。

## 工作方式



<p align="center">
  <img src="./assets/readme/workflow.svg" width="100%" alt="MusiCue 工作流：从口语化意图和情境理解，到找歌播放与听歌品味报告">
</p>

1. **理解请求**：不要求用户输入准确歌名，LLM 会把口语化意图转换成结构化动作和音乐搜索词。
2. **收集上下文**：读取 `user/`，并加入天气、日历、时间、近期对话和情绪引导。
3. **查找并播放**：通过网易云音乐查找歌曲，再把队列、播放状态和可选 TTS 更新推送到界面。
4. **理解听歌历史**：聚合选定周期的播放记录，让 LLM 解释听歌习惯和品味；把报告沉淀为长期提示词记忆是下一步计划。

服务端把整个过程保持在一条可审计链路中。`next`、`pause`、`resume` 等简单播放控制可以在本地直接处理；开放式请求则发送到配置好的 OpenAI-compatible LLM 接口。

## 快速开始

### 1. 启动网易云音乐 API

Claudio 需要单独运行 [NeteaseCloudMusicApiEnhanced](https://github.com/547174207/NeteaseCloudMusicApiEnhanced)：

```bash
cd api-enhanced
npm install
PORT=3001 node app.js
```

### 2. 启动 Claudio

在仓库根目录执行：

```bash
npm install
npm run dev
```

打开 [http://localhost:3005](http://localhost:3005)。Windows 用户也可以运行 `start-claudio.bat`，由脚本等待两个服务准备完成。

### 3. 配置第一次使用

1. 打开 **Settings**。
2. 输入 OpenAI-compatible LLM 接口的 API Key。
3. 按需设置 Base URL 和模型。
4. 点击 **Test Connection**，然后点击 **Save**。
5. 用一句自然语言告诉 DJ 想听什么，例如：`下雨了，来点适合安静写东西的歌`。

## 功能

- 不需要准确歌名，直接使用口语化方式提出听歌请求。
- 自动把意图转换成音乐搜索词并开始播放。
- 为情绪请求组织渐进式播放轨迹。
- 通过 Fish Audio TTS 生成 DJ 语音播报。
- 支持 Normal、SMART 和网易云私人 FM 播放模式。
- 使用本地用户语料保存品味、作息、情绪规则和歌单。
- 使用天气和飞书日历提供场景上下文。
- 管理队列、收藏、隐藏歌曲、历史和歌单。
- 生成周、月、季度、年度听歌统计与 LLM 报告。
- 可选控制兼容的 UPnP 音箱和设备。
- 提供 PWA 外壳，并支持 Windows Electron 桌面打包。

## 用户语料

`user/` 中的文件会影响 DJ 的选歌，不需要修改应用代码：

| 文件 | 用途 |
| --- | --- |
| `taste.md` | 艺术家、流派、偏好和不喜欢的内容 |
| `routines.md` | 日常作息和听歌场景 |
| `mood-rules.md` | 将情绪或场景关联到音乐的规则 |
| `playlists.json` | 个人歌单数据 |

设置 `USER_CORPUS_DIR` 可以使用其他语料目录，也可以通过设置面板配置。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 运行时 | Node.js + TypeScript，使用 `tsx` |
| 服务端 | Express 5 + 原生 HTTP Server |
| 实时通信 | WebSocket (`ws`)，路径为 `/stream` |
| 状态存储 | SQLite，通过 `better-sqlite3` 访问 |
| LLM | OpenAI-compatible API |
| 前端 | Vanilla JavaScript、HTML、CSS 和 PWA API |
| 测试 | Vitest + supertest |

## 命令

```bash
npm run dev          # 在 3005 端口启动服务
npm test             # 运行完整测试套件
npm run test:watch   # 监视测试
npm run build        # 构建服务端和 Electron 进程
npm run dev:desktop  # 构建并启动 Electron 应用
npm run dist:win     # 构建 Windows 安装程序
```

## 配置

配置由 `.env` 文件和 SQLite 的 `prefs` 表共同提供，数据库中的值优先。可以通过设置面板写入主要运行参数，也可以直接调用 `POST /api/config` 和 `POST /api/config/test`。

常用集成服务：

- LLM：OpenAI-compatible 接口。
- 音乐：本地网易云音乐 API，默认地址为 `http://localhost:3001`。
- 天气：配置天气服务的 API Key。
- 语音：Fish Audio API Key。
- 日历：飞书 App ID 和 App Secret。
- 设备：UPnP 设备 JSON 列表。

## 文档

- [用户手册](docs/user-manual.md)：安装、界面、播放模式、指令和集成服务。
- [开发参考](CLAUDE.md)：架构、数据流、约束和开发说明。
- [English README](README.md)：英文项目首页。

## 许可证

许可证和分发条款以仓库当前内容为准。
