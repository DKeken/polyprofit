/**
 * useWhaleAlerts — watches whale_alert_count from WS tick,
 * fires a toast whenever a followed whale makes a significant trade.
 *
 * Key design: we suppress the initial "catch-up" burst that happens
 * when the WS connects and sends the current cumulative count.
 * Only truly *new* increments (after the connection stabilises) trigger toasts.
 */
import { useRef, useEffect } from "react";
import { useToast } from "./ToastProvider";

export function useWhaleAlerts(whaleAlertCount: number) {
  const { addToast } = useToast();
  const prevCountRef = useRef<number | null>(null);
  const stabilisedRef = useRef(false);
  const stabiliseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // On the very first tick, record the baseline — don't alert.
    if (prevCountRef.current === null) {
      prevCountRef.current = whaleAlertCount;

      // Mark as "stabilised" after 3 seconds.
      // This gives the WS time to send the real count before we start tracking deltas.
      stabiliseTimerRef.current = setTimeout(() => {
        stabilisedRef.current = true;
        // Update baseline to whatever is current now
        prevCountRef.current = whaleAlertCount;
      }, 3000);
      return;
    }

    // Until stabilised, just track — don't alert
    if (!stabilisedRef.current) {
      prevCountRef.current = whaleAlertCount;
      return;
    }

    // After stabilisation, only alert on genuine increases
    if (whaleAlertCount > prevCountRef.current) {
      const delta = whaleAlertCount - prevCountRef.current;
      prevCountRef.current = whaleAlertCount;

      addToast({
        type: "whale",
        title: "Whale Alert",
        message: `${delta} new trade${delta > 1 ? "s" : ""} from followed wallets`,
        duration: 6000,
      });
    } else {
      prevCountRef.current = whaleAlertCount;
    }
  }, [whaleAlertCount, addToast]);

  // Cleanup stabilise timer
  useEffect(() => {
    return () => {
      if (stabiliseTimerRef.current) clearTimeout(stabiliseTimerRef.current);
    };
  }, []);
}
