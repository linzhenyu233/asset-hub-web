<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { adminAssetApi } from '../../api'
import { ApiError, resolveFileUrl } from '../../api/client'
import type { AdminAsset } from '../../api/types'
import { useAssetPreview } from '../../composables/useAssetPreview'
import { useToast } from '../../composables/useToast'
import { assetTypeLabel, categoryLabel, formatBytes, formatDateTime } from '../../utils/format'
import BaseIcon from '../../components/ui/BaseIcon.vue'
import BaseModal from '../../components/ui/BaseModal.vue'
import EmptyState from '../../components/ui/EmptyState.vue'
import StatusBadge from '../../components/ui/StatusBadge.vue'
import PackageContents from '../../components/ui/PackageContents.vue'
import AssetPreviewModal from '../../components/ui/AssetPreviewModal.vue'

const route = useRoute()
const router = useRouter()
const { success, error: toastError } = useToast()

const asset = ref<AdminAsset | null>(null)
const loading = ref(true)
const errorMessage = ref('')
const assetId = String(route.params.id)
const previewOpen = ref(false)

/** 管理员可预览草稿与已下架素材，ZIP 包仍需下载 */
const canPreview = computed(() => asset.value !== null && asset.value.assetType !== 'ARCHIVE')

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

const confirm = reactive({ open: false, action: 'publish' as 'publish' | 'offline', submitting: false })
const deleteState = reactive({ open: false, submitting: false })
const unpacking = ref(false)

/**
 * v2.11.0 起 ZIP 素材包和活动包都能补解包，素材包不需要关联任务；
 * 只有还没有子素材的包才显示解包入口。
 */
const canUnpack = computed(
  () => asset.value?.assetType === 'ARCHIVE' && (asset.value.children?.length ?? 0) === 0,
)
/** 当前 ZIP 包是否属于「活动包」（CAMPAIGN 分类，由任务发布流程产生） */
const isCampaignPackage = computed(
  () => asset.value?.assetType === 'ARCHIVE' && asset.value.categoryCode === 'CAMPAIGN',
)
/**
 * 只有活动包必须通过任务发布流程上架；ZIP 素材包与普通素材一样可独立上架，
 * 子素材随父包状态生效（上架后可直接预览、下载，无需领取任务）。
 */
const publishBlocked = computed(
  () => isCampaignPackage.value && !asset.value?.taskId,
)

async function unpack() {
  if (!asset.value || unpacking.value || !canUnpack.value) return
  unpacking.value = true
  try {
    asset.value = await adminAssetApi.unpack(asset.value.id)
    const count = asset.value.children?.length ?? 0
    if (count > 0) success(`已解包 ${count} 个子素材`)
    else toastError('ZIP 内没有可提取的图片或视频')
  } catch (error) {
    if (error instanceof ApiError && error.status === 413) {
      toastError('压缩包内容过多或过大，超出解包限制')
    } else if (error instanceof ApiError && error.status === 409) {
      toastError('压缩包正在处理中，请稍后重试')
    } else if (error instanceof ApiError && error.status === 400) {
      toastError(error.message || '压缩包已损坏或包含不支持的文件')
    } else {
      toastError(error instanceof Error ? error.message : '解包失败，请重试')
    }
  } finally {
    unpacking.value = false
  }
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    asset.value = await adminAssetApi.detail(assetId)
    // 后端不返回文件直链，详情页主动申请一次短时预览票据用于内联展示
    if (asset.value.assetType !== 'ARCHIVE') loadPreview()
    else resetPreview()
  } catch (error) {
    asset.value = null
    resetPreview()
    if (error instanceof ApiError && error.status === 404) errorMessage.value = '素材不存在'
    else errorMessage.value = error instanceof Error ? error.message : '素材详情加载失败'
  } finally {
    loading.value = false
  }
}

function openConfirm(action: 'publish' | 'offline') {
  confirm.action = action
  confirm.open = true
}

async function submitConfirm() {
  if (!asset.value || confirm.submitting) return
  confirm.submitting = true
  try {
    if (confirm.action === 'publish') {
      await adminAssetApi.publish(asset.value.id)
      success('素材已上架')
    } else {
      await adminAssetApi.offline(asset.value.id)
      success('素材已下架')
    }
    confirm.open = false
    await load()
  } catch (error) {
    toastError(error instanceof Error ? error.message : '操作失败')
  } finally {
    confirm.submitting = false
  }
}

