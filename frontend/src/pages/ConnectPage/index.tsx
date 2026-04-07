import { useState } from "react";
import { Button, Panel, Input } from "../../shared/ui";
import { api } from "../../api";

export default function ConnectPage() {
  const [privKey, setPrivKey] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!privKey.trim()) {
      setError("Private key is required");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.setCredentials({
        private_key: privKey,
        api_key: apiKey,
        api_secret: apiSecret,
        api_passphrase: passphrase,
      });
      // The backend will write .env and shut down.
      // The frontend polling will briefly fail, then reconnect when the bot restarts.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8 animate-slide-up">
          <h1 className="text-2xl font-mono font-bold uppercase tracking-widest text-emerald-400 mb-2">
            Polyprofit
          </h1>
          <p className="text-zinc-500 font-mono text-sm">
            Enter your Polymarket credentials to start trading.
          </p>
        </div>

        <form
          onSubmit={handleConnect}
          className="animate-slide-up"
          style={{ animationDelay: "100ms" }}
        >
          <Panel title="Wallet Connection" className="p-6">
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-1.5">
                  EVM Private Key
                </label>
                <Input
                  type="password"
                  value={privKey}
                  onChange={(e) => setPrivKey(e.target.value)}
                  placeholder="0x..."
                  
                />
                <p className="text-[10px] text-zinc-600 font-mono mt-1.5">
                  Used for EIP-712 order signing. Never sent to Polymarket
                  servers.
                </p>
              </div>

              <div className="pt-4 border-t border-zinc-700/50">
                <h3 className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-4">
                  CLOB API Credentials (Optional)
                </h3>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-mono text-zinc-500 mb-1">
                      API Key
                    </label>
                    <Input
                      type="text"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-zinc-500 mb-1">
                      API Secret
                    </label>
                    <Input
                      type="password"
                      value={apiSecret}
                      onChange={(e) => setApiSecret(e.target.value)}
                      
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-zinc-500 mb-1">
                      Passphrase
                    </label>
                    <Input
                      type="password"
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      
                    />
                  </div>
                </div>
              </div>

              {error && (
                <div className="text-[11px] font-mono text-red-400 bg-red-950/30 border border-red-900/40 rounded px-3 py-2 mt-4">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                disabled={loading}
                className="w-full mt-6 py-2.5 text-sm uppercase tracking-widest"
              >
                {loading ? "Restarting Bot..." : "Connect Wallet"}
              </Button>
            </div>
          </Panel>
        </form>
      </div>
    </div>
  );
}
