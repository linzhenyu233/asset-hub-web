<script setup lang="ts">
import { computed } from 'vue'
import BaseIcon from './BaseIcon.vue'

const props = defineProps<{
  page: number
  pageSize: number
  total: number
}>()

const emit = defineEmits<{ (e: 'update:page', value: number): void }>()

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const from = computed(() => (props.total === 0 ? 0 : (props.page - 1) * props.pageSize + 1))
const to = computed(() => Math.min(props.page * props.pageSize, props.total))

const pageItems = computed<(number | 'gap')[]>(() => {
  const tp = totalPages.value
  const cur = props.page
  if (tp <= 7) return Array.from({ length: tp }, (_, i) => i + 1)

  const result: (number | 'gap')[] = [1]
  const start = Math.max(2, cur - 1)
  const end = Math.min(tp - 1, cur + 1)
  if (start > 2) result.push('gap')
  for (let i = start; i <= end; i += 1) result.push(i)
  if (end < tp - 1) result.push('gap')
  result.push(tp)
  return result
})

function go(page: number) {
  if (page < 1 || page > totalPages.value || page === props.page) return
  emit('update:page', page)
}
</script>

<template>
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3">
    <p class="text-caption text-neutral-500">
      显示第 {{ from }} - {{ to }} 条，共 {{ total }} 条
      <span class="mx-1 text-neutral-300">·</span>
      每页 {{ pageSize }} 条
    </p>

    <div class="flex items-center gap-1">
      <button
        type="button"
        class="w-8 h-8 inline-flex items-center justify-center rounded-control border border-neutral-200 bg-neutral-0 text-neutral-600
          transition-colors duration-fast hover:bg-neutral-50 disabled:text-neutral-400 disabled:cursor-not-allowed"
        :disabled="page <= 1"
        aria-label="上一页"
        @click="go(page - 1)"
      >
        <BaseIcon name="chevron-left" :size="16" />
      </button>

      <template v-for="(item, index) in pageItems" :key="`${item}-${index}`">
        <span v-if="item === 'gap'" class="w-8 h-8 inline-flex items-center justify-center text-caption text-neutral-400">
          …
        </span>
        <button
          v-else
          type="button"
          class="w-8 h-8 inline-flex items-center justify-center rounded-control text-caption transition-colors duration-fast"
          :class="
            item === page
              ? 'bg-brand-500 text-white'
              : 'bg-neutral-0 border border-neutral-200 text-neutral-700 hover:bg-neutral-50'
          "
          @click="go(item)"
        >
          {{ item }}
        </button>
      </template>

      <button
        type="button"
        class="w-8 h-8 inline-flex items-center justify-center rounded-control border border-neutral-200 bg-neutral-0 text-neutral-600
          transition-colors duration-fast hover:bg-neutral-50 disabled:text-neutral-400 disabled:cursor-not-allowed"
        :disabled="page >= totalPages"
        aria-label="下一页"
        @click="go(page + 1)"
      >
        <BaseIcon name="chevron-right" :size="16" />
      </button>
    </div>
  </div>
</template>
