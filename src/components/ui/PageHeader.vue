<script setup lang="ts">
// 页面标题统一由 AppShell 顶栏渲染；这里只把页面操作按钮传送到顶栏右侧。
defineProps<{
  title?: string
  subtitle?: string
}>()
</script>

<template>
  <Teleport to="#topbar-actions" defer>
    <slot name="actions" />
  </Teleport>
</template>
