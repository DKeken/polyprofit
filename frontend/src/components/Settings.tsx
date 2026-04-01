import { useState, useEffect } from "react";
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
}

const FIELDS: FieldDef[] = [
  // Strategy
  { key: "min_edge", label: "Min Edge", group: "strategy", type: "decimal", hint: "Minimum edge to trade (0.01-0.50)" },
  { key: "min_prob", label: "Min Prob", group: "strategy", type: "decimal", hint: "Lower bound (0.01-0.99)" },
  { key: "max_prob", label: "Max Prob", group: "strategy", type: "decimal", hint: "Upper bound (0.01-0.99)" },
  { key: "max_spread", label: "Max Spread", group: "strategy", type: "decimal", hint: "Skip wide spreads" },
  { key: "order_strategy", label: "Strategy", group: "strategy", type: "select", options: ["Passive", "Balanced", "Aggressive"] },
  { key: "market_refresh_secs", label: "Refresh (s)", group: "strategy", type: "integer", hint: "Market discovery interval" },
  // Risk
  { key: "daily_loss_limit", label: "Loss Limit", group: "risk", type: "decimal", hint: "Negative value, e.g. -100" },
  { key: "daily_profit_cap", label: "Profit Cap", group: "risk", type: "decimal", hint: "Stop trading after this P&L" },
  { key: "max_position_pct", label: "Max Pos %", group: "risk", type: "decimal", hint: "Per-trade size (0-1)" },
  { key: "max_concurrent", label: "Max Positions", group: "risk", type: "integer" },
  { key: "drawdown_limit", label: "Drawdown Limit", group: "risk", type: "decimal", hint: "0-1, e.g. 0.20 = 20%" },
  { key: "adverse_fill_pause", label: "Adverse Pause", group: "risk", type: "integer", hint: "Pause after N adverse fills" },
];

const EMPTY_DEF: AssetDefInfo = { symbol: "", binance_symbol: "", keywords: [] };

