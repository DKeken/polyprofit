import { useState, useRef } from "react";
import type { WhaleRow } from "./types";
import { fmtUsd, fmtPnl, shortenAddress, pnlColor } from "../../shared/lib/format";
import { Button, Badge, Input } from "../../shared/ui";

interface AddWhaleRowProps {
  onTrack: (address: string, displayName?: string) => Promise<void>;
  onLookup: (address: string) => Promise<WhaleRow>;
}

export function AddWhaleRow({ onTrack, onLookup }: AddWhaleRowProps) {
  const [open, setOpen] = useState(false);
  const [addr, setAddr] = useState("");
  const [label, setLabel] = useState("");
  const [preview, setPreview] = useState<WhaleRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const addrRef = useRef<HTMLInputElement>(null);

  async function handleLookup() {
    const a = addr.trim();
    if (!a) return;
    setBusy(true);
    setErr(null);
    setPreview(null);
    try {
      const w = await onLookup(a);
      setPreview(w);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleTrack() {
    const a = addr.trim();
    if (!a) return;
    setBusy(true);
    setErr(null);
    try {
      await onTrack(a, label.trim() || undefined);
      setAddr("");
      setLabel("");
      setPreview(null);
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Track failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => {
          setOpen(true);
          setTimeout(() => addrRef.current?.focus(), 50);
        }}
        className="w-full flex items-center gap-2 px-3 py-2 rounded border border-dashed border-zinc-700 text-zinc-500 text-[10px] font-mono hover:border-emerald-700/60 hover:text-emerald-400 transition-colors shrink-0"
      >
        <span className="text-base leading-none">+</span>
        Add whale manually
      </button>
    );
  }

  return (
    <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl p-3 flex flex-col gap-2 shrink-0">
      <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
        Add Whale
      </p>
      <div className="flex gap-2">
        <Input
          ref={addrRef}
          placeholder="0x… wallet address"
          value={addr}
          onChange={(e) => {
            setAddr(e.target.value);
            setPreview(null);
          }}
          className="flex-1"
        />
        <Button
          size="sm"
          disabled={busy || !addr.trim()}
          onClick={handleLookup}
        >
          {busy ? "…" : "Lookup"}
        </Button>
      </div>
      <Input
        placeholder="Label (optional)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />

      {err && <p className="text-[10px] font-mono text-red-400">{err}</p>}

      {preview && (
        <div className="bg-zinc-800/60 border border-zinc-700/40 rounded-lg p-2 flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-mono text-zinc-200">
              {preview.display_name ?? shortenAddress(preview.address)}
            </p>
            <p className="text-[9px] font-mono text-zinc-600 mt-0.5">
              {shortenAddress(preview.address)}
            </p>
            <div className="flex gap-3 mt-1">
              <span className="text-[9px] font-mono text-zinc-400">
                Win {(preview.win_rate * 100).toFixed(1)}%
              </span>
              <span className="text-[9px] font-mono text-zinc-400">
                ROI {(preview.roi * 100).toFixed(1)}%
              </span>
              <span
                className={`text-[9px] font-mono ${pnlColor(parseFloat(preview.profit) || 0)}`}
              >
                {fmtPnl(parseFloat(preview.profit) || 0, 0)}
              </span>
            </div>
          </div>
          <Badge color="zinc">preview</Badge>
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setAddr("");
            setLabel("");
            setPreview(null);
            setErr(null);
          }}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={busy || !addr.trim()}
          onClick={handleTrack}
        >
          {busy ? "Adding…" : "Track"}
        </Button>
      </div>
    </div>
  );
}
