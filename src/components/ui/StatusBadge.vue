<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  status: string
  label?: string
}>()

const MAP: Record<string, { cls: string; text: string }> = {
  DRAFT: { cls: 'badge-neutral', text: '草稿' },
  PUBLISHED: { cls: 'badge-published', text: '已上架' },
  OFFLINE: { cls: 'badge-offline', text: '已下架' },
  CLAIMABLE: { cls: 'badge-claimable', text: '待领取' },
  CLAIMED: { cls: 'badge-claimed', text: '已领取' },
  FAILED: { cls: 'badge-failed', text: '失败' },
  SUCCESS: { cls: 'badge-claimed', text: '成功' },
  COMMITTED: { cls: 'badge-claimed', text: '已完成' },
  FILE_READY: { cls: 'badge-brand', text: '文件就绪' },
  INIT: { cls: 'badge-neutral', text: '待上传' },
  UPLOADING: { cls: 'badge-downloading', text: '上传中' },
  ACTIVE: { cls: 'badge-success', text: '已启用' },
  DISABLED: { cls: 'badge-neutral', text: '已停用' },
}

const meta = computed(() => MAP[props.status] ?? { cls: 'badge-neutral', text: props.status })

// 状态必须带文字，不单独依赖颜色（色盲友好）
</script>

<template>
  <span class="badge" :class="meta.cls">{{ label || meta.text }}</span>
</template>
