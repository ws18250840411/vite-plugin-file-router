import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import type { RouteObject } from 'react-router-dom'
import routes from './routes'

function createAppRouter() {
  return createBrowserRouter(routes as RouteObject[])
}

let router = createAppRouter()
const root = createRoot(document.getElementById('root')!)

function render() {
  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )
}

render()

if (import.meta.hot) {
  import.meta.hot.accept('./routes', (next) => {
    if (!next) return
    router = createBrowserRouter(next.default as RouteObject[])
    render()
  })
}
