export function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="flex items-center justify-center h-full min-h-24 text-[11px] font-mono text-zinc-600 text-center px-4 py-8">
      {msg}
    </div>
  );
}
