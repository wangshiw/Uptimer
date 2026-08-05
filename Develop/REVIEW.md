# REVIEW.md — Gap Analysis & Roadmap

> **Status**: Snapshot from 2026-02-04. Items marked with [x] are implemented.

## Baseline

The following are implemented and deployed:

- Worker: Hono + Zod API (`/api/v1/public/*`, `/api/v1/admin/*`), scheduled monitor engine, retention, daily rollups
- Storage: D1 schema + migrations (monitors/state/results/outages/incidents/maintenance/notifications/settings/snapshots)
- Public: status snapshot, status page payload (monitors + 60d uptime bars + incidents + maintenance), latency/uptime/outages endpoints
- Admin: monitor CRUD + test, notification channel CRUD + test, incidents CRUD + updates + resolve, maintenance windows CRUD, analytics + CSV exports, settings
- CI/CD: GitHub Actions (lint + typecheck + test + auto-deploy)

## Remaining Gaps

- [x] ~~Public status page incident history view~~ (partially — resolved incidents visible)
- [ ] Public status page heartbeat bar (last N checks) per monitor
- [ ] Admin monitor list: show runtime state (UP/DOWN, last check, last error/latency)
- [ ] Admin: pause/resume monitors from UI
- [ ] Monitor creation UI: expose full HTTP config (headers, body, assertions)
- [ ] Surface test results in UI (monitor test + webhook test)
- [ ] CSV export buttons in admin UI
- [ ] Notification retry/backoff + delivery log UI
- [ ] Comprehensive unit tests for core logic (state machine, uptime math, target validation, templates)
