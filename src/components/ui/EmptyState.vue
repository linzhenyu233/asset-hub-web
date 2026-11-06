<script setup lang="ts">
import BaseIcon from './BaseIcon.vue'

withDefaults(
  defineProps<{
    icon?: string
    title: string
    description?: string
  }>(),
  { icon: 'inbox' },
)
</script>

<template>
  <div class="flex flex-col items-center justify-center text-center px-6 py-8">
    <div class="w-16 h-16 rounded-2xl bg-neutral-50 flex items-center justify-center text-neutral-400">
      <BaseIcon :name="icon" :size="32" :stroke-width="1.5" />
    </div>
    <h3 class="mt-4 text-h3 font-bold text-neutral-900">{{ title }}</h3>
    <p v-if="description" class="mt-2 max-w-sm text-caption text-neutral-500 leading-[18px]">
      {{ description }}
    </p>
    <div class="mt-6">
      <slot name="action" />
    </div>
  </div>
</template>
