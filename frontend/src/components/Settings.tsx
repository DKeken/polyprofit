import { useState, useEffect } from "react";
import type { BotConfig } from "../hooks/useBot";

const ALL_ASSETS = ["BTC", "ETH", "SOL", "XRP"] as const;

interface Props {
  config: BotConfig;
  onSave: (updates: Record<string, string | number | string[]>) => Promise<unknown>;
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

export default function Settings({ config, onSave }: Props) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [draftAssets, setDraftAssets] = useState<string[]>([]);
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
  }, [config]);

  const fieldChanged = FIELDS.filter(
    (f) => draft[f.key] !== undefined && draft[f.key] !== String(config[f.key]),
  );

  const assetsChanged =
    JSON.stringify([...draftAssets].sort()) !==
    JSON.stringify([...config.assets].sort());

  const totalChanges = fieldChanged.length + (assetsChanged ? 1 : 0);

  function toggleAsset(asset: string) {
    setDraftAssets((prev) =>
      prev.includes(asset)
        ? prev.filter((a) => a !== asset)
        : [...prev, asset],
    );
  }

  async function handleSave() {
    if (totalChanges === 0) return;
    setSaving(true);
    setMsg("");
    const updates: Record<string, string | number | string[]> = {};
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
    try {
      const res = await onSave(updates) as { error?: string; changes?: string[] };
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

      {/* Assets */}
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
        <h3 className="text-sm text-zinc-400 uppercase tracking-wider mb-3">
          Assets
        </h3>
        <div className="flex flex-wrap gap-2">
          {ALL_ASSETS.map((asset) => {
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
        {draftAssets.length === 0 && (
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
