import { useBot } from "../../hooks/useBot";
import { useWhales } from "../../shared/hooks/useWhales";
import WhaleTracker from "../../widgets/WhaleTracker";
import { useRoute } from "wouter";

export default function WhalesPage() {
  const [match, params] = useRoute("/whales/:address");
  const selectedAddress = match ? params?.address : undefined;

  const { tick } = useBot();
  const {
    whales,
    activity,
    loading,
    error,
    lastRefreshed,
    refresh,
    trackWhale,
    untrackWhale,
    toggleFollow,
    lookupWhale,
    pollWhales,
    bulkAction,
  } = useWhales(tick.whale_events_count);

  return (
    <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
      <WhaleTracker
        selectedAddress={selectedAddress}
        whales={whales}
        activity={activity}
        loading={loading}
        error={error}
        lastRefreshed={lastRefreshed}
        onRefresh={refresh}
        onTrack={trackWhale}
        onUntrack={untrackWhale}
        onToggleFollow={toggleFollow}
        onLookup={lookupWhale}
        onPoll={pollWhales}
        onBulk={bulkAction}
      />
    </div>
  );
}
