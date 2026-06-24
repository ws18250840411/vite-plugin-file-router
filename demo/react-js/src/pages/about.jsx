import DemoPage from '../components/DemoPage.jsx'

export default function About() {
  return (
    <DemoPage title="About">
      <p data-testid="about-note">Lazy route from about.jsx</p>
    </DemoPage>
  )
}
