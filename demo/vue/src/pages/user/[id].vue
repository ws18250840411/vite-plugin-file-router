<script lang="ts">
export const meta = { title: 'Profile' }
</script>

<script setup lang="ts">
import { useRoute } from 'vue-router'
import DemoPage from '../../components/DemoPage.vue'

const route = useRoute()
</script>

<template>
  <DemoPage
    title="Profile"
    lead="user/[id].vue 动态段 → /user/:id。可在侧栏点 Profile 或改地址栏 id。"
    :badges="[
      { label: '文件', value: 'pages/user/[id].vue' },
      { label: '当前 id', value: String(route.params.id) },
    ]"
  >
    <p data-testid="user-id">{{ route.params.id }}</p>
  </DemoPage>
</template>
