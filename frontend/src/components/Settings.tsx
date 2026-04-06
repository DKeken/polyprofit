import { useState } from "react";
import type { BotConfig } from "../hooks/useBot";
import type { AssetDefInfo } from "@server-bindings/AssetDefInfo";

interface Props {
  config: BotConfig;
  onSave: (updates: Record<string, unknown>) => Promise<unknown>;
}

interface FieldDef {
  key: keyof BotConfig;
  label: string;
  group: "strategy" | "risk";
  type: "decimal" | "integer" | "select";
  options?: string[];
  hint?: string;
  icon?: string;
}

const FIELDS: FieldDef[] = [
  { key: "min_edge", label: "Min Edge", group: "strategy", type: "decimal", hint: "0.01–0.50", icon: "📐" },
  { key: "min_prob", label: "Min Probability", group: "strategy", type: "decimal", hint: "0.01–0.99", icon: "📉" },
  { key: "max_prob", label: "Max Probability", group: "strategy", type: "decimal", hint: "0.01–0.99", icon: "📈" },
  { key: "max_spread", label: "Max Spread", group: "strategy", type: "decimal", hint: "Skip wide spreads", icon: "↔" },
  { key: "order_strategy", label: "Order Strategy", group: "strategy", type: "select", options: ["Passive", "Balanced", "Aggressive"], icon: "⚡" },
  { key: "market_refresh_secs", label: "Market Refresh", group: "strategy", type: "integer", hint: "seconds", icon: "🔄" },
  { key: "daily_loss_limit", label: "Daily Loss Limit", group: "risk", type: "decimal", hint: "Negative, e.g. -100", icon: "🛑" },
  { key: "daily_profit_cap", label: "Daily Profit Cap", group: "risk", type: "decimal", hint: "Stop after this P&L", icon: "🎯" },
  { key: "max_position_pct", label: "Max Position Size", group: "risk", type: "decimal", hint: "0–1 (fraction)", icon: "📊" },
  { key: "max_concurrent", label: "Max Concurrent", group: "risk", type: "integer", hint: "Parallel positions", icon: "🔢" },
  { key: "drawdown_limit", label: "Drawdown Limit", group: "risk", type: "decimal", hint: "0–1 (e.g. 0.20 = 20%)", icon: "📉" },
  { key: "adverse_fill_pause", label: "Adverse Fill Pause", group: "risk", type: "integer", hint: "Pause N trades", icon: "⏸" },
];

const EMPTY_DEF: AssetDefInfo = { symbol: "", binance_symbol: "", keywords: [] };

