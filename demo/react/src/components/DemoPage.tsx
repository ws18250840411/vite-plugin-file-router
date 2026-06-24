import type { ReactNode } from 'react'

export type DemoBadge = { label: string; value: string }

export default function DemoPage({
  title,
  lead,
  badges,
  code,
  children,
}: {
  title: string
  lead: string
  badges?: DemoBadge[]
  code?: string
  children?: ReactNode
}) {
  return (
    <article className="demo-card">
      <h1>{title}</h1>
      <p className="demo-lead">{lead}</p>
      {badges && badges.length > 0 && (
        <div className="demo-badges">
          {badges.map((b) => (
            <span className="demo-badge" key={b.label}>
              {b.label}: <strong>{b.value}</strong>
            </span>
          ))}
        </div>
      )}
      {children}
      {code && <code className="demo-code">{code}</code>}
    </article>
  )
}
