<script lang="ts">
export const meta = { title: 'About' }
</script>

<script setup lang="ts">
import DemoPage from '../components/DemoPage.vue'
</script>

<template>
  <DemoPage
    title="About"
    lead="about.vue → /about。Vue 侧懒加载统一为 component: () => import('...')。"
    :badges="[
      { label: '文件', value: 'pages/about.vue' },
      { label: 'meta', value: 'title: About' },
    ]"
  />
</template>
