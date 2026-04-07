import { useState, useEffect, useCallback } from "react";
import { whaleApi } from "../api";
import type { ScanStatus } from "../api";

/**
 * Polls the scan-status endpoint every 15 s and exposes:
 * - scanStatus: last scan time, next scan time, interval
 * - countdown:  seconds until next scan (live-updating every second)
 * - rescan():   triggers an immediate rescan and refreshes status
 */
export function useScanStatus(onRescanComplete?: () => void) {
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const s = await whaleApi.scanStatus();
      setScanStatus(s);
    } catch {
      // Silently ignore — backend may not be ready yet
    }
  }, []);

  // Poll scan-status every 15 s
  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 15_000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  // Live countdown ticker — updates every second
  useEffect(() => {
    if (!scanStatus) return;
    function tick() {
      const now = Math.floor(Date.now() / 1000);
      const secs = (scanStatus?.next_scan ?? 0) - now;
      setCountdown(Math.max(0, secs));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [scanStatus]);

  const rescan = useCallback(async () => {
    setScanning(true);
    try {
      await whaleApi.poll();
      // Refresh scan status immediately
      await fetchStatus();
      onRescanComplete?.();
    } finally {
      setScanning(false);
    }
  }, [fetchStatus, onRescanComplete]);

  return { scanStatus, countdown, scanning, rescan };
}

/** Format seconds as "Xm Ys" */
export function fmtCountdown(secs: number): string {
  if (secs <= 0) return "now";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s < 10 ? "0" : ""}${s}s`;
}
