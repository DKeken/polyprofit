import { Suspense, lazy } from "react";

const Dashboard = lazy(() => import("./components/Dashboard"));

function App() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
          <div className="text-sm text-zinc-500">Loading dashboard…</div>
        </div>
      }
    >
      <Dashboard />
    </Suspense>
  );
}

export default App;
