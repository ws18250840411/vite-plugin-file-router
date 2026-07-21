import { createBrowserRouter } from 'react-router-dom'
import type { RouteObject } from 'react-router-dom'

import routes from '../.generated/react-routes.ts'

const root = routes[0]
if (!root.HydrateFallback || !root.ErrorBoundary) {
  throw new Error('expected root HydrateFallback and ErrorBoundary from pages/loading + pages/error')
}

// Route-object-level fallbacks are checked against current React Router types.
const _rr7Fields: Pick<RouteObject, 'HydrateFallback' | 'ErrorBoundary'> = {
  HydrateFallback: root.HydrateFallback as RouteObject['HydrateFallback'],
  ErrorBoundary: root.ErrorBoundary as RouteObject['ErrorBoundary'],
}

createBrowserRouter(routes)