async function submitDelete() {
  if (!asset.value || deleteState.submitting) return
  deleteState.submitting = true
  try {
    await adminAssetApi.remove(asset.value.id)
    success('素材已删除')
    deleteState.open = false
    router.push('/admin/assets')
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      toastError(error.message || '素材已关联任务，请先下架而不删除')
    } else if (error instanceof ApiError && error.status === 404) {
      toastError('素材已不存在')
      router.push('/admin/assets')
    } else {
      toastError(error instanceof Error ? error.message : '删除失败，请重试')
    }
  } finally {
    deleteState.submitting = false
  }
}

onMounted(load)
</script>

<template>
  <!-- 内容宽度由路由 meta.wide 经 AppShell 统一控制，这里不要再加 mx-auto max-w -->
  <div class="animate-fade-up">
    <div class="flex items-center justify-between gap-3 mb-5">
      <button type="button" class="btn btn-secondary btn-sm" @click="router.push('/admin/assets')">
        <BaseIcon name="arrow-left" :size="16" />
        返回素材管理
      </button>
      <button v-if="asset" type="button" class="btn btn-secondary btn-sm" @click="load">
        <BaseIcon name="refresh" :size="16" />
        刷新
      </button>
    </div>

    <div v-if="loading" class="grid gap-5 lg:grid-cols-[1fr_400px] 3xl:grid-cols-[1fr_480px]">
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

    <div v-else class="grid gap-5 lg:grid-cols-[1fr_400px] 3xl:grid-cols-[1fr_480px] items-start">
      <section v-if="asset.assetType === 'ARCHIVE'" class="card p-5">
        <PackageContents
          :asset="asset"
          :can-unpack="canUnpack"
          :unpacking="unpacking"
          :show-thumbnails="true"
          :previewable="true"
          @unpack="unpack"
        />
        <div class="mt-4 pt-4 border-t border-neutral-100 space-y-2">
          <p class="text-micro text-neutral-500 leading-[16px]">
            <template v-if="isCampaignPackage">
              子素材随活动包上架 / 下架；员工须先领取关联任务才能下载包内文件。
            </template>
            <template v-else>
              子素材随素材包上架 / 下架；上架后可直接预览、下载，无需领取任务。
            </template>
          </p>
          <div class="flex items-center gap-3">
            <p class="text-micro text-neutral-400 truncate">原文件名：{{ asset.originalFilename }}</p>
            <button
              v-if="canUnpack"
              type="button"
              class="btn btn-secondary btn-sm shrink-0"
              :disabled="unpacking"
              @click="unpack"
            >
              <BaseIcon :name="unpacking ? 'refresh' : 'folder'" :size="14" :class="unpacking ? 'animate-spin' : ''" />
              {{ unpacking ? '解包中…' : '解包' }}
            </button>
          </div>
        </div>
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
              :name="asset.assetType === 'IMAGE' ? 'image' : asset.assetType === 'VIDEO' ? 'video' : 'archive'"
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
          <div class="min-w-0">
            <p class="text-caption text-neutral-500 truncate">原文件名：{{ asset.originalFilename }}</p>
            <p class="mt-1 text-micro text-neutral-400">{{ asset.mimeType }}</p>
          </div>
          <button v-if="canPreview" type="button" class="btn btn-ghost btn-sm shrink-0" @click="previewOpen = true">
            <BaseIcon name="eye" :size="14" />
            在线预览
          </button>
        </div>
      </section>

      <aside class="space-y-4">
        <div class="card p-5">
          <div class="flex items-start justify-between gap-3">
            <h1 class="min-w-0 break-words text-h2 font-bold text-neutral-900 leading-[28px]">{{ asset.name }}</h1>
            <StatusBadge :status="asset.status" />
          </div>
          <div class="mt-3 flex items-center gap-2 flex-wrap">
            <span class="badge badge-brand">{{ assetTypeLabel(asset.assetType) }}</span>
            <span class="badge badge-neutral">{{ categoryLabel(asset.categoryCode) }}</span>
          </div>

          <div class="mt-4 flex items-center gap-2">
            <button
              v-if="asset.status !== 'PUBLISHED'"
              type="button"
              class="btn btn-primary flex-1"
              :disabled="publishBlocked"
              :title="publishBlocked ? '活动包必须通过任务发布流程上架' : '上架素材'"
              @click="openConfirm('publish')"
            >
              <BaseIcon name="upload" :size="16" />
              上架素材
            </button>
            <button v-else type="button" class="btn btn-danger flex-1" @click="openConfirm('offline')">
              <BaseIcon name="archive" :size="16" />
              下架素材
            </button>
            <button
              type="button"
              class="btn btn-secondary"
              @click="router.push(`/assets/${asset.id}`)"
            >
              <BaseIcon name="external" :size="16" />
              员工视角
            </button>
          </div>

          <p v-if="publishBlocked" class="help-text text-left">
            该活动包未关联任务，需通过「上传活动包并发布任务」流程上架，无法单独上架。
          </p>

          <div v-if="canPreview" class="mt-2">
            <button type="button" class="btn btn-secondary w-full" @click="previewOpen = true">
              <BaseIcon name="eye" :size="16" />
              在线预览
            </button>
            <p class="help-text text-center">可预览草稿与已下架素材，不产生下载统计</p>
          </div>

          <div class="mt-4 pt-4 border-t border-neutral-100 flex items-center justify-between gap-3">
            <p class="text-micro text-neutral-400 leading-[16px]">删除后 OSS 文件不可恢复，历史记录保留</p>
            <button
              type="button"
              class="btn btn-secondary btn-sm shrink-0 text-feedback-danger hover:bg-feedback-danger-bg"
              @click="deleteState.open = true"
            >
              删除素材
            </button>
          </div>
        </div>

        <div class="card p-5">
          <h2 class="section-title">基础属性</h2>
          <dl class="mt-3 divide-y divide-neutral-100">
            <div class="flex items-start justify-between gap-4 py-2.5">
              <dt class="text-caption text-neutral-500 shrink-0">素材 ID</dt>
              <dd class="text-caption text-neutral-900 text-right font-mono">{{ asset.id }}</dd>
            </div>
            <div class="flex items-start justify-between gap-4 py-2.5">
              <dt class="text-caption text-neutral-500 shrink-0">文件大小</dt>
              <dd class="text-caption text-neutral-900 text-right">{{ formatBytes(asset.fileSize) }}</dd>
            </div>
            <div class="flex items-start justify-between gap-4 py-2.5">
              <dt class="text-caption text-neutral-500 shrink-0">上架时间</dt>
              <dd class="text-caption text-neutral-900 text-right">{{ formatDateTime(asset.publishedAt) }}</dd>
            </div>
            <div class="flex items-start justify-between gap-4 py-2.5">
              <dt class="text-caption text-neutral-500 shrink-0">关联任务</dt>
              <dd class="text-caption text-neutral-900 text-right">{{ asset.taskId ? `#${asset.taskId}` : '—' }}</dd>
            </div>
          </dl>
        </div>

      </aside>
    </div>

    <BaseModal
      :open="confirm.open"
      :title="confirm.action === 'publish' ? '上架素材' : '下架素材'"
      :description="
        confirm.action === 'publish'
          ? '上架后小程序里就能看到并下载该素材。'
          : '下架后员工将无法继续下载，已产生的下载记录不会回滚。'
      "
      :width="440"
      @close="confirm.open = false"
    >
      <template #footer>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="confirm.submitting" @click="confirm.open = false">
          取消
        </button>
        <button
          type="button"
          class="btn btn-sm"
          :class="confirm.action === 'publish' ? 'btn-primary' : 'btn-danger'"
          :disabled="confirm.submitting"
          @click="submitConfirm"
        >
          {{ confirm.submitting ? '处理中…' : '确认' }}
        </button>
      </template>
    </BaseModal>

    <AssetPreviewModal
      v-if="asset"
      :open="previewOpen"
      :asset-id="asset.id"
      :title="asset.name"
      :preview="preview"
      admin
      @close="previewOpen = false"
    />

    <!-- 删除确认 -->
    <BaseModal
      :open="deleteState.open"
      title="删除素材"
      description="删除会移除素材及其 OSS 文件，且不可恢复；上传、下载与审计历史会保留。已关联任务的素材无法删除，请改用下架。"
      :width="460"
      @close="deleteState.open = false"
    >
      <div v-if="asset" class="rounded-card bg-neutral-50 border border-neutral-100 px-4 py-3">
        <p class="text-body font-medium text-neutral-900 truncate">{{ asset.name }}</p>
        <p class="mt-1 text-micro text-neutral-500">
          #{{ asset.id }} · {{ formatBytes(asset.fileSize) }} · {{ asset.originalFilename }}
        </p>
      </div>

      <template #footer>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="deleteState.submitting"
          @click="deleteState.open = false"
        >
          取消
        </button>
        <button type="button" class="btn btn-danger btn-sm" :disabled="deleteState.submitting" @click="submitDelete">
          {{ deleteState.submitting ? '删除中…' : '确认删除' }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>
