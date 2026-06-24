<template>
  <div data-testid="dashboard-layout">
    <div class="demo-badges" style="margin-bottom: 1rem">
      <span class="demo-badge">嵌套 <strong>dashboard/_layout.vue</strong></span>
    </div>
    <nav class="demo-subnav" aria-label="Dashboard">
      <router-link to="/dashboard">Overview</router-link>
      <router-link to="/dashboard/settings">Settings</router-link>
    </nav>
    <div style="margin-top: 1rem">
      <router-view />
    </div>
  </div>
</template>
