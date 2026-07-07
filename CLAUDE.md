# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

不准在3000端口启动项目（默认端口 3005）

## 项目愿景

**智能路由中转站** — 前端接收自然语言指令 → Claude Code 作为唯一大脑决策 → 解析 JSON 动作序列 → 调用 Music/TTS/UPnP 等后端服务执行。

核心原则：**Claude Code 是唯一的大脑**。所有业务决策必须由 Claude 生成结构化的 JSON 动作指令，代码层不做任何"如果用户说 X 就执行 Y"的硬编码匹配。

## 核心架构

```
用户 / 前端 (模糊自然语言指令)
    │
    ▼
┌──────────────────────────────────────┐
│  环境上下文收集层 (Context Collector) │  ← 系统状态、设备列表、用户偏好、时间、历史
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│  Claude Code (唯一大脑 / Orchestrator)│  ← LLM 推理 + 决策，输出 JSON 动作序列
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│  动作解析执行层 (Action Executor)     │  ← 解析 JSON → 依次调用具体服务
└──────────────────┬───────────────────┘
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
     Music API   TTS API    UPnP API
```

### 代码到架构层的映射

| 层 | 文件 |
|---|---|
| **Context Collector** | [src/context.ts](src/context.ts) — 加载 user corpus + 组装 prompt；[src/executor.ts](src/executor.ts) — `getContext()` 拉取天气/日历 |
| **Orchestrator** | [src/claude.ts](src/claude.ts) — 调用 Anthropic / OpenAI-compatible API，解析 JSON 输出 |
| **Action Executor** | [src/executor.ts](src/executor.ts) — `executePlay()` 搜索+播放；[src/router.ts](src/router.ts) — API 路由编排 |
| **Service Adapters** | [src/adapters/netease.ts](src/adapters/netease.ts) — 网易云音乐搜索/播放；[src/adapters/weather.ts](src/adapters/weather.ts) — OpenWeather；[src/adapters/feishu.ts](src/adapters/feishu.ts) — 飞书日历；[src/adapters/upnp.ts](src/adapters/upnp.ts) — UPnP 设备控制；[src/tts.ts](src/tts.ts) — Fish Audio TTS |

## 技术栈

- **Runtime**: Node.js + TypeScript，`tsx` 直接执行（无编译步骤）
- **HTTP**: Express 5，`http.createServer` 包装
- **WebSocket**: `ws` 库，path=`/stream`，用于实时推送 play/say/token_usage 事件到前端
- **数据库**: SQLite via `better-sqlite3`（同步 API），文件 `state.db`
- **LLM**: Anthropic Messages API (claude-sonnet-4-20250514) 或 OpenAI-compatible API (DeepSeek)，通过 `https.request` / `fetch`
- **前端**: [frontend/index.html](frontend/index.html) + [frontend/style.css](frontend/style.css) + ES modules in [frontend/js/](frontend/js/)，无框架，由 Express 静态托管；PWA shell 在 [frontend/manifest.json](frontend/manifest.json) 和 [frontend/sw.js](frontend/sw.js)
- **测试**: Vitest，测试文件在 `tests/`，supertest 做 HTTP 集成测试

## 开发命令

```bash
npm run dev          # 启动开发服务器 (tsx + .env)
npm test             # 运行全部测试 (vitest run)
npm run test:watch   # 监视模式
npx vitest run tests/router.test.ts   # 运行单个测试文件
```

## 运行时流程

```
POST /api/chat { text }
  → classifyIntent(): 简单命令直接返回 action，跳过 Claude
  → addMessage(db, user msg)
  → executor.getContext() → 天气 + 日历
  → getMessages(db, 10) → 最近对话历史
  → assemblePrompt(user corpus + weather + calendar + time + history)
  → invokeClaude(prompt) → parseOutput() → { say, play[], reason, segue }
  → addMessage(db, assistant reply)
  → executor.executePlay(play[]) → 搜索网易云 → 返回 PlayItem[]
  → broadcast('play', tracks)  ← WebSocket 推送给前端
  → broadcast('say', text)     ← 触发前端 TTS
  → res.json({ ...result, played })
```

关键点：
- `classifyIntent` 仅匹配精确简单命令（下一首、pause 等），其余全部走 Claude
- Claude 输出要求纯 JSON（prompt 中 `IMPORTANT: Output ONLY valid JSON`），`parseOutput` 用 regex 兜底提取
- 前端 audio 由前端直接播放 URL，后端不流式传输音频

## 数据库 (SQLite)

6 张表，全部在 [src/db.ts](src/db.ts) 中定义：

| 表 | 用途 |
|---|---|
| `messages` | 对话历史 (role, content, created_at) |
| `plays` | 播放记录 (song_id, song_name, artist, played_at) |
| `plan` | 每日歌单计划 (date UNIQUE, plan_json) |
| `prefs` | KV 配置存储 (key PRIMARY KEY, value) |
| `favorites` | 收藏歌曲 (song_id PRIMARY KEY, song_name, artist) |
| `hidden_songs` | 隐藏歌曲 (song_id PRIMARY KEY, song_name, artist) |

## 用户语料系统 (User Corpus)

`user/` 目录下的文件用于个性化 Claude 的 DJ 行为：

| 文件 | 内容 |
|---|---|
| `taste.md` | 音乐品味描述 |
| `routines.md` | 日常作息 |
| `mood-rules.md` | 情绪→音乐映射规则 |
| `playlists.json` | 预设歌单 |

`loadUserCorpus()` 在 [src/context.ts](src/context.ts) 中读取这些文件，拼入发给 Claude 的 prompt。目录路径可通过 `USER_CORPUS_DIR` 环境变量或设置面板配置。

## 配置系统

双层配置：`.env` 文件 + `prefs` 数据库表。DB 值优先于 `.env`。

`POST /api/config` 同时写入 DB 和 `.env` 文件（`syncEnvFile` 函数）。密码类字段含 `*` 的跳过写入（占位符保护）。

API 配置测试 (`POST /api/config/test`)：自动检测 Anthropic vs OpenAI-compatible 端点，分别发测试请求。

## 设计约束

1. **模块严格解耦**: Context Collector、Orchestrator、Action Executor 之间仅通过结构化数据通信，不共享内部状态。
2. **无硬编码意图**: 代码中不允许出现 if/switch 匹配用户意图的逻辑。意图理解是 Claude 的专属职责。（`classifyIntent` 仅处理极简播放控制命令）
3. **Claude 输出即可执行**: 所有 Claude 返回的 JSON 动作必须能被 Action Executor 直接消费，不需要二次 LLM 调用或复杂转换。
4. **可审计追踪**: 每次完整的 输入→Claude→动作 链路都应该记录日志，包含 Claude 的 thought 过程。
5. **幂等性优先**: 每个动作应该是幂等的或至少可安全重试的。
6. **Context 收集先行**: 在调用 Claude 之前，必须收集尽可能多的上下文信息，让 Claude 做充分知情的决策。

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
