# SaaS migration — Next.js + multi-tenant

## Cель
- Single-binary self-hosted bot → SaaS платформа: продажа доступа подписчикам.
- Юзер заходит, привязывает свой кошелёк/API-key, выбирает venue, настраивает стратегию, платит за uptime — мы крутим бот в облаке.
- Frontend Vite/React → переезд на Next.js (App Router, SSR + ISR, edge auth).
- Backend остаётся на Rust (его core и горячий путь — несравнимо быстрее Node для CLOB latency), но обрастает SaaS-обвязкой.

## Архитектура целевая

```
                         ┌────────────────────────────────┐
                         │  Next.js 15 (Vercel / Fly.io)  │
                         │  ── App Router (RSC)           │
                         │  ── Auth.js v5 (OAuth + magic) │
                         │  ── Stripe billing webhooks    │
                         │  ── i18n (RU/EN)               │
                         │  ── Dashboard, Settings, Wallet│
                         └────────────────┬───────────────┘
                                          │ HTTPS+JWT
                                          ▼
                         ┌────────────────────────────────┐
                         │  Rust Control-Plane API        │
                         │  (axum, multi-tenant)          │
                         │  ── /tenants, /strategies      │
                         │  ── /billing/usage             │
                         │  ── /bot/{id}/start /stop      │
                         │  ── webhook: /stripe           │
                         └─────┬────────────┬─────────────┘
                               │            │
                ┌──────────────┘            └──────────────┐
                ▼                                          ▼
     ┌──────────────────┐                       ┌──────────────────┐
     │ Postgres (RDS)   │                       │ Bot Worker Pool  │
     │ ── tenants       │                       │  Kubernetes Jobs │
     │ ── subscriptions │                       │  один Pod = один │
     │ ── strategies    │                       │  tenant bot      │
     │ ── api_keys      │                       │  → Polymarket /  │
     │   (encrypted)    │                       │    Kalshi / HL   │
     │ ── trades        │                       │                  │
     │ ── audit_log     │                       └──────────────────┘
     └──────────────────┘
```

## Что меняется в монолите

### Backend (Rust)
- `pp-core` AppState → per-tenant: `DashMap<TenantId, AppState>` или процесс на тенант (предпочтительно, изоляция секретов)
- `pp-server` axum → control-plane API (без торговли, только REST)
- Bot процессы запускаются из control-plane через k8s Job CRD (или Nomad / docker swarm)
- redb embedded → Postgres для shared state (tenants, billing, strategies); per-bot state остаётся в redb sidecar volume
- Все секреты (private keys, API keys) → AWS KMS / HashiCorp Vault, шифруются symmetric key per-tenant

### Frontend (миграция Vite → Next.js)
- Перенести компоненты `frontend/src/components/*` → `apps/web/app/(dashboard)/...`
- Шаги переезда:
  1. `npx create-next-app@latest apps/web --typescript --tailwind --app --turbopack`
  2. Скопировать `frontend/src/components`, `widgets`, `shared/ui` в `apps/web/components`
  3. Переписать роутинг wouter → Next.js `app/` router. Каждая `pages/*Page` становится `app/<route>/page.tsx`
  4. `useBot` (WS auto-reconnect) — оставить как client component; добавить SSR-обёртку для initial state
  5. Recharts остаётся (work in Next 15)
  6. Tailwind 4 — поддерживается из коробки в Next 15
  7. Zustand store — client-only, `"use client"` директива
  8. ts-rs bindings → `apps/web/types/` через npm script + post-build copy
- Multi-app workspace: `pnpm-workspace.yaml` или `bun workspaces` с `apps/web`, `packages/ui`, `packages/types`

### Auth + Billing
- **Auth.js v5** (NextAuth successor): GitHub/Google OAuth + magic link email (Resend)
- **Stripe** subscriptions:
  - `Free` — paper trading only, 1 venue
  - `Pro $29/mo` — 1 venue, $1k position cap, 24/7
  - `Pro+ $99/mo` — все venues, $10k position cap, priority support
  - `Enterprise` — кастом, KMS+audit
- Stripe → webhook → control-plane → `subscriptions` table → bot lifecycle
- Usage metering через Stripe meters: trades count, gross volume

### Tenancy isolation
- Каждый user → tenant_id (UUID)
- Bot worker = isolated process с переменной `TENANT_ID`, читает только свой shard БД
- Wallet keys никогда не покидают KMS — bot подписывает через `aws-kms-signer` (alloy supports remote signers)
- Logs aggregated через `tracing-loki` или CloudWatch с `tenant_id` label

### Multi-venue (use existing pp-venue)
- При onboarding юзер выбирает площадки и вводит ключи каждой
- Per-tenant `Vec<Arc<dyn Venue>>` — control-plane инстанциирует bot worker с нужными venue impls

## Этапы (последовательно)

