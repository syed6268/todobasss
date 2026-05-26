import { NavLink } from 'react-router-dom'

const items = [
  { to: '/', label: 'Today', end: true },
  { to: '/goals', label: 'Milestones' },
  { to: '/calendar', label: 'Calendar' },
]

export default function MobileNav() {
  return (
    <nav className="sticky top-0 z-30 flex gap-1 border-b border-slate-200 bg-white px-3 py-2 md:hidden">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            [
              'flex flex-1 items-center justify-center rounded-md px-3 py-1.5 text-xs font-semibold transition',
              isActive ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50',
            ].join(' ')
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
