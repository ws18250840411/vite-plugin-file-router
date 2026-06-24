export default function DemoPage({ title, children }) {
  return (
    <section style={{ padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>{title}</h1>
      {children}
    </section>
  )
}
