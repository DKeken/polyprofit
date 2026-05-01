import { useState, useEffect } from "react";
import { api } from "../../shared/api";
import { Button, Input, Spinner } from "../../shared/ui";
import {
  X,
  Settings2,
  Clock,
  DollarSign,
  TrendingUp,
  Target,
  BarChart3,
} from "lucide-react";

interface ScanSettingsModalProps {
  onClose: () => void;
}

export function ScanSettingsModal({ onClose }: ScanSettingsModalProps) {
  const [pollInterval, setPollInterval] = useState("300");
  const [minTrade, setMinTrade] = useState("200");
  const [minWinRate, setMinWinRate] = useState("55");
  const [minRoi, setMinRoi] = useState("15");
  const [minProfit, setMinProfit] = useState("500");
  const [saving, setSaving] = useState(false);
  const [loadingCfg, setLoadingCfg] = useState(true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load current settings from backend
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((cfg: Record<string, unknown>) => {
        if (cfg.whale_poll_interval_secs)
          setPollInterval(String(cfg.whale_poll_interval_secs));
        if (cfg.min_whale_trade_usd)
          setMinTrade(String(cfg.min_whale_trade_usd));
        if (cfg.min_whale_win_rate)
          setMinWinRate(
            String(Math.round(Number(cfg.min_whale_win_rate) * 100)),
          );
        if (cfg.min_whale_roi)
          setMinRoi(String(Math.round(Number(cfg.min_whale_roi) * 100)));
        if (cfg.min_whale_profit_usd)
          setMinProfit(String(cfg.min_whale_profit_usd));
      })
      .catch(() => {})
      .finally(() => setLoadingCfg(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.updateConfig({
        whale_poll_interval_secs: Number(pollInterval),
        min_whale_trade_usd: minTrade,
        min_whale_win_rate: Number(minWinRate) / 100,
        min_whale_roi: Number(minRoi) / 100,
        min_whale_profit_usd: minProfit,
      });
      setSaved(true);
      setTimeout(() => onClose(), 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  const intervalMinutes = Math.round(Number(pollInterval) / 60);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700/60 rounded-2xl shadow-2xl shadow-black/50 w-full max-w-md p-0 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-zinc-800/60">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-700/30">
              <Settings2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-mono font-semibold text-zinc-200">
                Scan Settings
              </h3>
              <p className="text-[9px] font-mono text-zinc-600 mt-0.5">
                Configure whale discovery thresholds
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loadingCfg ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="md" label="Loading settings" />
          </div>
        ) : (
          <div className="px-5 py-4 flex flex-col gap-4">
            {/* Polling section */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-zinc-500" />
                <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                  Polling
                </span>
              </div>
              <label className="flex flex-col gap-1.5 bg-zinc-800/40 rounded-lg p-3 border border-zinc-800/60">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-zinc-500">
                    Poll interval
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400 tabular-nums">
                    {pollInterval}s
                    {intervalMinutes > 0 && ` (${intervalMinutes}m)`}
                  </span>
                </div>
                <Input
                  value={pollInterval}
                  onChange={(e) => setPollInterval(e.target.value)}
                  placeholder="300"
                />
              </label>
            </div>

            {/* Discovery thresholds section */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5">
                <Target className="w-3 h-3 text-zinc-500" />
                <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                  Discovery Thresholds
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1.5 bg-zinc-800/40 rounded-lg p-3 border border-zinc-800/60">
                  <div className="flex items-center gap-1">
                    <DollarSign className="w-2.5 h-2.5 text-zinc-600" />
                    <span className="text-[10px] font-mono text-zinc-500">
                      Min trade (USD)
                    </span>
                  </div>
                  <Input
                    value={minTrade}
                    onChange={(e) => setMinTrade(e.target.value)}
                    placeholder="200"
                  />
                </label>
                <label className="flex flex-col gap-1.5 bg-zinc-800/40 rounded-lg p-3 border border-zinc-800/60">
                  <div className="flex items-center gap-1">
                    <DollarSign className="w-2.5 h-2.5 text-zinc-600" />
                    <span className="text-[10px] font-mono text-zinc-500">
                      Min profit (USD)
                    </span>
                  </div>
                  <Input
                    value={minProfit}
                    onChange={(e) => setMinProfit(e.target.value)}
                    placeholder="500"
                  />
                </label>
                <label className="flex flex-col gap-1.5 bg-zinc-800/40 rounded-lg p-3 border border-zinc-800/60">
                  <div className="flex items-center gap-1">
                    <TrendingUp className="w-2.5 h-2.5 text-zinc-600" />
                    <span className="text-[10px] font-mono text-zinc-500">
                      Min win rate (%)
                    </span>
                  </div>
                  <Input
                    value={minWinRate}
                    onChange={(e) => setMinWinRate(e.target.value)}
                    placeholder="55"
                  />
                </label>
                <label className="flex flex-col gap-1.5 bg-zinc-800/40 rounded-lg p-3 border border-zinc-800/60">
                  <div className="flex items-center gap-1">
                    <BarChart3 className="w-2.5 h-2.5 text-zinc-600" />
                    <span className="text-[10px] font-mono text-zinc-500">
                      Min ROI (%)
                    </span>
                  </div>
                  <Input
                    value={minRoi}
                    onChange={(e) => setMinRoi(e.target.value)}
                    placeholder="15"
                  />
                </label>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="text-[10px] font-mono text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-zinc-800/60">
          <div className="flex-1">
            {saved && (
              <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Settings applied
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={saving || loadingCfg}
              onClick={handleSave}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