export default function Settings({ config, onSave }: Props) {
  const initialDraft = Object.fromEntries(
    FIELDS.map((f) => [f.key, String(config[f.key])]),
  ) as Record<string, string>;

  const [draft, setDraft] = useState<Record<string, string>>(initialDraft);
  const [draftAssets, setDraftAssets] = useState<string[]>([...config.assets]);
  const [draftDefs, setDraftDefs] = useState<AssetDefInfo[]>(
    config.asset_definitions?.map((d) => ({ ...d })) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const knownAssets = draftDefs.map((d) => d.symbol).filter(Boolean);

  const fieldChanged = FIELDS.filter(
    (f) => draft[f.key] !== undefined && draft[f.key] !== String(config[f.key]),
  );

  const assetsChanged =
    JSON.stringify([...draftAssets].sort()) !==
    JSON.stringify([...config.assets].sort());

  const defsChanged =
    JSON.stringify(draftDefs) !==
    JSON.stringify(config.asset_definitions ?? []);

  const totalChanges =
    fieldChanged.length + (assetsChanged ? 1 : 0) + (defsChanged ? 1 : 0);

  function toggleAsset(asset: string) {
    setDraftAssets((prev) =>
      prev.includes(asset) ? prev.filter((a) => a !== asset) : [...prev, asset],
    );
  }

  function updateDef(idx: number, field: keyof AssetDefInfo, value: string | string[]) {
    setDraftDefs((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }

  function addDef() {
    setDraftDefs((prev) => [...prev, { ...EMPTY_DEF }]);
  }

  function removeDef(idx: number) {
    const symbol = draftDefs[idx].symbol;
    setDraftDefs((prev) => prev.filter((_, i) => i !== idx));
    if (symbol) {
      setDraftAssets((prev) => prev.filter((a) => a !== symbol));
    }
  }

  async function handleSave() {
    if (totalChanges === 0) return;
    setSaving(true);
    setMsg("");

    const updates: Record<string, unknown> = {};
    for (const f of fieldChanged) {
      const val = draft[f.key];
      if (f.type === "integer") {
        updates[f.key] = parseInt(val, 10);
      } else {
        updates[f.key] = val;
      }
    }
    if (assetsChanged) updates.assets = draftAssets;
    if (defsChanged) {
      updates.asset_definitions = draftDefs.map((d) => ({
        symbol: d.symbol.trim().toUpperCase(),
        binance_symbol: d.binance_symbol.trim().toUpperCase(),
        keywords: d.keywords
          .map((k) => k.trim().toLowerCase())
          .filter(Boolean),
      }));
    }

    try {
      const res = (await onSave(updates)) as {
        error?: string;
        changes?: string[];
      };
      if (res.error) {
        setMsg(`Error: ${res.error}`);
      } else {
        setMsg(`Saved ${res.changes?.length ?? 0} changes`);
        setTimeout(() => setMsg(""), 3000);
      }
    } catch (error) {
      setMsg(
        error instanceof Error ? `Error: ${error.message}` : "Network error",
      );
    }
    setSaving(false);
  }

  function renderField(f: FieldDef) {
    const val = draft[f.key] ?? "";
    const isChanged = val !== String(config[f.key]);

    if (f.type === "select" && f.options) {
      return (
        <div key={f.key}>
          <label className="text-[11px] text-zinc-500 block mb-1.5 font-medium">
            {f.icon && <span className="mr-1">{f.icon}</span>}
            {f.label}
          </label>
          <select
            value={val}
            onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
            className={`w-full bg-zinc-800/60 border rounded-lg px-3 py-2 text-sm mono focus:outline-none focus:ring-1 focus:ring-emerald-500/40 transition-all ${
              isChanged
                ? "border-emerald-600/60 bg-emerald-500/5"
                : "border-zinc-700/60"
            }`}
          >
            {f.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      );
    }

    return (
      <div key={f.key}>
        <label className="text-[11px] text-zinc-500 block mb-1.5 font-medium">
          {f.icon && <span className="mr-1">{f.icon}</span>}
          {f.label}
          {f.hint && (
            <span className="text-zinc-600 ml-1 font-normal">({f.hint})</span>
          )}
        </label>
        <input
          type="text"
          value={val}
          onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
          className={`w-full bg-zinc-800/60 border rounded-lg px-3 py-2 text-sm mono focus:outline-none focus:ring-1 focus:ring-emerald-500/40 transition-all ${
            isChanged
              ? "border-emerald-600/60 bg-emerald-500/5"
              : "border-zinc-700/60"
          }`}
        />
      </div>
    );
  }

  const strategyFields = FIELDS.filter((f) => f.group === "strategy");
  const riskFields = FIELDS.filter((f) => f.group === "risk");

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Strategy + Risk side by side on wide screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Strategy */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 card-glow gradient-border">
          <h3 className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-4">
            Strategy Parameters
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {strategyFields.map(renderField)}
          </div>
        </div>

        {/* Risk */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 card-glow">
          <h3 className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-4">
            Risk Management
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {riskFields.map(renderField)}
          </div>
        </div>
      </div>

      {/* Asset Definitions */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 card-glow">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">
            Asset Definitions
          </h3>
          <button
            onClick={addDef}
            className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-700/50 transition-all duration-200"
          >
            + Add Asset
          </button>
        </div>

        {draftDefs.length === 0 ? (
          <div className="text-zinc-600 text-sm py-6 text-center">
            No assets defined. Click "+ Add Asset" to start.
          </div>
        ) : (
          <div className="space-y-3">
            {draftDefs.map((def, idx) => (
              <div
                key={idx}
                className="bg-zinc-800/30 rounded-lg border border-zinc-700/40 p-4 animate-fade-in"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <label className="text-[11px] text-zinc-500 block mb-1.5 font-medium">
                      Symbol
                    </label>
                    <input
                      type="text"
                      value={def.symbol}
                      onChange={(e) => updateDef(idx, "symbol", e.target.value)}
                      placeholder="BTC"
                      className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-lg px-3 py-2 text-sm mono focus:outline-none focus:ring-1 focus:ring-emerald-500/40 uppercase transition-all"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="text-[11px] text-zinc-500 block mb-1.5 font-medium">
                      Binance Pair
                    </label>
                    <input
                      type="text"
                      value={def.binance_symbol}
                      onChange={(e) =>
                        updateDef(idx, "binance_symbol", e.target.value)
                      }
                      placeholder="BTCUSDT"
                      className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-lg px-3 py-2 text-sm mono focus:outline-none focus:ring-1 focus:ring-emerald-500/40 uppercase transition-all"
                    />
                  </div>
                  <div className="pt-6">
                    <button
                      onClick={() => removeDef(idx)}
                      className="px-2.5 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/15 transition-all"
                      title="Remove asset"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div className="mt-3">
                  <label className="text-[11px] text-zinc-500 block mb-1.5 font-medium">
                    Keywords{" "}
                    <span className="text-zinc-600 font-normal">
                      — comma-separated for market discovery
                    </span>
                  </label>
                  <input
                    type="text"
                    value={def.keywords.join(", ")}
                    onChange={(e) =>
                      updateDef(
                        idx,
                        "keywords",
                        e.target.value
                          .split(",")
                          .map((k) => k.trim())
                          .filter(Boolean),
                      )
                    }
                    placeholder="btc, bitcoin"
                    className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-lg px-3 py-2 text-sm mono focus:outline-none focus:ring-1 focus:ring-emerald-500/40 transition-all"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active Assets */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 card-glow">
        <h3 className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-3">
          Active Assets
        </h3>
        <p className="text-zinc-600 text-[11px] mb-3">
          Select which assets the bot actively trades.
        </p>
        {knownAssets.length === 0 ? (
          <div className="text-zinc-600 text-sm">
            Add asset definitions above first.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {knownAssets.map((asset) => {
              const active = draftAssets.includes(asset);
              return (
                <button
                  key={asset}
                  onClick={() => toggleAsset(asset)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 border ${
                    active
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-700/50 shadow-sm shadow-emerald-500/10"
                      : "bg-zinc-800/60 text-zinc-500 border-zinc-700/50 hover:text-zinc-300 hover:border-zinc-600"
                  }`}
                >
                  {active && <span className="mr-1">✓</span>}
                  {asset}
                </button>
              );
            })}
          </div>
        )}
        {draftAssets.length === 0 && knownAssets.length > 0 && (
          <p className="text-red-400 text-[11px] mt-2">
            At least one asset must be active
          </p>
        )}
      </div>

      {/* Save Bar */}
      <div className="sticky bottom-4 z-20">
        <div className="bg-zinc-900/95 backdrop-blur-sm rounded-xl border border-zinc-800 p-4 flex items-center justify-between shadow-lg shadow-black/20">
          <div className="flex items-center gap-3">
            {msg && (
              <span
                className={`text-xs animate-fade-in ${
                  msg.startsWith("Error") ? "text-red-400" : "text-emerald-400"
                }`}
              >
                {msg}
              </span>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={saving || totalChanges === 0 || draftAssets.length === 0}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              totalChanges > 0 && draftAssets.length > 0
                ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-700/50 shadow-sm shadow-emerald-500/10"
                : "bg-zinc-800 text-zinc-600 cursor-not-allowed border border-zinc-700"
            }`}
          >
            {saving
              ? "Saving…"
              : totalChanges > 0
                ? `Save ${totalChanges} change${totalChanges !== 1 ? "s" : ""}`
                : "No changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
