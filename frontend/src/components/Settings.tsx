import { useState, useMemo } from "react";
import type { BotConfig } from "../hooks/useBot";
import type { AssetDefInfo } from "@server-bindings/AssetDefInfo";
import { Panel, Input, Select, Button, Badge } from "../shared/ui";

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
  min?: number;
  max?: number;
  step?: number;
}

const FIELDS: FieldDef[] = [
  {
    key: "min_edge",
    label: "Min Edge",
    group: "strategy",
    type: "decimal",
    hint: "Minimum expected value (0.01–0.50)",
    min: 0.01,
    max: 0.5,
    step: 0.01,
  },
  {
    key: "min_prob",
    label: "Min Probability",
    group: "strategy",
    type: "decimal",
    hint: "0.01–0.99",
    min: 0.01,
    max: 0.99,
    step: 0.01,
  },
  {
    key: "max_prob",
    label: "Max Probability",
    group: "strategy",
    type: "decimal",
    hint: "0.01–0.99",
    min: 0.01,
    max: 0.99,
    step: 0.01,
  },
  {
    key: "max_spread",
    label: "Max Spread",
    group: "strategy",
    type: "decimal",
    hint: "Skip wide spreads",
    min: 0.01,
    max: 0.2,
    step: 0.01,
  },
  {
    key: "order_strategy",
    label: "Order Strategy",
    group: "strategy",
    type: "select",
    options: ["Passive", "Balanced", "Aggressive"],
  },
  {
    key: "market_refresh_secs",
    label: "Market Refresh",
    group: "strategy",
    type: "integer",
    hint: "seconds",
    min: 1,
    max: 120,
    step: 1,
  },
  {
    key: "daily_loss_limit",
    label: "Daily Loss Limit",
    group: "risk",
    type: "decimal",
    hint: "Negative USD amount, e.g. -100",
  },
  {
    key: "daily_profit_cap",
    label: "Daily Profit Cap",
    group: "risk",
    type: "decimal",
    hint: "Stop after this P&L (USD)",
  },
  {
    key: "max_position_pct",
    label: "Max Position Size",
    group: "risk",
    type: "decimal",
    hint: "0–1 (fraction of capital)",
    min: 0.01,
    max: 1.0,
    step: 0.01,
  },
  {
    key: "max_concurrent",
    label: "Max Concurrent",
    group: "risk",
    type: "integer",
    hint: "Parallel positions",
    min: 1,
    max: 20,
    step: 1,
  },
  {
    key: "drawdown_limit",
    label: "Drawdown Limit",
    group: "risk",
    type: "decimal",
    hint: "0–1 (e.g. 0.20 = 20%)",
    min: 0.01,
    max: 1.0,
    step: 0.01,
  },
  {
    key: "adverse_fill_pause",
    label: "Adverse Fill Pause",
    group: "risk",
    type: "integer",
    hint: "Pause N trades",
    min: 0,
    max: 10,
    step: 1,
  },
];

const EMPTY_DEF: AssetDefInfo = {
  symbol: "",
  binance_symbol: "",
  keywords: [],
};

