# 本地测试流程

本文档介绍如何在本地环境中运行和测试 Uptimer 项目。

## 目录

1. [环境要求](#环境要求)
2. [安装依赖](#安装依赖)
3. [配置环境变量](#配置环境变量)
4. [一键初始化并启动（推荐）](#一键初始化并启动推荐)
5. [初始化数据库（手动）](#初始化数据库手动)
6. [快速注入测试数据（手动）](#快速注入测试数据手动)
7. [启动开发服务器（手动）](#启动开发服务器手动)
8. [测试 API 接口](#测试-api-接口)
9. [自动化测试（90%场景覆盖）](#自动化测试90场景覆盖)
10. [代码质量检查](#代码质量检查)
11. [常见问题](#常见问题)

---

## 环境要求

| 工具     | 版本要求   | 说明                   |
| -------- | ---------- | ---------------------- |
| Node.js  | >= 22.14.0 | JavaScript 运行时      |
| pnpm     | >= 10.8.1  | 包管理器               |
| Wrangler | 最新版     | Cloudflare Workers CLI |

### 安装 pnpm

```bash
npm install -g pnpm@10.8.1
```

### 安装 Wrangler

```bash
npm install -g wrangler
```

---

## 安装依赖

在项目根目录执行：

```bash
pnpm install
```

这将安装所有工作区（apps/web、apps/worker、packages/\*）的依赖。

---

## 配置环境变量

### Worker 环境变量

1. 复制示例文件：

```bash
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
```

2. 编辑 `apps/worker/.dev.vars`，设置管理员令牌：

```
ADMIN_TOKEN=your-secure-token-here
```

> **注意**：`.dev.vars` 文件已在 `.gitignore` 中，不会被提交到版本控制。

---

## 一键初始化并启动（推荐）

在项目根目录执行：

```bash
pnpm dev
```

该命令会自动完成：

- Worker 本地数据库 migration（`apps/worker`）
- 本地种子数据注入（覆盖常见状态与事件场景）
- 并行启动 Worker 与 Web 开发服务器

默认地址：

- Worker: `http://localhost:8787`
- Web: `http://localhost:5173`

---

## 初始化数据库（手动）

Uptimer 使用 Cloudflare D1（SQLite）数据库。本地开发时，Wrangler 会自动创建本地数据库。

### 创建本地数据库并执行迁移

```bash
cd apps/worker
wrangler d1 migrations apply uptimer --local
```

### 验证数据库

```bash
wrangler d1 execute uptimer --local --command="SELECT name FROM sqlite_master WHERE type='table';"
```

应该看到以下表：

- monitors
- monitor_state
- check_results
- outages
- incidents
- incident_updates
- incident_monitors
- maintenance_windows
- maintenance_window_monitors
- notification_channels
- notification_deliveries
- settings
- locks
- monitor_daily_rollups
- public_snapshots

---

## 快速注入测试数据（手动）

为了覆盖本地联调中最常见的状态组合（`up/down/maintenance/paused/unknown`）与事件场景，Worker 提供了本地种子数据脚本：

```bash
cd apps/worker
pnpm seed:local
```

该脚本会在保留 ID 区间 `900001-900099` 内写入演示数据（不会覆盖你手工创建的普通 ID 数据），包含：

- 6 个 monitors（HTTP/TCP）
- 对应 `monitor_state` 与近 60 条心跳数据
- 进行中 outage + 已恢复 outage
- 未解决/已解决 incidents 及 updates
- active/upcoming maintenance windows
- 30 天 rollup（用于 status page uptime bar 与 analytics）

可用下面命令快速确认：

```bash
wrangler d1 execute uptimer --local --command="SELECT id,name,type,target FROM monitors WHERE id BETWEEN 900001 AND 900099 ORDER BY id;"
```

---

## 启动开发服务器（手动）

需要同时启动前端和后端服务器。建议使用两个终端窗口。

### 终端 1：启动 Worker（后端）

```bash
cd apps/worker
pnpm dev
```

Worker 将在 `http://localhost:8787` 启动。

### 终端 2：启动 Web（前端）

```bash
cd apps/web
pnpm dev
```

前端将在 `http://localhost:5173` 启动，API 请求会自动代理到 Worker。

---

## 测试 API 接口

### 公开 API（无需认证）

#### 获取所有监控状态

```bash
curl http://localhost:8787/api/v1/public/status
```

> **加速机制（Public status snapshot）**：Worker 会把 `/api/v1/public/status` 的结果写入 `public_snapshots` 表。
> 并在后续请求中优先读取快照（最大滞后 60s，通常 <= 30s）。

验证快照是否生成：

```bash
wrangler d1 execute uptimer --local --command="SELECT key, generated_at, updated_at, LENGTH(body_json) AS bytes FROM public_snapshots;"
```

#### 获取单个监控的延迟数据

```bash
curl http://localhost:8787/api/v1/public/monitors/{id}/latency
```

#### 获取单个监控的可用性数据

```bash
curl http://localhost:8787/api/v1/public/monitors/{id}/uptime
```

#### 获取事件列表（未解决置顶）

```bash
curl "http://localhost:8787/api/v1/public/incidents?limit=20"
```

### 管理员 API（需要认证）

所有管理员 API 需要在请求头中携带 `Authorization: Bearer <ADMIN_TOKEN>`。

#### 创建监控

```bash
curl -X POST http://localhost:8787/api/v1/admin/monitors \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secure-token-here" \
  -d '{
    "name": "Example Site",
    "type": "http",
    "target": "https://example.com",
    "interval_sec": 60,
    "timeout_ms": 5000
  }'
```

#### 获取所有监控

```bash
curl http://localhost:8787/api/v1/admin/monitors \
  -H "Authorization: Bearer your-secure-token-here"
```

#### 获取 Settings

```bash
curl http://localhost:8787/api/v1/admin/settings \
  -H "Authorization: Bearer your-secure-token-here"
```

#### 更新 Settings（PATCH）

```bash
curl -X PATCH http://localhost:8787/api/v1/admin/settings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secure-token-here" \
  -d '{
    "site_title": "My Status",
    "site_description": "Public status page",
    "site_timezone": "Asia/Shanghai",
    "retention_check_results_days": 14,
    "state_failures_to_down_from_up": 3,
    "state_successes_to_up_from_down": 2,
    "admin_default_overview_range": "7d",
    "admin_default_monitor_range": "30d",
    "uptime_rating_level": 4
  }'
```

#### 更新监控

```bash
curl -X PATCH http://localhost:8787/api/v1/admin/monitors/{id} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secure-token-here" \
  -d '{
    "name": "Updated Name",
    "interval_sec": 120
  }'
```

#### 删除监控

```bash
curl -X DELETE http://localhost:8787/api/v1/admin/monitors/{id} \
  -H "Authorization: Bearer your-secure-token-here"
```

### 通知（Webhook）

#### 创建通知渠道（自定义模板 + 魔法变量）

下面示例会：

- 使用 `payload_type: json`
- 用 `message_template` 生成可复用的 `{{message}}`
- 用 `payload_template` 自定义最终发送给 webhook 的 JSON 结构

```bash
curl -X POST http://localhost:8787/api/v1/admin/notification-channels \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secure-token-here" \
  -d '{
    "name": "My Webhook",
    "type": "webhook",
    "config_json": {
      "url": "https://example.com/webhook",
      "method": "POST",
      "timeout_ms": 5000,
      "payload_type": "json",
      "message_template": "[{{event}}] {{monitor.name}} => {{state.status}}\\n$MSG",
      "payload_template": {
        "text": "{{message}}",
        "event": "{{event}}",
        "event_id": "{{event_id}}",
        "monitor": {
          "id": "{{monitor.id}}",
          "name": "{{monitor.name}}",
          "target": "{{monitor.target}}"
        }
      },
      "enabled_events": ["monitor.down", "monitor.up"]
    }
  }'
```

#### 发送 test webhook（会走模板渲染；event 固定为 test.ping）

```bash
curl -X POST http://localhost:8787/api/v1/admin/notification-channels/{id}/test \
  -H "Authorization: Bearer your-secure-token-here"
```

#### payload_type = param（GET/POST 都可；会把 payload_template 展平成 query params）

```bash
curl -X POST http://localhost:8787/api/v1/admin/notification-channels \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secure-token-here" \
  -d '{
    "name": "QueryParam Webhook",
    "type": "webhook",
    "config_json": {
      "url": "https://example.com/webhook",
      "method": "GET",
      "payload_type": "param",
      "payload_template": {
        "event": "{{event}}",
        "monitor": "{{monitor.name}}",
        "msg": "{{message}}"
      }
    }
  }'
```

#### payload_type = x-www-form-urlencoded

```bash
curl -X POST http://localhost:8787/api/v1/admin/notification-channels \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secure-token-here" \
  -d '{
    "name": "Form Webhook",
    "type": "webhook",
    "config_json": {
      "url": "https://example.com/webhook",
      "method": "POST",
      "payload_type": "x-www-form-urlencoded",
      "payload_template": {
        "event": "{{event}}",
        "msg": "{{message}}"
      }
    }
  }'
```

> 魔法变量规则（简版）：
>
> - 支持 `{{path.to.field}}` 和数组索引 `{{arr[0].x}}`
> - 兼容 `$MSG`（会替换为渲染后的 message）
> - `{{message}}` 是渲染后的最终消息；`{{default_message}}` 是系统默认消息

### 测试定时任务

Wrangler 支持手动触发 cron 任务：

```bash
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
```

### Scheduler CPU 压测

对 `runScheduledTick` 做本地 synthetic benchmark：

```bash
pnpm --filter @uptimer/worker bench:scheduler
```

默认会把当前工作树与 `HEAD` 对比，适合做未提交调优的前后复测。

如果要和特定基线比（例如 `origin/master` 或某个 commit），可覆盖基线 ref：

```bash
SCHEDULER_BENCH_BASE_REF=origin/master pnpm --filter @uptimer/worker bench:scheduler
SCHEDULER_BENCH_BASE_REF=ee9207b pnpm --filter @uptimer/worker bench:scheduler
```

可选参数：

```bash
SCHEDULER_BENCH_RUNS=20 SCHEDULER_BENCH_WARMUPS=5 pnpm --filter @uptimer/worker bench:scheduler
SCHEDULER_BENCH_WRITE_JSON=./scheduler-bench.json pnpm --filter @uptimer/worker bench:scheduler
```

说明：

- 基准只测 scheduler 自身的调度、状态计算和 D1 编排开销。
- HTTP/TCP probe 会被 mock 掉，避免真实网络波动污染结果。
- 输出里的 `DB.batch()` 次数可直接反映批量写入是否生效。

---

## Phase 8/9: 事件与维护窗口验证步骤（最小示例）

### 1) 创建一个事件（incident.created）

```bash
curl -X POST http://localhost:8787/api/v1/admin/incidents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secure-token-here" \
  -d '{
    "title": "API outage",
    "impact": "major",
    "status": "investigating",
    "message": "We are investigating.",
    "monitor_ids": [1]
  }'
```

### 2) 追加事件更新（incident.updated）

```bash
curl -X POST http://localhost:8787/api/v1/admin/incidents/1/updates \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secure-token-here" \
  -d '{
    "status": "monitoring",
    "message": "Mitigation applied, monitoring."
  }'
```

### 3) 解决事件（incident.resolved）

```bash
curl -X PATCH http://localhost:8787/api/v1/admin/incidents/1/resolve \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secure-token-here" \
  -d '{ "message": "Resolved." }'
```

### 3.1) 删除事件（admin delete）

```bash
curl -X DELETE http://localhost:8787/api/v1/admin/incidents/1 \
  -H "Authorization: Bearer your-secure-token-here"
```

### 4) 创建维护窗口（告警抑制）

```bash
# starts_at/ends_at 为 unix seconds（整数）
curl -X POST http://localhost:8787/api/v1/admin/maintenance-windows \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secure-token-here" \
  -d '{
    "title": "DB maintenance",
    "message": "Planned maintenance.",
    "starts_at": 1700000000,
    "ends_at": 1700003600,
    "monitor_ids": [1]
  }'
```

### 4.1) 删除维护窗口

```bash
curl -X DELETE http://localhost:8787/api/v1/admin/maintenance-windows/1 \
  -H "Authorization: Bearer your-secure-token-here"
```

---

## Phase 10: Analytics & 报表（最小示例）

> 说明：7d/30d/90d 的 analytics 依赖 `monitor_daily_rollups`（日级 rollup 表）。
> 本地可通过触发 daily cron 来生成“昨日”的 rollup 数据。

### 0) 应用最新 migrations（新增 rollup 表）

```bash
cd apps/worker
wrangler d1 migrations apply uptimer --local
```

### 1) 触发 daily rollup（生成昨日数据）

```bash
curl "http://localhost:8787/__scheduled?cron=0+0+*+*+*"
```

### 2) Admin: 全局概览（24h/7d）

```bash
curl "http://localhost:8787/api/v1/admin/analytics/overview?range=24h" \
  -H "Authorization: Bearer your-secure-token-here"
```

### 3) Admin: 某个 monitor 的 analytics（24h/7d/30d/90d）

```bash
curl "http://localhost:8787/api/v1/admin/analytics/monitors/1?range=24h" \
  -H "Authorization: Bearer your-secure-token-here"
```

### 4) Admin: outage 列表（支持 limit/cursor）

```bash
curl "http://localhost:8787/api/v1/admin/analytics/monitors/1/outages?range=7d&limit=50" \
  -H "Authorization: Bearer your-secure-token-here"
```

### 4.1) Admin: CSV 导出（可选）

```bash
# outages
curl -L "http://localhost:8787/api/v1/admin/exports/monitors/1/outages.csv?range=30d" \
  -H "Authorization: Bearer your-secure-token-here"

# check_results（受 retention 限制，默认仅支持 24h/7d）
curl -L "http://localhost:8787/api/v1/admin/exports/monitors/1/check-results.csv?range=24h" \
  -H "Authorization: Bearer your-secure-token-here"

# incidents
curl -L "http://localhost:8787/api/v1/admin/exports/incidents.csv?range=90d" \
  -H "Authorization: Bearer your-secure-token-here"
```

### 5) Public: 30d/90d uptime 概览（用于状态页加速）

```bash
curl "http://localhost:8787/api/v1/public/analytics/uptime?range=30d"
```

## 自动化测试（90%场景覆盖）

Worker 侧新增了高价值纯逻辑模块测试（状态机、目标校验、uptime 计算、延迟直方图、通知模板），并设置了覆盖率阈值（line/function/statement >= 90%，branch >= 85%）。

在仓库根目录运行：

```bash
pnpm test
```

仅运行 Worker 覆盖率测试：

```bash
pnpm --filter @uptimer/worker test
```

测试文件位于：

- `apps/worker/test/monitor-state-machine.test.ts`
- `apps/worker/test/monitor-targets.test.ts`
- `apps/worker/test/analytics-uptime.test.ts`
- `apps/worker/test/analytics-latency.test.ts`
- `apps/worker/test/notify-template.test.ts`

## 代码质量检查

### 类型检查

检查所有包的 TypeScript 类型：

```bash
pnpm typecheck
```

### 代码风格检查

运行 ESLint：

```bash
pnpm lint
```

### 代码格式化

检查格式：

```bash
pnpm format:check
```

自动格式化：

```bash
pnpm format
```

---

### Public Status (60-day uptime bars)

The public status page now uses the daily rollup table (`monitor_daily_rollups`) to render a 60-day uptime bar per monitor.

To generate rollup data locally (yesterday's rollup):

```bash
curl "http://localhost:8787/__scheduled?cron=0+0+*+*+*"
```

The UI will show up to 60 bars when data exists. If there is no rollup data yet, uptime fields may be empty.

## 常见问题

### Q: Worker 启动失败，提示数据库不存在

**A**: 确保已执行数据库迁移：

```bash
cd apps/worker
wrangler d1 migrations apply uptimer --local
```

### Q: 前端无法连接后端 API

**A**: 检查以下几点：

1. Worker 是否在 `localhost:8787` 运行
2. Vite 配置中的代理设置是否正确（见 `apps/web/vite.config.ts`）

### Q: 认证失败 (401 Unauthorized)

**A**: 确保：

1. `.dev.vars` 文件存在且包含 `ADMIN_TOKEN`
2. 请求头中的 Token 与 `.dev.vars` 中的一致

### Q: 如何清空本地数据库

**A**: 删除本地数据库文件后重新执行迁移：

```bash
cd apps/worker
rm -rf .wrangler/state
wrangler d1 migrations apply uptimer --local
```

---

## 项目结构参考

```
Uptimer/
├── apps/
│   ├── web/          # React 前端 (localhost:5173)
│   └── worker/       # Cloudflare Worker 后端 (localhost:8787)
├── packages/
│   ├── db/           # 数据库 Schema 和客户端
│   └── shared/       # 共享工具
└── pnpm-workspace.yaml
```