### Этап 1 — Next.js shell (1-2 недели)
- [ ] `apps/web` Next 15 App Router + Tailwind 4 + Auth.js v5 (GitHub OAuth)
- [ ] Базовая landing page + `/dashboard` (read-only) подключается к существующему single-tenant backend как сейчас
- [ ] Сохранить Vite frontend пока живым в parallel `frontend/` для smoke testing
- [ ] Stripe Checkout integration (test mode), feature flag для оплаты

### Этап 2 — Multi-tenant backend (2-3 недели)
- [ ] Создать `crates/pp-control-plane/` (axum API): `/tenants`, `/strategies`, `/keys`
- [ ] Postgres schema через `sqlx` или `sea-orm`:
  - `tenants(id, email, stripe_customer_id, plan, created_at)`
  - `api_keys(tenant_id, venue, encrypted_blob, kms_key_id)`
  - `strategies(tenant_id, runtime_config_json, active)`
  - `audit_log(tenant_id, action, payload, at)`
- [ ] AWS KMS / Vault integration: encrypt-then-store секреты
- [ ] Migration: `polyprofit.db` redb → Postgres (sqlx migrate)

### Этап 3 — Bot orchestration (2-3 недели)
- [ ] Wrap текущий single-bot binary в `pp-worker` crate, accept `TENANT_ID` env
- [ ] k8s manifests: Deployment per tenant (or DaemonSet с pod-per-tenant pattern)
- [ ] Альтернатива: Fly.io Machines (pay-per-second, идеально для on-demand bot lifecycle)
- [ ] Health checks, auto-restart, log shipping → Loki/CloudWatch
- [ ] Control-plane endpoint `POST /bot/start` → spawns worker, returns status

### Этап 4 — Billing + metering (1 неделя)
- [ ] Stripe webhooks: `customer.subscription.created/updated/deleted` → flip tenant.plan
- [ ] Stripe meters: `trades_executed_count` per tenant per billing cycle
- [ ] `/billing/portal` redirects to Stripe customer portal
- [ ] Trial: 7 days free trial с paper trading

### Этап 5 — Production hardening (1-2 недели)
- [ ] Rate limiting: control-plane через `tower-governor`, edge через Vercel WAF
- [ ] Audit log в БД: каждое API действие пользователя
- [ ] 2FA через TOTP (Auth.js plugin)
- [ ] GDPR: delete account flow, data export
- [ ] SOC2-ready logging: structured JSON, retention 90d
- [ ] Sentry/Honeybadger для error tracking (frontend + Rust backend)

## Open questions

1. **Custodial vs non-custodial?** Сейчас юзер даёт private key — мы храним в KMS, подписываем за него. Альтернатива: session-key / agent-key модель (Hyperliquid agent keys, Polymarket smart wallet delegation). Безопаснее для юзера, но не работает на Polymarket-EOA.
2. **Где хостить?** Vercel (frontend) + Fly.io / Railway (backend + bots) самый дешёвый вариант на старте. AWS позже когда нужна compliance.
3. **Pricing model:** flat subscription vs profit-share (10% от PnL)? Profit-share требует доверия и trade reporting; subscription проще.
4. **Регуляторика:** в US Polymarket geoblocked, Kalshi требует SSN. SaaS должен показывать предупреждение и блокировать US IP при подключении к Polymarket.
5. **Open-source vs proprietary:** оставить core open-source (community) и SaaS hosted version closed? Тренд (Cal.com, Plausible).

## Метрики успеха

- **Time-to-first-trade** для нового пользователя ≤ 10 минут (sign-up → wallet → first signal)
- **Bot uptime** ≥ 99.5% per tenant
- **Latency p95** signal-to-CLOB < 500 ms (bot worker должен быть в одном регионе с venue)
- **Churn ≤ 8%/month** на Pro плане

## Файлы, которые надо тронуть

| Файл | Что |
|---|---|
| `frontend/` | Удалить после полного переезда на Next |
| `apps/web/` | NEW — Next.js 15 |
| `packages/ui/` | NEW — общие UI компоненты |
| `packages/types/` | NEW — ts-rs bindings + zod schemas |
| `crates/pp-control-plane/` | NEW — multi-tenant API |
| `crates/pp-worker/` | NEW — single-tenant bot binary |
| `crates/pp-core/src/types.rs` | AppState добавить tenant_id |
| `crates/pp-core/src/db/` | Postgres адаптер (опционально, redb для per-bot)
| `crates/pp-server/` | Удалить или превратить в legacy single-tenant mode |
| `infra/k8s/` | NEW — manifests per environment |
| `infra/terraform/` | NEW — KMS, RDS, ECS/EKS |
| `Dockerfile` | NEW — multi-stage build для worker и control-plane |
| `docker-compose.yml` | NEW — local dev: postgres + control-plane + worker + frontend |

## Стоимость на старте (~10 paying users)

- Vercel Hobby: $0
- Fly.io: 2x shared-cpu-1x = $4/mo + 10x bot machines = $30/mo
- Postgres on Fly.io: $5/mo
- Stripe: 2.9% + $0.30 per tx
- KMS: $1/key/mo × 10 = $10/mo
- Domain: $12/year
- Total: ~$50/mo для до 10 пользователей; profit margin 80% при $29/mo плане
