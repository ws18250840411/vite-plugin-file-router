<script setup lang="ts">
defineProps<{
  title: string
  lead: string
  badges?: { label: string; value: string }[]
  code?: string
}>()
</script>

<template>
  <article class="demo-card">
    <h1>{{ title }}</h1>
    <p class="demo-lead">{{ lead }}</p>
    <div v-if="badges?.length" class="demo-badges">
      <span v-for="b in badges" :key="b.label" class="demo-badge">
        {{ b.label }}: <strong>{{ b.value }}</strong>
      </span>
    </div>
    <slot />
    <code v-if="code" class="demo-code">{{ code }}</code>
  </article>
</template>
