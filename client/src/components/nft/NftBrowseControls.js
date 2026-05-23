import { motion } from "motion/react";

function Toggle({ active = false, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex cursor-pointer items-center gap-2.5"
    >
      <div
        className={`relative h-5 w-9 rounded-full transition-all duration-200 ${
          active ? "bg-indigo-600" : "bg-slate-800"
        }`}
      >
        <motion.div
          animate={{ x: active ? 20 : 4 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className="absolute top-1 h-3 w-3 rounded-full bg-white shadow-sm"
        />
      </div>
      <span
        className={`text-[11px] font-semibold transition-colors ${
          active ? "text-indigo-400" : "text-slate-500 group-hover:text-slate-400"
        }`}
      >
        {label}
      </span>
    </button>
  );
}

function FilterSelect({ label, value, onChange, options = [] }) {
  return (
    <label className="flex-1 min-w-[120px]">
      <span className="mb-2 block text-[11px] font-medium text-slate-500">
        {label}
      </span>
      <div className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full appearance-none rounded-xl border border-slate-800 bg-slate-950/50 px-3.5 py-3 text-xs font-semibold text-white outline-none transition-all focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/5"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-600">
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
    </label>
  );
}

export function NftBrowseControls({
  eyebrow,
  title,
  resultCount,
  searchLabel,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  standardValue,
  onStandardChange,
  standardOptions,
  sortValue,
  onSortChange,
  sortOptions,
  showHidden = false,
  onToggleHidden,
  showSpam = false,
  onToggleSpam,
}) {
  return (
    <div className="relative space-y-4 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-xl shadow-black/15">
      <div className="relative z-10 flex items-center justify-between gap-4">
        <div>
          <p className="mb-1 text-[11px] font-semibold text-indigo-300">
            {eyebrow}
          </p>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
        </div>
        <div className="rounded-full border border-slate-800 bg-slate-950/70 px-2.5 py-1">
          <span className="text-[11px] font-semibold text-slate-400">
            {resultCount}
          </span>
        </div>
      </div>

      <div className="relative z-10 space-y-4">
        <div className="relative group">
          <input
            type="text"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3.5 py-3.5 pr-10 text-sm font-medium text-white outline-none transition-all placeholder:text-slate-600 focus:border-indigo-500/50 focus:bg-slate-950 group-hover:border-slate-700"
          />
          <div className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-600 transition-colors group-focus-within:text-indigo-500">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
            </svg>
          </div>
        </div>

        <div className="flex gap-3">
          <FilterSelect
            label="Standard"
            value={standardValue}
            onChange={onStandardChange}
            options={standardOptions}
          />
          <FilterSelect
            label="Sort By"
            value={sortValue}
            onChange={onSortChange}
            options={sortOptions}
          />
        </div>

        <div className="flex flex-wrap items-center gap-5 border-t border-slate-800/50 pt-3">
          <Toggle
            active={showHidden}
            label="Show Hidden"
            onClick={onToggleHidden}
          />
          <Toggle
            active={showSpam}
            label="Show Spam"
            onClick={onToggleSpam}
          />
        </div>
      </div>
    </div>
  );
}
