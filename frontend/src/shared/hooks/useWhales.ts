import { useState, useEffect, useCallback } from "react";
import { whaleApi } from "../api";
import type { WhaleRow, WhaleEventRow } from "../api";

export type { WhaleRow, WhaleEventRow };

interface WhalesState {
  whales: WhaleRow[];
  activity: WhaleEventRow[];
  loading: boolean;
  error: string | null;
  lastRefreshed: Date | null;
}

const POLL_INTERVAL_MS = 5 * 60 * 1000;

export function useWhales() {
  const [state, setState] = useState<WhalesState>({
    whales: [],
    activity: [],
    loading: true,
    error: null,
    lastRefreshed: null,
  });

  const fetchAll = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const [whalesRes, activityRes] = await Promise.all([
        whaleApi.listWhales(),
        whaleApi.activity(),
      ]);
      setState({
        whales: whalesRes.whales,
        activity: activityRes.events,
        loading: false,
        error: null,
        lastRefreshed: new Date(),
      });
    } catch (e) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: e instanceof Error ? e.message : "Failed to load whale data",
      }));
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const timer = setInterval(fetchAll, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchAll]);

  const trackWhale = useCallback(
    async (address: string, displayName?: string) => {
      await whaleApi.track(address, displayName);
      await fetchAll();
    },
    [fetchAll],
  );

  const untrackWhale = useCallback(async (address: string) => {
    await whaleApi.untrack(address);
    setState((prev) => ({
      ...prev,
      whales: prev.whales.filter((w) => w.address !== address),
    }));
  }, []);

  const toggleFollow = useCallback(async (address: string) => {
    const res = await whaleApi.toggleFollow(address);
    setState((prev) => ({
      ...prev,
      whales: prev.whales.map((w) =>
        w.address === address ? { ...w, followed: res.followed } : w,
      ),
    }));
  }, []);

  const lookupWhale = useCallback(async (address: string) => {
    const res = await whaleApi.lookup(address);
    return res.whale;
  }, []);

  const pollWhales = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      await whaleApi.poll();
      await fetchAll();
    } catch (e) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: e instanceof Error ? e.message : "Poll failed",
      }));
    }
  }, [fetchAll]);

  return {
    ...state,
    refresh: fetchAll,
    trackWhale,
    untrackWhale,
    toggleFollow,
    lookupWhale,
    pollWhales,
  };
}
