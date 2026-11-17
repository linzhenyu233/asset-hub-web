<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { assetApi } from '../../api'
import { triggerDownload } from '../../api/client'
import { makeRequestId } from '../../composables/useUpload'
import { useBatchPreviews } from '../../composables/useBatchPreviews'
import { useToast } from '../../composables/useToast'
import type { Asset } from '../../api/types'
import { THUMB_AUTO_MAX_BYTES } from '../../utils/asset'
import { assetTypeLabel, formatBytes } from '../../utils/format'
import AssetPreviewModal from './AssetPreviewModal.vue'
import BaseIcon from './BaseIcon.vue'

const props = withDefaults(
  defineProps<{
    asset: Asset
    compact?: boolean
    /** 管理员可对未解包的旧 ZIP 素材包 / 活动包触发解包 */
    canUnpack?: boolean
    unpacking?: boolean
    /** 是否为子素材申请预览票据显示封面（需管理员预览权限） */
    showThumbnails?: boolean
    /** 是否允许点击子素材放大预览（需管理员预览权限） */
    previewable?: boolean
  }>(),
  { compact: false, canUnpack: false, unpacking: false, showThumbnails: false, previewable: false },
)

const emit = defineEmits<{ (event: 'unpack'): void }>()

const { success, error: toastError } = useToast()

const children = computed<Asset[]>(() => props.asset.children ?? [])
const totalSize = computed(() => children.value.reduce((sum, item) => sum + item.fileSize, 0))
const downloadingId = ref('')

/** 包内缩略图：子素材是独立素材，走批量预览票据（一次请求拿全部） */
const {
  thumbs,
  frames,
  load: loadThumbs,
  loadOne: loadThumbOne,
  reset: resetThumbs,
  markBroken,
  kindOf,
  revealFrame,
  markLoaded,
  isLoaded,
  showPlaceholder,
} = useBatchPreviews()

function ensureThumb(child: Asset) {
  if (thumbs.value[child.assetId]) return
  if (child.assetType === 'VIDEO' || child.fileSize > THUMB_AUTO_MAX_BYTES) {
    void loadThumbOne(child)
  }
}

watch(
  () => children.value.map((child) => child.assetId).join(','),
  () => {
    if (!props.showThumbnails || children.value.length === 0) {
      resetThumbs()
      return
    }
    // v2.11.0 的预览接口直接返回 240px 缩略图，包内素材可以整批加载
    loadThumbs(children.value)
  },
  { immediate: true },
)

/** 子素材放大预览：弹窗按需申请自己那份预览票据 */
const previewOpen = ref(false)
const previewId = ref('')
const previewTitle = ref('')

