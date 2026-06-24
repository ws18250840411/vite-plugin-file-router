<script setup lang="ts">
import DemoPage from '../components/DemoPage.vue'
</script>

<template>
  <DemoPage
    title="Not Found"
    lead="not-found.vue → catch-all :pathMatch(.*)*"
    :badges="[{ label: '路由', value: ':pathMatch(.*)*' }]"
  />
</template>
