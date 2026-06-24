<template>
  <div class="demo-app" data-testid="root-layout">
    <aside class="demo-sidebar">
      <div class="demo-brand">
        vite-plugin-file-router
        <span>Vue Router demo</span>
      </div>
      <nav class="demo-nav" aria-label="Main">
        <router-link to="/">Home</router-link>
        <router-link to="/about">About</router-link>
        <router-link to="/legal">
          <span>Legal</span>
          <span class="demo-tag sync">sync</span>
        </router-link>
        <router-link to="/showcase">Showcase</router-link>
        <router-link to="/dashboard">Dashboard</router-link>
        <router-link to="/user/42">Profile</router-link>
        <router-link to="/missing-page">
          <span>404</span>
          <span class="demo-tag lazy">catch-all</span>
        </router-link>
      </nav>
    </aside>
    <main class="demo-main">
      <router-view />
    </main>
  </div>
</template>