function openPreview(child: Asset) {
  if (!props.previewable || child.status !== 'PUBLISHED') return
  previewTitle.value = child.name
  previewId.value = child.assetId
  previewOpen.value = true
}

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
  downloadingId.value = child.assetId
  try {
    const result = await assetApi.download(child.assetId, { requestId: makeRequestId('download') })
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

    <!-- 空：旧 ZIP 包未解包，或 ZIP 内没有可预览的图片/视频 -->
    <div
      v-if="children.length === 0"
      class="mt-3 rounded-control border border-dashed border-neutral-200 bg-neutral-25 px-4 py-5 text-center"
    >
      <div class="mx-auto w-10 h-10 rounded-control bg-neutral-100 text-neutral-400 flex items-center justify-center">
        <BaseIcon name="folder" :size="20" />
      </div>
      <p class="mt-2 text-caption font-medium text-neutral-700">
        {{ canUnpack ? '该 ZIP 包还没有解包' : '暂无包内素材' }}
      </p>
      <p class="mt-1 text-micro text-neutral-400 leading-[16px]">
        {{
          canUnpack
            ? '解包会被 ZIP 内的图片、视频提取为独立素材，可单独预览与下载；原始 ZIP 仍保留。'
            : 'ZIP 内没有可预览的图片或视频，原始压缩包仍可下载。'
        }}
      </p>
      <button
        v-if="canUnpack"
        type="button"
        class="btn btn-secondary btn-sm mt-3"
        :disabled="unpacking"
        @click="emit('unpack')"
      >
        <BaseIcon :name="unpacking ? 'refresh' : 'folder'" :size="14" :class="unpacking ? 'animate-spin' : ''" />
        {{ unpacking ? '正在解包…' : '解包' }}
      </button>
    </div>

    <!-- 紧凑列表：任务详情侧栏 -->
    <div v-else-if="compact" class="mt-3 space-y-2">
      <div
        v-for="child in children"
        :key="child.assetId"
        class="flex items-center gap-2 rounded-control border border-neutral-100 px-2.5 py-2"
        @mouseenter="ensureThumb(child)"
      >
        <div
          class="relative w-8 h-8 shrink-0 rounded-sm overflow-hidden flex items-center justify-center text-white/90"
          :class="thumbClass(child)"
        >
          <BaseIcon v-if="showPlaceholder(child.assetId, kindOf(child))" :name="iconOf(child)" :size="16" />
          <img
            v-if="thumbs[child.assetId] && kindOf(child) === 'IMAGE'"
            :src="thumbs[child.assetId]"
            :alt="child.name"
            class="absolute inset-0 w-full h-full object-cover bg-white"
            :class="isLoaded(child.assetId) ? 'animate-fade-in' : 'opacity-0'"
            loading="lazy"
            decoding="async"
            fetchpriority="low"
            @load="markLoaded(child.assetId)"
            @error="markBroken(child.assetId)"
          />
          <video
            v-else-if="thumbs[child.assetId] && kindOf(child) === 'VIDEO'"
            :src="thumbs[child.assetId]"
            class="absolute inset-0 w-full h-full object-cover bg-neutral-900 transition-opacity duration-200"
            :class="frames[child.assetId] ? 'opacity-100' : 'opacity-0'"
            muted
            playsinline
            preload="metadata"
            @loadeddata="revealFrame(child.assetId, $event)"
            @error="markBroken(child.assetId)"
          />
          <button
            v-if="previewable"
            type="button"
            class="absolute inset-0 cursor-zoom-in"
            :title="child.status === 'PUBLISHED' ? `预览 ${child.name}` : '已下架'"
            :aria-label="`预览 ${child.name}`"
            @click="openPreview(child)"
          />
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
          :disabled="downloadingId === child.assetId || child.status !== 'PUBLISHED'"
          :title="child.status === 'PUBLISHED' ? `下载 ${child.name}` : '已下架'"
          @click="download(child)"
        >
          <svg
            v-if="downloadingId === child.assetId"
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
        :key="child.assetId"
        class="rounded-card border border-neutral-100 overflow-hidden bg-neutral-0"
        @mouseenter="ensureThumb(child)"
      >
        <div
          class="relative aspect-[4/3] flex items-center justify-center overflow-hidden group"
          :class="thumbClass(child)"
        >
          <!-- 占位图标垫在图片下面，图片淡入时自然盖住它，不会出现空白帧 -->
          <BaseIcon
            v-if="showPlaceholder(child.assetId, kindOf(child))"
            :name="iconOf(child)"
            :size="28"
            :stroke-width="1.2"
            class="text-white/85"
          />
          <img
            v-if="thumbs[child.assetId] && kindOf(child) === 'IMAGE'"
            :src="thumbs[child.assetId]"
            :alt="child.name"
            class="absolute inset-0 w-full h-full object-contain bg-white"
            :class="isLoaded(child.assetId) ? 'animate-fade-in' : 'opacity-0'"
            loading="lazy"
            decoding="async"
            fetchpriority="low"
            @load="markLoaded(child.assetId)"
            @error="markBroken(child.assetId)"
          />
          <video
            v-else-if="thumbs[child.assetId] && kindOf(child) === 'VIDEO'"
            :src="thumbs[child.assetId]"
            class="absolute inset-0 w-full h-full object-cover bg-neutral-900 transition-opacity duration-200"
            :class="frames[child.assetId] ? 'opacity-100' : 'opacity-0'"
            muted
            playsinline
            preload="metadata"
            @loadeddata="revealFrame(child.assetId, $event)"
            @error="markBroken(child.assetId)"
          />
          <span
            v-if="child.assetType === 'VIDEO'"
            class="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-pill bg-neutral-900/60 px-1.5 py-0.5 text-[10px] leading-[12px] text-white"
          >
            <BaseIcon name="video" :size="10" />
            视频
          </span>
          <button
            v-if="previewable"
            type="button"
            class="absolute inset-0 z-10 cursor-zoom-in"
            :title="child.status === 'PUBLISHED' ? `预览 ${child.name}` : '已下架'"
            :aria-label="`预览 ${child.name}`"
            @click="openPreview(child)"
          >
            <span
              class="absolute inset-0 flex items-center justify-center bg-neutral-900/35 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
            >
              <span class="w-8 h-8 rounded-pill bg-white/90 text-neutral-700 flex items-center justify-center shadow-sm">
                <BaseIcon name="eye" :size="16" />
              </span>
            </span>
          </button>
        </div>
        <div class="px-3 py-2">
          <p class="text-[12px] font-medium text-neutral-900 truncate" :title="child.name">{{ child.name }}</p>
          <p class="mt-0.5 text-micro text-neutral-500">
            {{ assetTypeLabel(child.assetType) }} · {{ formatBytes(child.fileSize) }}
          </p>
          <button
            type="button"
            class="btn btn-secondary btn-sm w-full mt-2"
            :disabled="downloadingId === child.assetId || child.status !== 'PUBLISHED'"
            @click="download(child)"
          >
            <svg
              v-if="downloadingId === child.assetId"
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

    <!-- 子素材放大预览：票据由弹窗按子素材 ID 自行申请 -->
    <AssetPreviewModal
      :open="previewOpen"
      :asset-id="previewId"
      :title="previewTitle"
      @close="previewOpen = false"
    />
  </div>
</template>
