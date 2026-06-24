import { createBrowserRouter } from 'react-router-dom'
import type { RouteObject } from 'react-router-dom'

import routes from '../.generated/react-routes.ts'

createBrowserRouter(routes as RouteObject[])
