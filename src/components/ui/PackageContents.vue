<script setup lang="ts">
import { computed, ref } from 'vue'
import { assetApi } from '../../api'
import { triggerDownload } from '../../api/client'
import { makeRequestId } from '../../composables/useUpload'
import { useToast } from '../../composables/useToast'
import type { Asset } from '../../api/types'
import { assetTypeLabel, formatBytes } from '../../utils/format'
import BaseIcon from './BaseIcon.vue'

const props = withDefaults(
  defineProps<{
    asset: Asset
    compact?: boolean
  }>(),
  { compact: false },
)

const { success, error: toastError } = useToast()

const children = computed<Asset[]>(() => props.asset.children ?? [])
const totalSize = computed(() => children.value.reduce((sum, item) => sum + item.fileSize, 0))
const downloadingId = ref('')

function iconOf(child: Asset): string {
  if (child.assetType === 'IMAGE') return 'image'
  if (child.assetType === 'VIDEO') return 'video'
  return 'folder'
}

function thumbClass(child: Asset): string {
  return child.assetType === 'IMAGE' ? 'bg-thumb-rose' : 'bg-thumb-gold'
}

async function download(child: Asset) {
  if (downloadingId.value || child.status !== 'PUBLISHED') return
  downloadingId.value = child.id
  try {
    const result = await assetApi.download(child.id, { requestId: makeRequestId('download') })
    triggerDownload(result.url, result.filename)
    success('已开始下载')
  } catch (error) {
    toastError(error instanceof Error ? error.message : '下载失败，请重试')
  } finally {
    downloadingId.value = ''
  }
}
</script>

<template>
  <div>
    <!-- 标题（紧凑模式只显示统计） -->
    <div v-if="!compact" class="flex items-start gap-3">
      <div class="w-10 h-10 shrink-0 rounded-control bg-thumb-gold text-white flex items-center justify-center">
        <BaseIcon name="folder" :size="20" />
      </div>
      <div class="min-w-0">
        <h2 class="section-title">素材包内容</h2>
        <p class="mt-1 text-caption text-neutral-500">
          共 {{ children.length }} 个素材
          <template v-if="totalSize > 0"> · {{ formatBytes(totalSize) }}</template>
        </p>
      </div>
    </div>
    <p v-else class="text-micro text-neutral-500">
      共 {{ children.length }} 个素材
      <template v-if="totalSize > 0"> · {{ formatBytes(totalSize) }}</template>
    </p>

    <!-- 空：后端尚未返回子素材 -->
    <div
      v-if="children.length === 0"
      class="mt-3 rounded-control border border-dashed border-neutral-200 bg-neutral-25 px-4 py-5 text-center"
    >
      <div class="mx-auto w-10 h-10 rounded-control bg-neutral-100 text-neutral-400 flex items-center justify-center">
        <BaseIcon name="folder" :size="20" />
      </div>
      <p class="mt-2 text-caption font-medium text-neutral-700">暂无包内素材</p>
      <p class="mt-1 text-micro text-neutral-400 leading-[16px]">
        需要后端在素材详情中返回子素材清单（如 children 字段），这里会自动展示并支持逐个下载。
      </p>
    </div>

    <!-- 紧凑列表：任务详情侧栏 -->
    <div v-else-if="compact" class="mt-3 space-y-2">
      <div
        v-for="child in children"
        :key="child.id"
        class="flex items-center gap-2 rounded-control border border-neutral-100 px-2.5 py-2"
      >
        <div
          class="w-8 h-8 shrink-0 rounded-sm flex items-center justify-center text-white/90"
          :class="thumbClass(child)"
        >
          <BaseIcon :name="iconOf(child)" :size="16" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-[12px] font-medium text-neutral-900 truncate" :title="child.name">{{ child.name }}</p>
          <p class="mt-0.5 text-micro text-neutral-500">
            {{ assetTypeLabel(child.assetType) }} · {{ formatBytes(child.fileSize) }}
          </p>
        </div>
        <button
          type="button"
          class="w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-control text-neutral-500
            hover:bg-neutral-100 hover:text-brand-600 transition-colors disabled:text-neutral-300 disabled:hover:bg-transparent"
          :disabled="downloadingId === child.id || child.status !== 'PUBLISHED'"
          :title="child.status === 'PUBLISHED' ? `下载 ${child.name}` : '已下架'"
          @click="download(child)"
        >
          <svg
            v-if="downloadingId === child.id"
            class="animate-spin"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
          >
            <path d="M12 3a9 9 0 1 0 9 9" />
          </svg>
          <BaseIcon v-else name="download" :size="16" />
        </button>
      </div>
    </div>

    <!-- 网格：素材详情主区域 -->
    <div v-else class="mt-4 grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
      <div
        v-for="child in children"
        :key="child.id"
        class="rounded-card border border-neutral-100 overflow-hidden bg-neutral-0"
      >
        <div class="aspect-[4/3] flex items-center justify-center" :class="thumbClass(child)">
          <BaseIcon :name="iconOf(child)" :size="28" :stroke-width="1.2" class="text-white/85" />
        </div>
        <div class="px-3 py-2">
          <p class="text-[12px] font-medium text-neutral-900 truncate" :title="child.name">{{ child.name }}</p>
          <p class="mt-0.5 text-micro text-neutral-500">
            {{ assetTypeLabel(child.assetType) }} · {{ formatBytes(child.fileSize) }}
          </p>
          <button
            type="button"
            class="btn btn-secondary btn-sm w-full mt-2"
            :disabled="downloadingId === child.id || child.status !== 'PUBLISHED'"
            @click="download(child)"
          >
            <svg
              v-if="downloadingId === child.id"
              class="animate-spin"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
            >
              <path d="M12 3a9 9 0 1 0 9 9" />
            </svg>
            <BaseIcon v-else name="download" :size="14" />
            下载
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
