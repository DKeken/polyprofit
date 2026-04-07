import { useWhales } from "../../shared/hooks/useWhales";
import WhaleTracker from "../../widgets/WhaleTracker";

export default function WhalesPage() {
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
  } = useWhales();

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <WhaleTracker
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
      />
    </div>
  );
}
