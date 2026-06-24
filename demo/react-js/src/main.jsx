import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'

import routes from './routes.js'

const router = createBrowserRouter(routes)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)

if (import.meta.hot) {
  import.meta.hot.accept('./routes.js', (next) => {
    if (!next) return
    const nextRouter = createBrowserRouter(next.default)
    createRoot(document.getElementById('root')).render(
      <StrictMode>
        <RouterProvider router={nextRouter} />
      </StrictMode>,
    )
  })
}
