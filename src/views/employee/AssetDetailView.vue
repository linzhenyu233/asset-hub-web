<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { adminAssetApi, assetApi } from '../../api'
import { ApiError, resolveFileUrl, triggerDownload } from '../../api/client'
import type { AdminAsset } from '../../api/types'
import { useAssetPreview } from '../../composables/useAssetPreview'
import { makeRequestId } from '../../composables/useUpload'
import { useToast } from '../../composables/useToast'
import { assetTypeLabel, categoryLabel, formatBytes, formatDateTime } from '../../utils/format'
import BaseIcon from '../../components/ui/BaseIcon.vue'
import BrandMark from '../../components/ui/BrandMark.vue'
import EmptyState from '../../components/ui/EmptyState.vue'
import PackageContents from '../../components/ui/PackageContents.vue'
import AssetPreviewModal from '../../components/ui/AssetPreviewModal.vue'

const route = useRoute()
const router = useRouter()
const { success, error: toastError } = useToast()

const assetId = String(route.params.id)
const asset = ref<AdminAsset | null>(null)
const loading = ref(true)
const errorMessage = ref('')
const previewOpen = ref(false)
const downloading = ref(false)

const {
  preview,
  loading: previewLoading,
  errorMessage: previewError,
  load: loadPreview,
  reset: resetPreview,
} = useAssetPreview(() => assetId)

const inlineSrc = computed(() => (preview.value ? resolveFileUrl(preview.value.url) : ''))
const inlineIsImage = computed(() => preview.value?.mimeType.startsWith('image/') === true)
const inlineIsVideo = computed(() => preview.value?.mimeType.startsWith('video/') === true)
/** 大图解码完成：解码前保留渐变底色，解码后淡入，避免先白闪一下 */
const inlineImageReady = ref(false)
watch(inlineSrc, () => {
  inlineImageReady.value = false
})

/** 员工端只可见已上架素材，管理端预览时用提示区分 */
const isVisibleToEmployee = computed(() => asset.value?.status === 'PUBLISHED')
const statusText = computed(() => {
  if (!asset.value) return ''
  if (asset.value.status === 'PUBLISHED') return '已上架'
  return asset.value.status === 'DRAFT' ? '草稿' : '已下架'
})

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    asset.value = await adminAssetApi.detail(assetId)
    if (asset.value.assetType !== 'ARCHIVE') loadPreview()
    else resetPreview()
  } catch (error) {
    asset.value = null
    resetPreview()
    errorMessage.value =
      error instanceof ApiError && error.status === 404
        ? '素材不存在'
        : error instanceof Error
          ? error.message
          : '素材详情加载失败'
  } finally {
    loading.value = false
  }
}

