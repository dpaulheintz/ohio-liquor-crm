export default function EosDashboardPage() {
  return (
    <div className="px-8 py-10 text-white">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="font-serif text-3xl font-bold text-white">EOS Dashboard</h1>
          <p className="text-zinc-400 mt-1">Your EOS command center</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { emoji: '📊', label: 'Scorecard', href: '/eos/scorecard', desc: 'Weekly metrics vs goals' },
            { emoji: '🎯', label: 'Barrels', href: '/eos/barrels', desc: 'Quarterly rocks' },
            { emoji: '✅', label: 'To-Dos', href: '/eos/todos', desc: '7-day action items' },
            { emoji: '💡', label: 'Opportunities', href: '/eos/opportunities', desc: 'Issues to solve' },
            { emoji: '📰', label: 'Headlines', href: '/eos/headlines', desc: 'Good news & wins' },
            { emoji: '🤝', label: 'Meetings', href: '/eos/meetings', desc: 'Level 10 history' },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-xl border border-zinc-800 bg-[#111] px-5 py-5 flex flex-col gap-2 hover:border-zinc-600 hover:bg-zinc-900 transition-all"
            >
              <span className="text-3xl">{item.emoji}</span>
              <p className="font-semibold text-white text-sm">{item.label}</p>
              <p className="text-xs text-zinc-500">{item.desc}</p>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
