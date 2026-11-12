<script setup lang="ts">
import { computed, watch } from 'vue'
import { resolveFileUrl } from '../../api/client'
import type { PreviewResult } from '../../api/types'
import { useAssetPreview } from '../../composables/useAssetPreview'
import { formatBytes, formatDateTime } from '../../utils/format'
import BaseIcon from './BaseIcon.vue'
import BaseModal from './BaseModal.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    assetId: string
    title?: string
    /** 详情页已申请的票据，传入后不再重复请求 */
    preview?: PreviewResult | null
  }>(),
  { title: '', preview: null },
)

const emit = defineEmits<{ (e: 'close'): void }>()

const { preview: fetched, loading: fetching, errorMessage, load, reset } = useAssetPreview(
  () => props.assetId,
)

const preview = computed(() => props.preview ?? fetched.value)
const loading = computed(() => (props.preview ? false : fetching.value))
const src = computed(() => (preview.value ? resolveFileUrl(preview.value.url) : ''))
const isVideo = computed(() => preview.value?.mimeType.startsWith('video/') === true)
const isImage = computed(() => preview.value?.mimeType.startsWith('image/') === true)
const title = computed(() => props.title || '在线预览')

function close() {
  emit('close')
}

function openRaw() {
  if (!src.value) return
  window.open(src.value, '_blank', 'noopener')
}

watch(
  () => [props.open, props.assetId],
  ([open]) => {
    if (!open) {
      reset()
      return
    }
    if (!props.preview) load()
  },
)
</script>

<template>
  <BaseModal :open="open" :title="title" :width="760" @close="close">
    <div class="rounded-card overflow-hidden">
      <div v-if="loading" class="aspect-[16/10] w-full skeleton rounded-none bg-neutral-100" />

      <div
        v-else-if="errorMessage"
        class="aspect-[16/10] w-full flex flex-col items-center justify-center gap-3 px-6 text-center bg-neutral-900"
      >
        <BaseIcon name="alert" :size="32" class="text-white/70" :stroke-width="1.5" />
        <p class="text-caption text-white/80">{{ errorMessage }}</p>
        <button type="button" class="btn btn-secondary btn-sm" @click="load">
          <BaseIcon name="refresh" :size="14" />
          重试
        </button>
      </div>

      <!-- 图片用白底：珠宝素材多为透明 PNG，深色底会把主体衬成黑块 -->
      <img
        v-else-if="preview && isImage"
        :src="src"
        :alt="preview.filename"
        class="block w-full max-h-[62vh] object-contain mx-auto bg-white"
      />

      <video
        v-else-if="preview && isVideo"
        :src="src"
        class="block w-full max-h-[62vh] bg-black"
        controls
        playsinline
        preload="metadata"
      />

      <div
        v-else
        class="aspect-[16/10] w-full flex items-center justify-center text-caption text-white/70 bg-neutral-900"
      >
        暂不支持该文件类型的在线预览
      </div>
    </div>

    <div v-if="preview" class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-micro text-neutral-500">
      <span class="truncate max-w-[340px]">{{ preview.filename }}</span>
      <span>{{ preview.mimeType }}</span>
      <span>{{ formatBytes(preview.fileSize) }}</span>
      <span>票据有效至 {{ formatDateTime(preview.expiresAt) }}</span>
    </div>

    <template #footer>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="!preview" @click="openRaw">
        <BaseIcon name="external" :size="14" />
        新窗口打开
      </button>
      <button type="button" class="btn btn-primary btn-sm" @click="close">关闭</button>
    </template>
  </BaseModal>
</template>
