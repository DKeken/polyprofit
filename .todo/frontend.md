# frontend — refactor

## Многоплатформенность
- [ ] `shared/api/index.ts` — добавить `/api/venues` endpoint, ребрендинг "polymarket" → generic
- [ ] `shared/store/useAppStore.ts` — selector активной площадки
- [ ] `pages/WalletPage` — multi-venue balance list
- [ ] `pages/SettingsPage` — venue config (host/key per venue)
- [ ] `widgets/WhaleTracker/types.ts` — VenueId enum

## Components
- [ ] `Dashboard.tsx` — статус подключения per-venue (chip per venue)
- [ ] `Markets.tsx` — фильтр по venue
- [ ] `EquityCurve.tsx` — split per-venue P&L

## Branding
- [ ] index.html title — "PolyProfit" → "Trading Bot Dashboard"
- [ ] favicon, hero — общий
- [ ] README в frontend/

## i18n
- [ ] `shared/lib/i18n.ts` — добавить ключи для venue names

## Dependencies
- [ ] uplift Vite 8 → latest if needed
- [ ] Tailwind 4 уже на 4.2.2 — ок

## Tests
- [ ] bun:test tests на venue selector
- [ ] api.test.ts — расширить
