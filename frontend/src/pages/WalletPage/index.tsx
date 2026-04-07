import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import usdcLogo from "../../assets/usdc.svg";
import polLogo from "../../assets/matic.svg";
import { api, type StatusResponse, type WalletInfoResponse, type TradesExportResponse } from "../../api";
import {
  ShieldCheck,
  ShieldAlert,
  Key,
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowRight,
  Pencil,
  Server,
  TrendingUp,
  TrendingDown,
  Copy,
  ArrowDown,
  ArrowUp,
  X,
} from "lucide-react";
import { fmtTimeSimple } from "../../shared/lib/format";
import { fmtTimeSimple } from "../../shared/lib/format";
import QRCodeImport from "react-qr-code";

// Fallback for bundler interop
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const QRCode = (QRCodeImport as any).default || QRCodeImport;

type Trade = TradesExportResponse["trades"][number];

export default function WalletPage() {
  const [, setLocation] = useLocation();

  const [checking, setChecking] = useState(true);
  const [authStatus, setAuthStatus] = useState<StatusResponse | null>(null);
  const [walletInfo, setWalletInfo] = useState<WalletInfoResponse | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [copied, setCopied] = useState(false);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [privKey, setPrivKey] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [showPrivKey, setShowPrivKey] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [statusRes, tradesRes] = await Promise.all([
          api.getStatus(),
          api.getTrades().catch(() => ({ trades: [] as Trade[] })),
        ]);
        if (cancelled) return;
        setAuthStatus(statusRes);
        setTrades(tradesRes.trades.slice(0, 15)); // Fetch more to fill the larger space

        if (!statusRes.authenticated) {
          setShowForm(true);
        } else {
          // Fetch on-chain wallet info (non-blocking for page render)
          api.getWalletInfo().then((w) => { if (!cancelled) setWalletInfo(w); }).catch(() => {});
        }
      } catch {
        if (!cancelled) setShowForm(true);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const authenticated = authStatus?.authenticated ?? false;
  const address = walletInfo?.address ?? authStatus?.wallet_address ?? null;

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const shortenAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!privKey.trim()) { setError("Private key is required"); return; }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.setCredentials({
        private_key: privKey.trim(),
        api_key: apiKey.trim(),
        api_secret: apiSecret.trim(),
        api_passphrase: passphrase.trim(),
      });
      setSuccess(res.message || "Saved. Bot restarting…");
      setPrivKey(""); setApiKey(""); setApiSecret(""); setPassphrase("");
      setTimeout(async () => {
        setSaving(false);
        setShowForm(false);
        try {
          const [s, w] = await Promise.all([api.getStatus(), api.getWalletInfo().catch(() => null)]);
          setAuthStatus(s);
          if (w) setWalletInfo(w);
        } catch { /* retry on next render */ }
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSaving(false);
    }
  };

  if (checking) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
      </div>
    );
  }

  const totalUsd = walletInfo ? parseFloat(walletInfo.usdc_balance) : 0;
  const totalStr = walletInfo ? totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00";
  const dailyPnl = authStatus ? parseFloat(authStatus.daily_pnl || "0") : 0;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      
      {/* ── Top Header Strip ── */}
      <div className="border-b border-zinc-700/60 px-8 py-8 flex flex-wrap items-end justify-between gap-8">
        
        {/* Left side: Balance & Bot stats */}
        <div className="flex flex-wrap items-center gap-12">
          
          {/* Total Balance */}
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">
              Total Balance
            </div>
            <div className="text-4xl font-bold font-mono text-zinc-100 flex items-baseline gap-1">
              <span className="text-2xl text-zinc-500">$</span>
              {totalStr}
            </div>
            {address ? (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-[10px] font-mono text-zinc-400 bg-zinc-800/40 border border-zinc-700/60 px-2 py-1 rounded select-all">
                  {shortenAddr(address)}
                </span>
                <button onClick={handleCopy} className="text-zinc-500 hover:text-emerald-400 transition-colors" title="Copy address">
                  {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => setShowForm(!showForm)}
                  className="ml-2 flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <Pencil className="w-3 h-3" /> Update Key
                </button>
              </div>
            ) : (
                <div className="mt-3 flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-amber-500">Not connected</span>
                </div>
            )}
          </div>

          {/* Bot Stats Pipe Separator */}
          <div className="hidden lg:block w-px h-16 bg-zinc-800/80"></div>

          {/* Performance & Order Stats */}
          <div className="flex gap-10">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">Today P&L</p>
              <p className={`text-2xl font-bold font-mono ${dailyPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {dailyPnl >= 0 ? "+" : ""}${dailyPnl.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">Markets</p>
              <p className="text-2xl font-bold font-mono text-zinc-200">{authStatus?.active_markets ?? 0}</p>
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">Positions</p>
              <p className="text-2xl font-bold font-mono text-zinc-200">{authStatus?.active_positions ?? 0}</p>
            </div>
          </div>

        </div>

        {/* Right side: Quick Actions */}
        <div className="flex items-center gap-3">
          <WalletAction icon={<ArrowDown className="w-4 h-4" />} label="Receive" onClick={() => setShowReceiveModal(true)} />
        </div>

      </div>

      {/* ── Main Content Split ── */}
      <div className="flex-1 flex min-h-0">
        
        {/* Left Column: Assets & Form */}
        <div className="w-[480px] shrink-0 border-r border-zinc-700/60 p-8 flex flex-col gap-10 overflow-y-auto">
          
          {/* Assets Section */}
          <div className="flex flex-col gap-4">
            <h2 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 border-b border-zinc-700/60 pb-2">
              Assets
            </h2>
            <div className="flex flex-col gap-3">
              <SysAsset 
                name="USDC" 
                imgUrl={usdcLogo}
                amount={walletInfo ? parseFloat(walletInfo.usdc_balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"} 
              />
              <SysAsset 
                name="POL" 
                imgUrl={polLogo}
                amount={walletInfo ? parseFloat(walletInfo.matic_balance).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : "—"} 
                value="—" 
              />
            </div>
          </div>

           {/* ── Auth Form Inline ── */}
          {(showForm || !authenticated) && (
            <div className="flex flex-col gap-4">
              <h2 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 border-b border-zinc-700/60 pb-2">
                 Wallet Settings
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                
                {!authenticated && !success && (
                  <div className="flex items-center gap-3 bg-amber-950/20 border border-amber-800/30 rounded-md p-3">
                    <ShieldAlert className="w-4 h-4 text-amber-500/80 shrink-0" />
                    <p className="text-[10px] font-mono uppercase tracking-widest text-amber-500/80">
                      Wallet offline. Missing keys.
                    </p>
                  </div>
                )}

                {/* Private Key */}
                <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-md p-4">
                  <label className="flex items-center gap-2 text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-3">
                    <Key className="w-3 h-3 text-emerald-500" /> Private Key
                    <span className="text-red-400/60 text-[8px] bg-red-900/10 px-1 rounded">required</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPrivKey ? "text" : "password"}
                      value={privKey}
                      onChange={(e) => setPrivKey(e.target.value)}
                      placeholder="0x..."
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 pr-9 text-xs font-mono text-zinc-100 placeholder-zinc-700 outline-none focus:border-emerald-500/50 transition-colors"
                    />
                    <button type="button" onClick={() => setShowPrivKey(!showPrivKey)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300 transition-colors">
                      {showPrivKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="text-[9px] font-mono text-zinc-600 mt-2 flex items-center gap-1.5 uppercase tracking-widest">
                    <Lock className="w-2.5 h-2.5" /> Local signing. Never leaves node.
                  </p>
                </div>

                {/* CLOB API */}
                <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-md p-4 space-y-4">
                  <label className="flex items-center gap-2 text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                    <Server className="w-3 h-3 text-violet-400/80" /> CLOB API
                    <span className="text-zinc-600 text-[8px] bg-zinc-800/50 px-1 rounded">optional</span>
                  </label>
                  <Field label="API Key" value={apiKey} onChange={setApiKey} placeholder="uuid" />
                  <PasswordField label="API Secret" value={apiSecret} onChange={setApiSecret} show={showSecret} onToggle={() => setShowSecret(!showSecret)} />
                  <Field label="Passphrase" value={passphrase} onChange={setPassphrase} type="password" />
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-red-400 bg-red-950/20 border border-red-900/30 rounded-md px-3 py-2.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
                  </div>
                )}
                {success && (
                  <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-emerald-400 bg-emerald-950/20 border border-emerald-900/30 rounded-md px-3 py-2.5">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> {success}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving || !privKey.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md text-[10px] font-mono font-bold uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-emerald-500/15 text-emerald-500/90 border border-emerald-700/40 hover:bg-emerald-500/25"
                >
                  {saving ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Restarting…</>
                  ) : authenticated ? (
                    <><RefreshCw className="w-3.5 h-3.5" /> Save & Restart Bot</>
                  ) : (
                    <><ShieldCheck className="w-3.5 h-3.5" /> Initialize Keys</>
                  )}
                </button>
                {authenticated && (
                  <button type="button" onClick={() => { setShowForm(false); setError(null); setSuccess(null); }} className="w-full py-2 flex items-center justify-center text-[10px] font-mono uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors">
                     Cancel Update
                  </button>
                )}
              </form>
            </div>
          )}

        </div>

        {/* Right Column: Recent Activity */}
        <div className="flex-1 p-8 flex flex-col min-h-0 overflow-y-auto">
          <div className="flex items-center justify-between mb-4 border-b border-zinc-700/60 pb-2">
            <h3 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Recent Activity</h3>
            <button
              onClick={() => setLocation("/analytics")}
              className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              All <ArrowRight className="w-2.5 h-2.5" />
            </button>
          </div>
          
          {trades.length === 0 ? (
            <p className="text-xs font-mono text-zinc-600 py-8 text-center border border-zinc-800/40 border-dashed rounded-md uppercase tracking-wider">No activity</p>
          ) : (
            <div className="flex flex-col border border-zinc-800/60 rounded-md bg-zinc-900/30 overflow-hidden divide-y divide-zinc-800/60">
              {trades.map((t, i) => {
                const pnl = t.pnl ? parseFloat(t.pnl) : null;
                const pos = pnl !== null && pnl > 0;
                const neg = pnl !== null && pnl < 0;
                const time = fmtTimeSimple(t.timestamp);
                const date = new Date(t.timestamp).toLocaleDateString([], { month: "short", day: "numeric" });
                return (
                  <div key={i} className="flex items-center justify-between px-4 py-3 text-[10px] font-mono hover:bg-zinc-800/50 transition-colors">
                    <div className="flex items-center gap-6">
                      <div className={`w-10 h-10 rounded-full border border-zinc-800/80 flex items-center justify-center ${t.side === "Buy" ? "bg-emerald-500/5 text-emerald-400" : "bg-red-500/5 text-red-400"}`}>
                         {t.side === "Buy" ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className={`uppercase font-bold ${t.side === "Buy" ? "text-emerald-500/80" : "text-red-400/80"}`}>
                          {t.side === "Buy" ? "BUY" : "SELL"}
                        </span>
                        <span className="text-zinc-500 uppercase tracking-widest">{date} {time}</span>
                      </div>
                      <span className="text-zinc-300 w-32 border-l border-zinc-800/80 pl-4 ml-2 max-w-[200px] truncate">
                        ${parseFloat(t.size).toLocaleString()} <span className="text-zinc-500">@</span> {parseFloat(t.price).toFixed(3)}
                      </span>
                    </div>
                    
                    <div className="flex items-center text-right">
                      {pnl !== null ? (
                        <div className="flex flex-col items-end gap-0.5">
                           <span className={`flex items-center gap-1 font-semibold text-sm ${pos ? "text-emerald-500/80" : neg ? "text-red-400/80" : "text-zinc-500"}`}>
                            {pos && <TrendingUp className="w-3.5 h-3.5" />}
                            {neg && <TrendingDown className="w-3.5 h-3.5" />}
                            {pos ? "+" : ""}${pnl.toFixed(2)}
                           </span>
                           <span className="text-zinc-600 tracking-widest uppercase">REALIZED P&L</span>
                        </div>
                      ) : (
                        <span className="text-zinc-600 italic">pending</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* ── Receive Modal ── */}
      {showReceiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-sm w-full p-6 shadow-2xl relative flex flex-col items-center">
            <button 
              onClick={() => setShowReceiveModal(false)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
               <X className="w-5 h-5" />
            </button>
            <h3 className="text-sm font-bold font-mono text-emerald-400 uppercase tracking-widest mt-2 mb-2">Fund Wallet</h3>
            <p className="text-center text-[10px] font-mono text-zinc-400 uppercase tracking-widest leading-relaxed mb-6">
              Send tokens via <span className="text-zinc-200">Polygon Network</span>
            </p>
            
            {address ? (
              <>
                 <div className="bg-white p-4 rounded-xl border border-emerald-900/50 shadow-[0_0_15px_rgba(52,211,153,0.15)] shrink-0">
                    <QRCode value={address} size={200} level="M" />
                 </div>
                 <div className="mt-8 w-full flex flex-col gap-3">
                   <div className="bg-zinc-950 border border-zinc-800/80 rounded-lg p-3 text-center">
                      <span className="text-[11px] font-mono text-zinc-300 select-all block break-all leading-relaxed px-1">
                        {address}
                      </span>
                   </div>
                   <button
                     onClick={handleCopy}
                     className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-zinc-800 hover:bg-emerald-900/40 text-emerald-400/80 hover:text-emerald-400 border border-transparent hover:border-emerald-800/60 rounded-lg transition-all font-mono text-[10px] uppercase tracking-widest cursor-pointer"
                   >
                     {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-emerald-500/80" />}
                     {copied ? "Address Copied" : "Copy Address"}
                   </button>
                 </div>
              </>
            ) : (
               <div className="text-[10px] font-mono uppercase tracking-widest text-amber-500 text-center py-10">
                 Wallet not connected
               </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──

function WalletAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 group outline-none border border-zinc-700/60 rounded-md px-3 py-2 bg-zinc-800/20 hover:bg-zinc-800 hover:border-emerald-700/40 transition-all font-mono">
      <div className="text-emerald-500/80 group-hover:text-emerald-400 transition-colors">
        {icon}
      </div>
      <span className="text-[10px] uppercase tracking-widest text-zinc-400 group-hover:text-emerald-500/90 transition-colors">
        {label}
      </span>
    </button>
  );
}

function SysAsset({ name, imgUrl, amount, value }: { name: string; imgUrl: string; amount: number | string; value?: string | number }) {
  return (
    <div className="flex items-center justify-between p-3 border border-zinc-800/80 rounded-md bg-zinc-900/40 hover:bg-zinc-800/40 transition-colors group">
      <div className="flex gap-4 items-center">
        <img src={imgUrl} alt={name} className="w-7 h-7 rounded-full opacity-80 group-hover:opacity-100 transition-opacity" />
        <div className="flex flex-col">
          <span className="text-xs font-bold font-mono text-zinc-200 tracking-wider ">{name}</span>
          <span className="text-[10px] font-mono text-zinc-500 mt-0.5 uppercase tracking-widest">{amount} {name}</span>
        </div>
      </div>
      <div className="text-right">
        {value === "—" ? (
           <div className="flex flex-col items-end">
             <span className="text-[11px] font-mono text-zinc-600">—</span>
           </div>
        ) : (
           <div className="flex flex-col items-end">
             <span className="text-xs font-bold font-mono text-zinc-200">{value}</span>
           </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-[9px] font-mono uppercase tracking-widest text-zinc-500 mb-1.5">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-xs font-mono text-zinc-100 placeholder-zinc-700 outline-none focus:border-emerald-500/50 transition-colors" />
    </div>
  );
}

function PasswordField({ label, value, onChange, show, onToggle }: {
  label: string; value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void;
}) {
  return (
    <div>
      <label className="block text-[9px] font-mono uppercase tracking-widest text-zinc-500 mb-1.5">{label}</label>
      <div className="relative">
        <input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 pr-9 text-xs font-mono text-zinc-100 placeholder-zinc-700 outline-none focus:border-emerald-500/50 transition-colors" />
        <button type="button" onClick={onToggle} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300 transition-colors">
          {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}
