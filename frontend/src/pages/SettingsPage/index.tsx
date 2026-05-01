import { useBot } from "../../shared/api";
import Settings from "../../features/settings-form";
import { Link } from "wouter";

export default function SettingsPage() {
  const { tick, updateConfig } = useBot();

  return (
    <div className="flex-1 min-h-0 overflow-y-auto ">
      <div className="max-w-[1200px] mx-auto p-4 md:p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-mono font-bold text-zinc-100">Settings</h2>
          <Link href="/">
            <button className="px-3 py-1.5 text-xs font-mono text-zinc-400 hover:text-zinc-200 bg-zinc-800 border border-zinc-700 rounded-lg transition-colors cursor-pointer">
              ✕ Close
            </button>
          </Link>
        </div>
        <Settings
          key={JSON.stringify(tick.config)}
          config={tick.config}
          onSave={updateConfig}
        />
      </div>
    </div>
  );
}
