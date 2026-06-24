import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

import routes from '../.generated/vue-routes.ts'

createRouter({
  history: createWebHistory(),
  routes: routes as RouteRecordRaw[],
})
