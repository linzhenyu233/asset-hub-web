<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'dark' | 'white'
    size?: number
  }>(),
  { variant: 'dark', size: 28 },
)
</script>

<template>
  <img
    :src="variant === 'white' ? '/brand/logo-symbol-white.png' : '/brand/logo-symbol-dark.png'"
    :alt="'钻石世家'"
    :width="size"
    :height="size"
    class="object-contain select-none"
    draggable="false"
  />
</template>
