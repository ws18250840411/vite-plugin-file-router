<script setup lang="ts">
import DemoPage from '../../components/DemoPage.vue'
</script>

<template>
  <DemoPage
    title="Dashboard Home"
    lead="dashboard/index.vue 为 /dashboard 的默认子路由。"
    :badges="[{ label: 'URL', value: '/dashboard' }]"
  />
</template>
