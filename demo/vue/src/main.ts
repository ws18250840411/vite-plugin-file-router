import { createApp, type App } from 'vue'
import { createRouter, createWebHistory, type Router } from 'vue-router'
import AppComponent from './App.vue'
import routeTable from './routes'
import './demo.css'

let app: App<Element> | null = null
let router: Router | null = null

function mount(nextRoutes = routeTable) {
  if (app) app.unmount()

  app = createApp(AppComponent)
  router = createRouter({
    history: createWebHistory(),
    routes: nextRoutes,
  })
  app.use(router).mount('#app')
}

mount()

if (import.meta.hot) {
  import.meta.hot.accept('./routes', (next) => {
    if (!next) return
    mount(next.default)
  })
}
