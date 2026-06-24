<script setup lang="ts">
import DemoPage from '../components/DemoPage.vue'
</script>

<template>
  <DemoPage
    title="Legal"
    lead="legal.sync.vue 使用 .sync 后缀，routes.ts 顶部静态 import 后 component: LegalPage。"
    :badges="[
      { label: '文件', value: 'pages/legal.sync.vue' },
      { label: '加载', value: 'sync' },
    ]"
    code="import LegalPage from './pages/legal.sync.vue'"
  />
</template>
