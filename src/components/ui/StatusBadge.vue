<script setup lang="ts">
import { computed } from 'vue'
import { statusLabel } from '../../utils/format'

const props = defineProps<{
  status: string
  label?: string
}>()

/** 只定义配色，文案统一来自 utils/format 的 STATUS_LABEL */
const CLS: Record<string, string> = {
  DRAFT: 'badge-neutral',
  PUBLISHED: 'badge-published',
  OFFLINE: 'badge-offline',
  CLAIMABLE: 'badge-claimable',
  CLAIMED: 'badge-claimed',
  FAILED: 'badge-failed',
  SUCCESS: 'badge-claimed',
  COMMITTED: 'badge-claimed',
  FILE_READY: 'badge-brand',
  INIT: 'badge-neutral',
  UPLOADING: 'badge-downloading',
  ACTIVE: 'badge-success',
  DISABLED: 'badge-neutral',
}

const meta = computed(() => ({
  cls: CLS[props.status] ?? 'badge-neutral',
  text: statusLabel(props.status),
}))

// 状态必须带文字，不单独依赖颜色（色盲友好）
</script>

<template>
  <span class="badge" :class="meta.cls">{{ label || meta.text }}</span>
</template>
