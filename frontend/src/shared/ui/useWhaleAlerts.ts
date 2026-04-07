/**
 * useWhaleAlerts — watches whale_alert_count from WS tick,
 * fires a toast whenever a followed whale makes a significant trade.
 */
import { useRef, useEffect } from "react";
import { useToast } from "./ToastProvider";

export function useWhaleAlerts(whaleAlertCount: number) {
  const { addToast } = useToast();
  const prevCountRef = useRef(whaleAlertCount);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      prevCountRef.current = whaleAlertCount;
      return;
    }
    if (whaleAlertCount > prevCountRef.current) {
      const delta = whaleAlertCount - prevCountRef.current;
      prevCountRef.current = whaleAlertCount;

      addToast({
        type: "whale",
        title: "Followed Whale Alert",
        message: `${delta} new high-value trade${delta > 1 ? "s" : ""} detected from followed wallets`,
        duration: 8000,
      });
    }
  }, [whaleAlertCount, addToast]);
}
