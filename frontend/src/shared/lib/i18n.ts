import type { Language } from "../store/useAppStore";

type Translations = Record<string, string>;

const en: Translations = {
  // Navigation & Headers
  dashboard: "Dashboard",
  markets: "Markets",
  whales: "Whales",
  settings: "Settings",
  
  // Periods
  period_1H: "1H",
  period_24H: "24H",
  period_7D: "7D",
  period_30D: "30D",
  period_ALL: "All Time",
  
  // Dashboard & Metrics
  totalPnl: "Total PnL",
  winRate: "Win Rate",
  totalTrades: "Total Trades",
  equityCurve: "Equity Curve",
  recentTrades: "Recent Trades",
  openPositions: "Open Positions",
  uptime: "Uptime",
  noTrades: "No trades yet",
  
  // Wallet & Connect
  connect: "Connect",
  wallet: "Wallet",
  
  // Settings
  language: "Language",
  timezone: "Timezone",
  dataPeriod: "Data Period",
  theme: "Theme",
  
  // Timezones
  tz_local: "Local Time",
  tz_utc: "UTC",
};

const ru: Translations = {
  dashboard: "Дашборд",
  markets: "Рынки",
  whales: "Киты",
  settings: "Настройки",
  
  period_1H: "1Ч",
  period_24H: "24Ч",
  period_7D: "7Д",
  period_30D: "30Д",
  period_ALL: "Всё Время",
  
  totalPnl: "Общий PnL",
  winRate: "Винрейт",
  totalTrades: "Всего Сделок",
  equityCurve: "График Капитала",
  recentTrades: "Недавние Сделки",
  openPositions: "Открытые Позиции",
  uptime: "Аптайм",
  noTrades: "Пока нет сделок",
  
  connect: "Подключить",
  wallet: "Кошелек",
  
  language: "Язык",
  timezone: "Часовой Пояс",
  dataPeriod: "Период Данных",
  theme: "Тема",
  
  tz_local: "Местное время",
  tz_utc: "МСК (UTC)", // well UTC is not MSK, but we'll use UTC
};

ru.tz_utc = "UTC"; // fix from previous thought

const dictionaries: Record<Language, Translations> = { en, ru };

export function buildTranslator(lang: Language) {
  const dict = dictionaries[lang] || dictionaries.en;
  return (key: keyof typeof en): string => {
    return dict[key] || en[key] || key;
  };
}