type Tab = "strategy" | "risk" | "assets";

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

  const [activeTab, setActiveTab] = useState<Tab>("strategy");
  const [search, setSearch] = useState("");

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

  function updateDef(
    idx: number,
    field: keyof AssetDefInfo,
    value: string | string[],
  ) {
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
    } catch (error) {
      setMsg(
        error instanceof Error ? `Error: ${error.message}` : "Network error",
      );
    }
    setSaving(false);
  }

  const filteredFields = useMemo(() => {
    if (!search) return FIELDS;
    const lowerSearch = search.toLowerCase();
    return FIELDS.filter(
      (f) =>
        f.label.toLowerCase().includes(lowerSearch) ||
        f.key.toLowerCase().includes(lowerSearch),
    );
  }, [search]);

  function renderField(f: FieldDef) {
    const val = draft[f.key] ?? "";
    const isChanged = val !== String(config[f.key]);

    if (f.type === "select" && f.options) {
      return (
        <div key={f.key} className="space-y-1.5">
          <label className="text-[11px] text-zinc-400 font-medium uppercase tracking-wider block">
            {f.label}
          </label>
          <Select
            value={val}
            onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
            className={
              isChanged ? "border-emerald-500/50 bg-emerald-500/5" : ""
            }
          >
            {f.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </Select>
          {f.hint && <p className="text-[10px] text-zinc-500">{f.hint}</p>}
        </div>
      );
    }

    const hasSlider =
      f.min !== undefined && f.max !== undefined && f.step !== undefined;

    return (
      <div key={f.key} className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] text-zinc-400 font-medium uppercase tracking-wider">
            {f.label}
          </label>
          {isChanged && <Badge color="emerald">Modified</Badge>}
        </div>

        {hasSlider ? (
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={f.min}
              max={f.max}
              step={f.step}
              value={val}
              onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
              className="flex-1 accent-emerald-500 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
            />
            <Input
              type="number"
              min={f.min}
              max={f.max}
              step={f.step}
              value={val}
              onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
              className={`w-20 text-right ${isChanged ? "border-emerald-500/50 bg-emerald-500/5" : ""}`}
            />
          </div>
        ) : (
          <Input
            type="text"
            value={val}
            onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
            className={
              isChanged ? "border-emerald-500/50 bg-emerald-500/5" : ""
            }
          />
        )}
        {f.hint && <p className="text-[10px] text-zinc-500">{f.hint}</p>}
      </div>
    );
  }

  const strategyFields = filteredFields.filter((f) => f.group === "strategy");
  const riskFields = filteredFields.filter((f) => f.group === "risk");

  return (
    <div className="flex flex-col h-full space-y-4 animate-slide-up pb-24">
      {/* Header: Tabs & Search */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="flex space-x-1 p-1 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
          {(["strategy", "risk", "assets"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-md text-xs font-medium uppercase tracking-wider transition-colors ${
                activeTab === tab
                  ? "bg-zinc-700 text-zinc-100 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="w-full sm:w-64">
          <Input
            placeholder="Search settings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto pr-2">
        {activeTab === "strategy" && (
          <Panel title="Strategy Parameters">
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
              {strategyFields.length > 0 ? (
                strategyFields.map(renderField)
              ) : (
                <div className="col-span-2 text-center py-8 text-zinc-500 text-sm">
                  No strategy settings match "{search}"
                </div>
              )}
            </div>
          </Panel>
        )}

        {activeTab === "risk" && (
          <Panel title="Risk Management">
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
              {riskFields.length > 0 ? (
                riskFields.map(renderField)
              ) : (
                <div className="col-span-2 text-center py-8 text-zinc-500 text-sm">
                  No risk settings match "{search}"
                </div>
              )}
            </div>
          </Panel>
        )}

        {activeTab === "assets" && (
          <div className="space-y-4">
            <Panel
              title="Asset Definitions"
              action={
                <Button size="sm" onClick={addDef} variant="primary">
                  Add Asset
                </Button>
              }
            >
              {draftDefs.length === 0 ? (
                <div className="p-8 text-center text-zinc-500 text-sm">
                  No assets defined. Click Add Asset to start.
                </div>
              ) : (
                <div className="p-4 space-y-4">
                  {draftDefs.map((def, idx) => (
                    <div
                      key={idx}
                      className="bg-zinc-800/30 rounded-lg border border-zinc-700/40 p-4"
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex-1 space-y-1.5 min-w-0">
                          <label className="text-[11px] text-zinc-400 font-medium uppercase tracking-wider">
                            Symbol
                          </label>
                          <Input
                            value={def.symbol}
                            onChange={(e) =>
                              updateDef(idx, "symbol", e.target.value)
                            }
                            placeholder="BTC"
                            className="uppercase"
                          />
                        </div>
                        <div className="flex-1 space-y-1.5 min-w-0">
                          <label className="text-[11px] text-zinc-400 font-medium uppercase tracking-wider">
                            Binance Pair
                          </label>
                          <Input
                            value={def.binance_symbol}
                            onChange={(e) =>
                              updateDef(idx, "binance_symbol", e.target.value)
                            }
                            placeholder="BTCUSDT"
                            className="uppercase"
                          />
                        </div>
                        <div className="pt-6">
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => removeDef(idx)}
                            title="Remove asset"
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                      <div className="mt-4 space-y-1.5">
                        <label className="text-[11px] text-zinc-400 font-medium uppercase tracking-wider flex items-center gap-2">
                          Keywords
                          <span className="text-[10px] normal-case tracking-normal text-zinc-500">
                            (comma-separated)
                          </span>
                        </label>
                        <Input
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
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Active Assets">
              <div className="p-4">
                <p className="text-zinc-400 text-xs mb-4">
                  Select which assets the bot actively trades.
                </p>
                {knownAssets.length === 0 ? (
                  <div className="text-zinc-500 text-sm">
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
                          className={`px-4 py-2 rounded-lg text-sm font-medium font-mono transition-all duration-200 border ${
                            active
                              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50"
                              : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500"
                          }`}
                        >
                          {asset}
                        </button>
                      );
                    })}
                  </div>
                )}
                {draftAssets.length === 0 && knownAssets.length > 0 && (
                  <p className="text-red-400 text-xs mt-3">
                    At least one asset must be active.
                  </p>
                )}
              </div>
            </Panel>
          </div>
        )}
      </div>

      {/* Save Bar */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-4xl z-50">
        <div className="bg-zinc-800/95 backdrop-blur-md rounded-xl border border-zinc-700 p-3 px-5 flex items-center justify-between shadow-2xl">
          <div className="flex items-center gap-3">
            {msg && (
              <span
                className={`text-xs font-mono animate-fade-in ${
                  msg.startsWith("Error") ? "text-red-400" : "text-emerald-400"
                }`}
              >
                {msg}
              </span>
            )}
            {!msg && totalChanges > 0 && (
              <span className="text-xs text-zinc-400 font-mono">
                {totalChanges} pending change{totalChanges !== 1 ? "s" : ""}
              </span>
            )}
            {!msg && totalChanges === 0 && (
              <span className="text-xs text-zinc-500 font-mono">
                All settings saved
              </span>
            )}
          </div>
          <Button
            onClick={handleSave}
            disabled={saving || totalChanges === 0 || draftAssets.length === 0}
            variant="primary"
            className="min-w-[120px]"
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
