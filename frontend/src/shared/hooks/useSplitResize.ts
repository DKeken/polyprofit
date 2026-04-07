import { useState, useRef, useEffect, useCallback } from "react";


const MIN_PCT = 25;
const MAX_PCT = 75;

export function useSplitResize(storageKey: string, defaultPct = 45) {
  const stored = parseFloat(localStorage.getItem(storageKey) ?? "");
  const [leftPct, setLeftPct] = useState(
    Number.isFinite(stored) ? stored : defaultPct,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = Math.min(
        MAX_PCT,
        Math.max(MIN_PCT, ((e.clientX - rect.left) / rect.width) * 100),
      );
      setLeftPct(pct);
      localStorage.setItem(storageKey, String(pct));
    }
    function onUp() {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [storageKey]);

  return { leftPct, containerRef, onMouseDown };
}