async function download() {
  if (!asset.value || downloading.value || !isVisibleToEmployee.value) return
  downloading.value = true
  try {
    const result = await assetApi.download(asset.value.id, {
      requestId: makeRequestId('download'),
    })
    triggerDownload(result.url, result.filename)
    success('已开始下载')
  } catch (error) {
    toastError(error instanceof Error ? error.message : '下载失败，请重试')
  } finally {
    downloading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="min-h-screen bg-neutral-50">
    <!-- 员工端顶栏：与门店端视觉保持一致，额外提供返回管理端入口 -->
    <header class="h-topbar bg-neutral-0 border-b border-neutral-200">
      <div class="h-full w-full px-4 sm:px-10 flex items-center gap-3">
        <BrandMark variant="dark" :size="24" />
        <div class="min-w-0">
          <p class="text-[15px] font-bold text-neutral-900 leading-tight">素材中心</p>
          <p class="text-micro text-neutral-500 leading-tight">员工视角预览</p>
        </div>
        <span class="badge badge-warning shrink-0">预览模式</span>
        <div class="flex-1" />
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          @click="router.push(asset ? `/admin/assets/${asset.id}` : '/admin/assets')"
        >
          <BaseIcon name="arrow-left" :size="16" />
          返回管理端
        </button>
      </div>
    </header>

    <main class="max-w-content mx-auto px-4 sm:px-6 py-5">
      <div v-if="loading" class="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div class="card overflow-hidden"><div class="skeleton aspect-[4/3] w-full rounded-none" /></div>
        <div class="card p-5 space-y-3">
          <div class="skeleton h-5 w-2/3" />
          <div class="skeleton h-3 w-1/2" />
          <div class="skeleton h-10 w-full" />
        </div>
      </div>

      <div v-else-if="!asset" class="card">
        <EmptyState icon="alert" title="无法打开素材" :description="errorMessage">
          <template #action>
            <button type="button" class="btn btn-primary" @click="load">重试</button>
          </template>
        </EmptyState>
      </div>

      <template v-else>
        <!-- 员工不可见时的说明，帮助管理员判断上架状态 -->
        <div
          v-if="!isVisibleToEmployee"
          class="mb-4 rounded-card border border-feedback-warning bg-feedback-warning-bg px-4 py-3"
        >
          <p class="text-caption font-medium text-feedback-warning">
            该素材当前为「{{ statusText }}」，门店员工在素材发现中看不到它
          </p>
          <p class="mt-1 text-micro text-neutral-600 leading-[16px]">
            本页是管理端的预览视图；员工只能浏览并下载已上架的素材。
          </p>
        </div>

        <div class="grid gap-5 lg:grid-cols-[1fr_360px] items-start">
          <section v-if="asset.assetType === 'ARCHIVE'" class="card p-5">
            <PackageContents :asset="asset" />
            <p class="mt-4 pt-4 border-t border-neutral-100 text-micro text-neutral-500 leading-[16px]">
              包内图片、视频可单独下载；任务素材下架后包内素材同时不可访问。
              <template v-if="asset.taskId">请先在任务中心领取关联任务，再下载任务素材及包内文件。</template>
            </p>
          </section>

          <section v-else class="card overflow-hidden">
            <div
              class="relative aspect-[4/3] w-full overflow-hidden"
              :class="
                inlineSrc && inlineIsVideo
                  ? 'bg-neutral-900'
                  : inlineImageReady
                    ? 'bg-white'
                    : asset.assetType === 'IMAGE'
                      ? 'bg-thumb-rose'
                      : 'bg-thumb-gold'
              "
            >
              <img
                v-if="inlineSrc && inlineIsImage"
                :src="inlineSrc"
                :alt="asset.name"
                class="absolute inset-0 w-full h-full object-contain bg-white cursor-zoom-in"
                :class="inlineImageReady ? 'animate-fade-in' : 'opacity-0'"
                @load="inlineImageReady = true"
                @click="previewOpen = true"
              />
              <video
                v-else-if="inlineSrc && inlineIsVideo"
                :src="inlineSrc"
                class="absolute inset-0 w-full h-full object-contain bg-black"
                controls
                playsinline
                preload="metadata"
              />
              <div v-else class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/90">
                <BaseIcon
                  :name="asset.assetType === 'IMAGE' ? 'image' : 'video'"
                  :size="64"
                  :stroke-width="1.1"
                />
                <span class="text-caption text-white/80">
                  {{ assetTypeLabel(asset.assetType) }} · {{ formatBytes(asset.fileSize) }}
                </span>
                <span v-if="previewLoading" class="text-micro text-white/60">正在加载预览…</span>
                <span v-else-if="previewError" class="text-micro text-white/60">{{ previewError }}</span>
              </div>
            </div>
            <div class="px-5 py-4 flex items-center justify-between gap-4 border-t border-neutral-100">
              <p class="text-caption text-neutral-500 truncate">{{ asset.originalFilename }}</p>
              <button type="button" class="btn btn-ghost btn-sm shrink-0" @click="previewOpen = true">
                <BaseIcon name="eye" :size="14" />
                查看大图
              </button>
            </div>
          </section>

          <aside class="space-y-4">
            <div class="card p-5">
              <h1 class="text-h2 font-bold text-neutral-900 leading-[28px]">{{ asset.name }}</h1>
              <div class="mt-3 flex items-center gap-2 flex-wrap">
                <span class="badge badge-brand">{{ assetTypeLabel(asset.assetType) }}</span>
                <span class="badge badge-neutral">{{ categoryLabel(asset.categoryCode) }}</span>
                <span
                  class="badge"
                  :class="isVisibleToEmployee ? 'badge-success' : 'badge-neutral'"
                >
                  {{ statusText }}
                </span>
              </div>

              <button
                type="button"
                class="btn btn-primary w-full mt-4"
                :disabled="!isVisibleToEmployee || downloading"
                :title="isVisibleToEmployee ? '下载素材' : '素材未上架，员工无法下载'"
                @click="download"
              >
                <BaseIcon name="download" :size="16" />
                {{ downloading ? '准备下载…' : '下载素材' }}
              </button>
              <p class="help-text text-center">
                {{ isVisibleToEmployee ? '下载会计入门店员工的下载统计' : '仅已上架素材可下载' }}
              </p>
            </div>

            <div class="card p-5">
              <h2 class="section-title">素材信息</h2>
              <dl class="mt-3 divide-y divide-neutral-100">
                <div class="flex items-start justify-between gap-4 py-2.5">
                  <dt class="text-caption text-neutral-500 shrink-0">文件大小</dt>
                  <dd class="text-caption text-neutral-900 text-right">{{ formatBytes(asset.fileSize) }}</dd>
                </div>
                <div class="flex items-start justify-between gap-4 py-2.5">
                  <dt class="text-caption text-neutral-500 shrink-0">上架时间</dt>
                  <dd class="text-caption text-neutral-900 text-right">
                    {{ asset.publishedAt ? formatDateTime(asset.publishedAt) : '未上架' }}
                  </dd>
                </div>
                <div class="flex items-start justify-between gap-4 py-2.5">
                  <dt class="text-caption text-neutral-500 shrink-0">所属任务</dt>
                  <dd class="text-caption text-neutral-900 text-right">
                    {{ asset.taskId ? `#${asset.taskId}` : '—' }}
                  </dd>
                </div>
              </dl>
            </div>
          </aside>
        </div>
      </template>
    </main>

    <AssetPreviewModal
      v-if="asset"
      :open="previewOpen"
      :asset-id="asset.id"
      :title="asset.name"
      :preview="preview"
      admin
      @close="previewOpen = false"
    />
  </div>
</template>
