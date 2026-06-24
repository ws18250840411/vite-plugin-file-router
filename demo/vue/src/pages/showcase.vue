<route>
{
  "name": "showcase",
  "meta": { "title": "Showcase", "requiresAuth": true }
}
</route>

<script setup lang="ts">
import DemoPage from '../components/DemoPage.vue'
</script>

<template>
  <DemoPage
    title="Showcase"
    lead="&lt;route&gt; JSON 块在扫描时合并进 routes.ts；编译前需 Vite 插件剥离 SFC 中的 &lt;route&gt; 块。"
    :badges="[
      { label: '块', value: '&lt;route&gt; meta' },
      { label: 'requiresAuth', value: 'true' },
    ]"
    code='meta: { title: "Showcase", requiresAuth: true }'
  >
    <p data-testid="showcase-meta">Vue &lt;route&gt; block: requiresAuth = true</p>
  </DemoPage>
</template>
