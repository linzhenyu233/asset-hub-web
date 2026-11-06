<script setup lang="ts">
import BaseIcon from './BaseIcon.vue'

withDefaults(
  defineProps<{
    checked: boolean
    label?: string
  }>(),
  { label: '选择' },
)

const emit = defineEmits<{ (e: 'change', checked: boolean): void }>()
</script>

<template>
  <button
    type="button"
    role="checkbox"
    :aria-checked="checked"
    :aria-label="label"
    class="w-[18px] h-[18px] shrink-0 inline-flex items-center justify-center rounded-[5px] border
      transition-all duration-fast ease-standard
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
    :class="
      checked
        ? 'bg-brand-500 border-brand-500 text-white shadow-e1'
        : 'bg-neutral-0 border-neutral-300 text-transparent hover:border-brand-400 hover:bg-brand-50'
    "
    @click.stop="emit('change', !checked)"
  >
    <BaseIcon name="check" :size="12" :stroke-width="3" />
  </button>
</template>
