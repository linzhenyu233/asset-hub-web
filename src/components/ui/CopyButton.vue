<script setup lang="ts">
import { useToast } from '../../composables/useToast'
import { copyText } from '../../utils/clipboard'
import BaseIcon from './BaseIcon.vue'

/** 复制一段文字（编号之类的）到剪贴板，附带成功/失败提示 */
const props = withDefaults(
  defineProps<{
    value: string
    /** 提示文案里用的名字，例如「素材编号」 */
    label?: string
    size?: number
  }>(),
  { label: '编号', size: 12 },
)

const { success, error: toastError } = useToast()

async function copy(): Promise<void> {
  if (!props.value) return
  try {
    await copyText(props.value)
    success(`已复制${props.label}`)
  } catch {
    toastError('复制失败，请手动选中复制')
  }
}
</script>

<template>
  <button
    type="button"
    class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-xs text-neutral-400 transition-colors
      hover:bg-neutral-100 hover:text-brand-600"
    :title="`复制${label}`"
    :aria-label="`复制${label}`"
    @click="copy"
  >
    <BaseIcon name="copy" :size="size" />
  </button>
</template>