export default function Settings({ config, onSave }: Props) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [draftAssets, setDraftAssets] = useState<string[]>([]);
  const [draftDefs, setDraftDefs] = useState<AssetDefInfo[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // Sync draft with incoming config
  useEffect(() => {
    const d: Record<string, string> = {};
    for (const f of FIELDS) {
      d[f.key] = String(config[f.key]);
    }
    setDraft(d);
    setDraftAssets([...config.assets]);
    if (config.asset_definitions?.length) {
      setDraftDefs(config.asset_definitions.map((d) => ({ ...d })));
    }
  }, [config]);

  // Known assets = all symbols from definitions (draft version for real-time)
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
      prev.includes(asset)
        ? prev.filter((a) => a !== asset)
        : [...prev, asset],
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
    // Also remove from active assets if present
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
    if (assetsChanged) {
      updates.assets = draftAssets;
    }
    if (defsChanged) {
      updates.asset_definitions = draftDefs.map((d) => ({
        symbol: d.symbol.trim().toUpperCase(),
        binance_symbol: d.binance_symbol.trim().toUpperCase(),
        keywords: d.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean),
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
    } catch {
      setMsg("Network error");
    }
    setSaving(false);
  }

  function renderField(f: FieldDef) {
    const val = draft[f.key] ?? "";
    const isChanged = val !== String(config[f.key]);

    if (f.type === "select" && f.options) {
      return (
        <div key={f.key} className="mb-3">
          <label className="text-xs text-zinc-500 block mb-1">{f.label}</label>
          <select
            value={val}
            onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
            className={`w-full bg-zinc-800 border rounded px-2 py-1.5 text-sm mono focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
              isChanged ? "border-emerald-600" : "border-zinc-700"
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
      <div key={f.key} className="mb-3">
        <label className="text-xs text-zinc-500 block mb-1">
          {f.label}
          {f.hint && (
            <span className="text-zinc-600 ml-1">— {f.hint}</span>
          )}
        </label>
        <input
          type="text"
          value={val}
          onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
          className={`w-full bg-zinc-800 border rounded px-2 py-1.5 text-sm mono focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
            isChanged ? "border-emerald-600" : "border-zinc-700"
          }`}
        />
      </div>
    );
  }

  const strategyFields = FIELDS.filter((f) => f.group === "strategy");
  const riskFields = FIELDS.filter((f) => f.group === "risk");

  return (
    <div className="space-y-4">
      {/* Strategy */}
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
        <h3 className="text-sm text-zinc-400 uppercase tracking-wider mb-3">
          Strategy
        </h3>
        {strategyFields.map(renderField)}
      </div>

      {/* Risk */}
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
        <h3 className="text-sm text-zinc-400 uppercase tracking-wider mb-3">
          Risk
        </h3>
        {riskFields.map(renderField)}
      </div>

      {/* Asset Definitions — full CRUD */}
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm text-zinc-400 uppercase tracking-wider">
            Asset Definitions
          </h3>
          <button
            onClick={addDef}
            className="px-3 py-1 rounded text-xs font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
          >
            + Add Asset
          </button>
        </div>
        <p className="text-zinc-600 text-xs mb-3">
          Define crypto assets with their Binance pair and discovery keywords.
          Changes are saved to the database — no config file editing needed.
        </p>

        {draftDefs.length === 0 ? (
          <p className="text-zinc-600 text-sm">No assets defined. Click "+ Add Asset" to start.</p>
        ) : (
          <div className="space-y-3">
            {draftDefs.map((def, idx) => (
              <div
                key={idx}
                className="bg-zinc-800/50 rounded-lg border border-zinc-700/50 p-3"
              >
                <div className="flex items-start gap-3">
                  {/* Symbol */}
                  <div className="flex-1 min-w-0">
                    <label className="text-xs text-zinc-500 block mb-1">Symbol</label>
                    <input
                      type="text"
                      value={def.symbol}
                      onChange={(e) => updateDef(idx, "symbol", e.target.value)}
                      placeholder="BTC"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm mono focus:outline-none focus:ring-1 focus:ring-emerald-500 uppercase"
                    />
                  </div>
                  {/* Binance Symbol */}
                  <div className="flex-1 min-w-0">
                    <label className="text-xs text-zinc-500 block mb-1">Binance Pair</label>
                    <input
                      type="text"
                      value={def.binance_symbol}
                      onChange={(e) => updateDef(idx, "binance_symbol", e.target.value)}
                      placeholder="BTCUSDT"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm mono focus:outline-none focus:ring-1 focus:ring-emerald-500 uppercase"
                    />
                  </div>
                  {/* Remove button */}
                  <div className="pt-5">
                    <button
                      onClick={() => removeDef(idx)}
                      className="px-2 py-1.5 rounded text-xs text-red-400 hover:bg-red-500/20 transition-colors"
                      title="Remove asset"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                {/* Keywords */}
                <div className="mt-2">
                  <label className="text-xs text-zinc-500 block mb-1">
                    Keywords <span className="text-zinc-600">— comma-separated, for market discovery</span>
                  </label>
                  <input
                    type="text"
                    value={def.keywords.join(", ")}
                    onChange={(e) =>
                      updateDef(
                        idx,
                        "keywords",
                        e.target.value.split(",").map((k) => k.trim()).filter(Boolean),
                      )
                    }
                    placeholder="btc, bitcoin"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active Assets — toggle buttons from definitions */}
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
        <h3 className="text-sm text-zinc-400 uppercase tracking-wider mb-3">
          Active Assets
        </h3>
        <p className="text-zinc-600 text-xs mb-2">
          Select which defined assets the bot should actively trade.
        </p>
        {knownAssets.length === 0 ? (
          <p className="text-zinc-600 text-sm">Add asset definitions above first.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {knownAssets.map((asset) => {
              const active = draftAssets.includes(asset);
              return (
                <button
                  key={asset}
                  onClick={() => toggleAsset(asset)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                    active
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-800"
                      : "bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-zinc-300"
                  }`}
                >
                  {asset}
                </button>
              );
            })}
          </div>
        )}
        {draftAssets.length === 0 && knownAssets.length > 0 && (
          <p className="text-red-400 text-xs mt-2">At least one asset required</p>
        )}
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || totalChanges === 0 || draftAssets.length === 0}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            totalChanges > 0 && draftAssets.length > 0
              ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
              : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
          }`}
        >
          {saving ? "Saving…" : `Save ${totalChanges} change${totalChanges !== 1 ? "s" : ""}`}
        </button>
        {msg && (
          <span
            className={`text-xs ${
              msg.startsWith("Error") ? "text-red-400" : "text-emerald-400"
            }`}
          >
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}
