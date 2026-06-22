export function Sidebar() {
  return (
    <aside className="sticky top-0 flex h-screen w-44 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2 px-4 py-4">
        <span className="text-xl">📊</span>
        <span className="text-base font-bold leading-tight tracking-tight">LabBudgeteer</span>
      </div>
      <p className="px-4 text-xs text-slate-400">Read-only YAML simulator</p>
    </aside>
  )
}
