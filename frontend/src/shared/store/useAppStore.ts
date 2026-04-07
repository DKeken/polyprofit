import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DataPeriod = "1H" | "24H" | "7D" | "30D" | "ALL";
export type Language = "en" | "ru";
export type TimezoneMode = "local" | "utc";

interface AppState {
  language: Language;
  timezone: TimezoneMode;
  dataPeriod: DataPeriod;
  
  setLanguage: (lang: Language) => void;
  setTimezone: (tz: TimezoneMode) => void;
  setDataPeriod: (period: DataPeriod) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      language: "en",
      timezone: "local",
      dataPeriod: "24H",
      setLanguage: (language) => set({ language }),
      setTimezone: (timezone) => set({ timezone }),
      setDataPeriod: (dataPeriod) => set({ dataPeriod }),
    }),
    {
      name: "polyprofit-app-store",
    }
  )
);
