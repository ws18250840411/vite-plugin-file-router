import DemoPage from '../components/DemoPage.jsx'

export const meta = { title: 'Home' }

export default function Home() {
  return (
    <DemoPage title="Home">
      <p data-testid="home-note">Pure JS demo · pages/index.jsx → routes.js</p>
    </DemoPage>
  )
}
