<script lang="ts">
export const meta = { title: 'Home' }
</script>

<script setup lang="ts">
import DemoPage from '../components/DemoPage.vue'
</script>

<template>
  <DemoPage
    title="Home"
    lead="index.vue 映射为根路径 /。meta 写入 routes.ts 的 meta 字段。"
    :badges="[
      { label: '文件', value: 'pages/index.vue' },
      { label: '加载', value: 'component: () => import(...)' },
    ]"
    code="pages/index.vue  +  export const meta = { title: 'Home' }"
  />
</template>
