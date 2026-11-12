<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { adminAssetApi, categoryApi } from '../../api'
import { ApiError } from '../../api/client'
import type { AdminAsset, BatchDeleteFailure, BatchDeleteResult, Category } from '../../api/types'
import { useBatchPreviews } from '../../composables/useBatchPreviews'
import { useToast } from '../../composables/useToast'
import { assetTypeLabel, categoryLabel, formatBytes, formatDateTime, storageLabel } from '../../utils/format'
import PageHeader from '../../components/ui/PageHeader.vue'
import BaseIcon from '../../components/ui/BaseIcon.vue'
import BaseModal from '../../components/ui/BaseModal.vue'
import EmptyState from '../../components/ui/EmptyState.vue'
import PaginationBar from '../../components/ui/PaginationBar.vue'
import SelectionCheckbox from '../../components/ui/SelectionCheckbox.vue'
import StatusBadge from '../../components/ui/StatusBadge.vue'

const router = useRouter()
const { success, error: toastError } = useToast()

const categories = ref<Category[]>([])
const items = ref<AdminAsset[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(15)
const loading = ref(true)
const errorMessage = ref('')
const actionId = ref('')

const filters = reactive({
  keyword: '',
  categoryCode: '',
  assetType: '',
  status: '',
  storageProvider: '',
})

const categoryDict = computed<Record<string, string>>(() =>
  Object.fromEntries(categories.value.map((item) => [item.code, item.name])),
)

const {
  thumbs,
  failures,
  frames,
  load: loadThumbs,
  reset: resetThumbs,
  markBroken,
  kindOf,
  revealFrame,
} = useBatchPreviews()

const hasFilter = computed(
  () =>
    Boolean(filters.keyword) ||
    Boolean(filters.categoryCode) ||
    Boolean(filters.assetType) ||
    Boolean(filters.status) ||
    Boolean(filters.storageProvider),
)

const confirmState = reactive({
  open: false,
  asset: null as AdminAsset | null,
  action: 'publish' as 'publish' | 'offline',
  submitting: false,
})

/* ---------------- 删除 ---------------- */

const selectedIds = ref<string[]>([])
const allSelected = computed(
  () => items.value.length > 0 && selectedIds.value.length === items.value.length,
)

function toggleAll(checked: boolean) {
  selectedIds.value = checked ? items.value.map((item) => item.id) : []
}

function toggleOne(id: string, checked: boolean) {
  const next = new Set(selectedIds.value)
  if (checked) next.add(id)
  else next.delete(id)
  selectedIds.value = [...next]
}

const del = reactive({
  open: false,
  ids: [] as string[],
  submitting: false,
  result: null as BatchDeleteResult | null,
})

const deleteFailed = computed<BatchDeleteFailure[]>(() => {
  if (!del.result) return []
  return del.result.items.filter((item): item is BatchDeleteFailure => 'error' in item)
})

function openDelete(ids: string[]) {
  if (ids.length === 0) return
  del.ids = [...ids]
  del.result = null
  del.submitting = false
  del.open = true
}

async function submitDelete() {
  if (del.submitting || del.ids.length === 0) return
  del.submitting = true
  try {
    const res = await adminAssetApi.batchDelete(del.ids)
    del.result = res
    if (res.successCount > 0) success(`已删除 ${res.successCount} 个素材`)
    if (res.failedCount > 0) {
      // 保留失败项用于按 ID 重试，先刷新列表去掉已删除项
      del.ids = res.items.filter((item) => 'error' in item).map((item) => item.assetId)
      if (res.successCount > 0) selectedIds.value = []
      await load()
      return
    }
    del.open = false
    selectedIds.value = []
    await load()
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      toastError('素材已不存在，列表将刷新')
      del.open = false
      await load()
    } else {
      toastError(error instanceof Error ? error.message : '删除失败，请重试')
    }
  } finally {
    del.submitting = false
  }
}

/* ---------------- 批量上架 / 下架（后端只有单条接口，前端并发调用） ---------------- */

const BATCH_CONCURRENCY = 4

const batch = reactive({
  open: false,
  action: 'publish' as 'publish' | 'offline',
  ids: [] as string[],
  submitting: false,
  done: 0,
  finished: false,
  failures: [] as { assetId: string; message: string }[],
})

const selectedAssets = computed(() =>
  items.value.filter((item) => selectedIds.value.includes(item.id)),
)
/** 未关联任务的活动包不能独立上架，必须走任务发布流程 */
function canPublish(asset: AdminAsset): boolean {
  if (asset.status === 'PUBLISHED') return false
  return !(asset.assetType === 'ARCHIVE' && !asset.taskId)
}

/** 批量上架只作用于未上架且可独立上架的素材，批量下架只作用于已上架 */
const publishableIds = computed(() =>
  selectedAssets.value.filter((item) => canPublish(item)).map((item) => item.id),
)
const offlineableIds = computed(() =>
  selectedAssets.value.filter((item) => item.status === 'PUBLISHED').map((item) => item.id),
)
/** 批量上架不可用时的说明：区分「都已上架」与「活动包需走任务发布」 */
const emptyPublishHint = computed(() => {
  const blockedArchive = selectedAssets.value.some(
    (item) => item.status !== 'PUBLISHED' && item.assetType === 'ARCHIVE' && !item.taskId,
  )
  if (blockedArchive) return '未关联任务的活动包需通过任务发布流程上架'
  return '所选素材均已上架'
})

function openBatch(action: 'publish' | 'offline') {
  const ids = action === 'publish' ? publishableIds.value : offlineableIds.value
  if (ids.length === 0 || batch.submitting) return
  batch.action = action
  batch.ids = [...ids]
  batch.done = 0
  batch.finished = false
  batch.failures = []
  batch.open = true
}

function batchMessage(error: unknown, id: string): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return `#${id} 素材已不存在`
    return error.message
  }
  return error instanceof Error ? error.message : '操作失败'
}

async function runBatch() {
  if (batch.submitting || batch.ids.length === 0) return
  batch.submitting = true
  batch.done = 0
  batch.failures = []
  batch.finished = false

  const queue = [...batch.ids]
  const total = queue.length
  const workers = Array.from({ length: Math.min(BATCH_CONCURRENCY, total) }, async () => {
    while (queue.length > 0) {
      const id = queue.shift()
      if (!id) break
      try {
        if (batch.action === 'publish') await adminAssetApi.publish(id)
        else await adminAssetApi.offline(id)
      } catch (error) {
        batch.failures.push({ assetId: id, message: batchMessage(error, id) })
      } finally {
        batch.done += 1
      }
    }
  })
  await Promise.all(workers)

  batch.submitting = false
  batch.finished = true

  const okCount = total - batch.failures.length
  const verb = batch.action === 'publish' ? '上架' : '下架'
  if (okCount > 0) {
    success(`已${verb} ${okCount} 个素材`)
    // 列表状态需要更新；失败项保留在弹窗里供重试
    await load()
  }
  if (batch.failures.length > 0) {
    toastError(`${batch.failures.length} 个素材${verb}失败，可在弹窗中重试`)
    return
  }
  batch.open = false
  selectedIds.value = []
}

function retryBatchFailures() {
  if (batch.submitting) return
  batch.ids = batch.failures.map((item) => item.assetId)
  runBatch()
}

/** 处理中不允许关闭弹窗，避免用户误以为已中断 */
function closeBatch() {
  if (batch.submitting) return
  batch.open = false
  if (batch.finished && batch.failures.length === 0) {
    selectedIds.value = []
    load()
  }
}

let keywordTimer: number | undefined

watch(
  () => [filters.categoryCode, filters.assetType, filters.status, filters.storageProvider],
  () => {
    page.value = 1
    load()
  },
)

watch(
  () => filters.keyword,
  () => {
    window.clearTimeout(keywordTimer)
    keywordTimer = window.setTimeout(() => {
      page.value = 1
      load()
    }, 380)
  },
)

watch(page, () => load())

async function load() {
  loading.value = true
  errorMessage.value = ''
  selectedIds.value = []
  try {
    const res = await adminAssetApi.list({
      page: page.value,
      pageSize: pageSize.value,
      keyword: filters.keyword.trim() || undefined,
      categoryCode: filters.categoryCode || undefined,
      assetType: filters.assetType || undefined,
      status: filters.status || undefined,
      storageProvider: filters.storageProvider || undefined,
    })
    items.value = res.items
    total.value = res.total
    loadThumbs(res.items)
  } catch (error) {
    items.value = []
    total.value = 0
    resetThumbs()
    errorMessage.value = error instanceof Error ? error.message : '素材加载失败'
  } finally {
    loading.value = false
  }
}

async function loadCategories() {
  try {
    const res = await categoryApi.list()
    categories.value = res.items
  } catch {
    categories.value = []
  }
}

function openConfirm(asset: AdminAsset, action: 'publish' | 'offline') {
  confirmState.asset = asset
  confirmState.action = action
  confirmState.open = true
}

async function submitConfirm() {
  if (!confirmState.asset || confirmState.submitting) return
  confirmState.submitting = true
  actionId.value = confirmState.asset.id
  try {
    const id = confirmState.asset.id
    if (confirmState.action === 'publish') {
      await adminAssetApi.publish(id)
      success('素材已上架')
    } else {
      await adminAssetApi.offline(id)
      success('素材已下架')
    }
    confirmState.open = false
    await load()
  } catch (error) {
    toastError(error instanceof Error ? error.message : '操作失败，请重试')
  } finally {
    confirmState.submitting = false
    actionId.value = ''
  }
}

function resetFilters() {
  filters.keyword = ''
  filters.categoryCode = ''
  filters.assetType = ''
  filters.status = ''
  filters.storageProvider = ''
  page.value = 1
  load()
}

onMounted(() => {
  loadCategories()
  load()
})
</script>

<template>
  <div class="animate-fade-up">
    <PageHeader title="素材管理" subtitle="管理全部状态的素材：上架、下架与查看存储定位">
      <template #actions>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="load">
          <BaseIcon name="refresh" :size="16" />
          刷新
        </button>
        <button type="button" class="btn btn-primary btn-sm" @click="router.push('/admin/upload')">
          <BaseIcon name="plus" :size="16" />
          新建素材
        </button>
      </template>
    </PageHeader>

    <!-- 筛选 -->
    <div class="card p-4 mb-4">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div class="lg:col-span-2">
          <label class="label" for="admin-asset-keyword">关键词</label>
          <div class="relative">
            <BaseIcon name="search" :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              id="admin-asset-keyword"
              v-model="filters.keyword"
              class="input pl-9"
              type="search"
              placeholder="素材名称 / 文件名"
            />
          </div>
        </div>

        <div>
          <label class="label" for="admin-asset-category">分类</label>
          <select id="admin-asset-category" v-model="filters.categoryCode" class="select">
            <option value="">全部分类</option>
            <option v-for="category in categories" :key="category.code" :value="category.code">
              {{ category.name }}
            </option>
          </select>
        </div>

        <div>
          <label class="label" for="admin-asset-type">类型</label>
          <select id="admin-asset-type" v-model="filters.assetType" class="select">
            <option value="">全部类型</option>
            <option value="IMAGE">图片</option>
            <option value="VIDEO">视频</option>
            <option value="ARCHIVE">活动包</option>
          </select>
        </div>

        <div>
          <label class="label" for="admin-asset-status">状态</label>
          <select id="admin-asset-status" v-model="filters.status" class="select">
            <option value="">全部状态</option>
            <option value="DRAFT">草稿</option>
            <option value="PUBLISHED">已上架</option>
            <option value="OFFLINE">已下架</option>
          </select>
        </div>

        <div>
          <label class="label" for="admin-asset-storage">来源</label>
          <select id="admin-asset-storage" v-model="filters.storageProvider" class="select">
            <option value="">全部来源</option>
            <option value="OSS">OSS</option>
          </select>
        </div>
      </div>

      <div v-if="hasFilter" class="mt-3 flex items-center justify-between">
        <p class="text-caption text-neutral-500">已应用筛选条件，共匹配 {{ total }} 条</p>
        <button type="button" class="btn btn-secondary btn-sm" @click="resetFilters">清空筛选</button>
      </div>
    </div>

    <!-- 骨架 -->
    <div v-if="loading" class="card p-4 space-y-3">
      <div v-for="index in 6" :key="index" class="flex items-center gap-4">
        <div class="skeleton h-10 w-10 rounded-control" />
        <div class="skeleton h-3 flex-1" />
        <div class="skeleton h-3 w-24" />
        <div class="skeleton h-3 w-16" />
      </div>
    </div>

    <!-- 错误 -->
    <div v-else-if="errorMessage" class="card">
      <EmptyState icon="alert" title="素材加载失败" :description="errorMessage">
        <template #action>
          <button type="button" class="btn btn-primary" @click="load">重新加载</button>
        </template>
      </EmptyState>
    </div>

    <!-- 空 -->
    <div v-else-if="items.length === 0" class="card">
      <EmptyState
        icon="folder"
        title="还没有素材"
        :description="hasFilter ? '没有符合筛选条件的素材，试试清空筛选。' : '从「新建素材」上传第一份素材，或直接导入活动包。'"
      >
        <template #action>
          <div class="flex items-center gap-2">
            <button v-if="hasFilter" type="button" class="btn btn-secondary" @click="resetFilters">
              清空筛选
            </button>
            <button type="button" class="btn btn-primary" @click="router.push('/admin/upload')">
              新建素材
            </button>
          </div>
        </template>
      </EmptyState>
    </div>

    <!-- 表格 -->
    <template v-else>
      <!-- 批量操作栏 -->
      <div
        v-if="selectedIds.length > 0"
        class="card px-4 py-3 mb-3 flex flex-wrap items-center justify-between gap-3"
      >
        <p class="text-caption text-neutral-600">
          已选择 <span class="font-medium text-neutral-900">{{ selectedIds.length }}</span> 个素材
          <span v-if="selectedAssets.length > 0" class="text-neutral-400">
            · 可上架 {{ publishableIds.length }} 个、可下架 {{ offlineableIds.length }} 个
          </span>
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="btn btn-secondary btn-sm" @click="selectedIds = []">取消选择</button>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="publishableIds.length === 0 || batch.submitting"
            :title="publishableIds.length === 0 ? emptyPublishHint : `上架 ${publishableIds.length} 个素材`"
            @click="openBatch('publish')"
          >
            <BaseIcon name="upload" :size="14" />
            批量上架{{ publishableIds.length > 0 ? ` (${publishableIds.length})` : '' }}
          </button>
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            :disabled="offlineableIds.length === 0 || batch.submitting"
            :title="offlineableIds.length === 0 ? '所选素材均未上架' : `下架 ${offlineableIds.length} 个素材`"
            @click="openBatch('offline')"
          >
            <BaseIcon name="archive" :size="14" />
            批量下架{{ offlineableIds.length > 0 ? ` (${offlineableIds.length})` : '' }}
          </button>
          <button type="button" class="btn btn-danger btn-sm" @click="openDelete(selectedIds)">
            <BaseIcon name="archive" :size="14" />
            批量删除
          </button>
        </div>
      </div>

      <div class="table-wrap group/table">
        <table class="data-table">
          <thead>
            <tr>
              <th class="w-10">
                <div
                  class="flex items-center justify-center transition-opacity duration-fast"
                  :class="
                    selectedIds.length > 0
                      ? 'opacity-100'
                      : 'opacity-0 group-hover/table:opacity-100 focus-within:opacity-100'
                  "
                >
                  <SelectionCheckbox
                    :checked="allSelected"
                    label="全选本页素材"
                    @change="toggleAll"
                  />
                </div>
              </th>
              <th>素材名称</th>
              <th>分类</th>
              <th>类型</th>
              <th>大小</th>
              <th>状态</th>
              <th>来源</th>
              <th>上架时间</th>
              <th class="w-56">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="asset in items" :key="asset.id" class="group">
              <td>
                <div
                  class="flex items-center justify-center transition-opacity duration-fast"
                  :class="
                    selectedIds.length > 0 || selectedIds.includes(asset.id)
                      ? 'opacity-100'
                      : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
                  "
                >
                  <SelectionCheckbox
                    :checked="selectedIds.includes(asset.id)"
                    :label="`选择素材 ${asset.name}`"
                    @change="(checked) => toggleOne(asset.id, checked)"
                  />
                </div>
              </td>
              <td>
                <div class="flex items-center gap-3 min-w-0">
                  <div
                    class="relative w-10 h-10 shrink-0 rounded-control overflow-hidden flex items-center justify-center text-white/90"
                    :class="thumbs[asset.id] ? 'bg-white' : asset.assetType === 'IMAGE' ? 'bg-thumb-rose' : 'bg-thumb-gold'"
                  >
                    <BaseIcon
                      v-if="!thumbs[asset.id]"
                      :name="asset.assetType === 'IMAGE' ? 'image' : asset.assetType === 'VIDEO' ? 'video' : 'folder'"
                      :size="18"
                    />
                    <BaseIcon
                      v-else-if="kindOf(asset) === 'VIDEO' && !frames[asset.id]"
                      :name="asset.assetType === 'ARCHIVE' ? 'folder' : 'video'"
                      :size="18"
                      class="text-neutral-300"
                    />
                    <img
                      v-if="thumbs[asset.id] && kindOf(asset) === 'IMAGE'"
                      :src="thumbs[asset.id]"
                      :alt="asset.name"
                      class="absolute inset-0 w-full h-full object-cover bg-white"
                      loading="lazy"
                      @error="markBroken(asset.id)"
                    />
                    <video
                      v-else-if="thumbs[asset.id] && kindOf(asset) === 'VIDEO'"
                      :src="thumbs[asset.id]"
                      class="absolute inset-0 w-full h-full object-cover bg-neutral-900 transition-opacity duration-200"
                      :class="frames[asset.id] ? 'opacity-100' : 'opacity-0'"
                      muted
                      playsinline
                      preload="metadata"
                      @loadeddata="revealFrame(asset.id, $event)"
                      @error="markBroken(asset.id)"
                    />
                    <span
                      v-if="kindOf(asset) === 'VIDEO' && frames[asset.id]"
                      class="absolute inset-0 flex items-center justify-center pointer-events-none"
                    >
                      <span class="w-5 h-5 rounded-pill bg-neutral-900/60 flex items-center justify-center">
                        <BaseIcon name="video" :size="11" class="text-white" />
                      </span>
                    </span>
                    <span
                      v-if="!thumbs[asset.id] && failures[asset.id]"
                      class="absolute bottom-0 inset-x-0 bg-neutral-900/60 text-[9px] leading-[12px] text-white text-center"
                      :title="failures[asset.id]"
                    >
                      缺图
                    </span>
                  </div>
                  <div class="min-w-0">
                    <p class="text-body font-medium text-neutral-900 truncate max-w-[260px]">{{ asset.name }}</p>
                    <p class="text-micro text-neutral-400 truncate max-w-[260px]">
                      #{{ asset.id }} · {{ asset.originalFilename }}
                    </p>
                  </div>
                </div>
              </td>
              <td class="text-caption">{{ categoryLabel(asset.categoryCode, categoryDict) }}</td>
              <td class="text-caption">{{ assetTypeLabel(asset.assetType) }}</td>
              <td class="text-caption whitespace-nowrap">{{ formatBytes(asset.fileSize) }}</td>
              <td><StatusBadge :status="asset.status" /></td>
              <td class="text-caption">{{ storageLabel(asset.storageProvider) }}</td>
              <td class="text-caption whitespace-nowrap">{{ formatDateTime(asset.publishedAt) }}</td>
              <td>
                <div class="flex items-center gap-1">
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    @click="router.push(`/admin/assets/${asset.id}`)"
                  >
                    详情
                  </button>
                  <button
                    v-if="asset.status !== 'PUBLISHED'"
                    type="button"
                    class="btn btn-ghost btn-sm"
                    :disabled="actionId === asset.id || !canPublish(asset)"
                    :title="canPublish(asset) ? '上架该素材' : '活动包需通过任务发布流程上架'"
                    @click="openConfirm(asset, 'publish')"
                  >
                    上架
                  </button>
                  <button
                    v-else
                    type="button"
                    class="btn btn-secondary btn-sm"
                    :disabled="actionId === asset.id"
                    @click="openConfirm(asset, 'offline')"
                  >
                    下架
                  </button>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm text-feedback-danger hover:bg-feedback-danger-bg"
                    :disabled="actionId === asset.id"
                    @click="openDelete([asset.id])"
                  >
                    删除
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <PaginationBar
        :page="page"
        :page-size="pageSize"
        :total="total"
        @update:page="(value) => (page = value)"
      />
    </template>

    <!-- 上/下架确认 -->
    <BaseModal
      :open="confirmState.open"
      :title="confirmState.action === 'publish' ? '上架素材' : '下架素材'"
      :description="
        confirmState.action === 'publish'
          ? '上架后门店员工可在素材发现中看到并下载该素材。'
          : '下架后员工将无法继续下载，已产生的下载记录不会回滚。'
      "
      :width="440"
      @close="confirmState.open = false"
    >
      <div v-if="confirmState.asset" class="rounded-card bg-neutral-50 border border-neutral-100 px-4 py-3">
        <p class="text-body font-medium text-neutral-900 truncate">{{ confirmState.asset.name }}</p>
        <p class="mt-1 text-micro text-neutral-500">
          #{{ confirmState.asset.id }} · {{ formatBytes(confirmState.asset.fileSize) }}
        </p>
      </div>

      <template #footer>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="confirmState.submitting" @click="confirmState.open = false">
          取消
        </button>
        <button
          type="button"
          class="btn btn-sm"
          :class="confirmState.action === 'publish' ? 'btn-primary' : 'btn-danger'"
          :disabled="confirmState.submitting"
          @click="submitConfirm"
        >
          {{ confirmState.submitting ? '处理中…' : confirmState.action === 'publish' ? '确认上架' : '确认下架' }}
        </button>
      </template>
    </BaseModal>

    <!-- 批量上/下架 -->
    <BaseModal
      :open="batch.open"
      :title="`批量${batch.action === 'publish' ? '上架' : '下架'} ${batch.ids.length} 个素材`"
      :description="
        batch.action === 'publish'
          ? '上架后门店员工可在素材发现中看到并下载这些素材。'
          : '下架后员工将无法继续下载，已产生的下载记录不会回滚。'
      "
      :width="480"
      @close="closeBatch"
    >
      <!-- 进度 -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <p class="text-caption text-neutral-600">
            {{ batch.finished ? '处理完成' : batch.submitting ? '正在处理…' : '待处理' }}
          </p>
          <p class="text-caption text-neutral-500">
            {{ batch.done }} / {{ batch.ids.length }}
          </p>
        </div>
        <div class="h-1.5 w-full rounded-pill bg-neutral-100 overflow-hidden">
          <div
            class="h-full rounded-pill bg-brand-500 transition-all duration-200"
            :style="{ width: `${batch.ids.length ? Math.round((batch.done / batch.ids.length) * 100) : 0}%` }"
          />
        </div>

        <p v-if="batch.finished && batch.failures.length === 0" class="text-caption text-feedback-success">
          全部素材已{{ batch.action === 'publish' ? '上架' : '下架' }}。
        </p>

        <ul
          v-if="batch.failures.length > 0"
          class="max-h-56 overflow-y-auto rounded-card border border-neutral-100 divide-y divide-neutral-100"
        >
          <li v-for="item in batch.failures" :key="item.assetId" class="px-3 py-2">
            <p class="text-caption text-neutral-900">#{{ item.assetId }}</p>
            <p class="mt-0.5 text-micro text-feedback-danger">{{ item.message }}</p>
          </li>
        </ul>
      </div>

      <template #footer>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="batch.submitting"
          @click="batch.open = false"
        >
          {{ batch.finished ? '关闭' : '取消' }}
        </button>
        <button
          v-if="!batch.finished || batch.failures.length > 0"
          type="button"
          class="btn btn-sm"
          :class="batch.action === 'publish' ? 'btn-primary' : 'btn-danger'"
          :disabled="batch.submitting || (!batch.finished && batch.done > 0)"
          @click="batch.finished ? retryBatchFailures() : runBatch()"
        >
          {{
            batch.submitting
              ? '处理中…'
              : batch.finished
                ? '重试失败项'
                : `确认${batch.action === 'publish' ? '上架' : '下架'}`
          }}
        </button>
      </template>
    </BaseModal>

    <!-- 删除确认 -->
    <BaseModal
      :open="del.open"
      :title="del.ids.length > 1 ? `批量删除 ${del.ids.length} 个素材` : '删除素材'"
      description="删除会移除素材及其 OSS 文件，且不可恢复；上传、下载与审计历史会保留。已关联任务的素材无法删除，请改用下架。"
      :width="480"
      @close="del.open = false"
    >
      <div v-if="del.ids.length > 0 && !del.result" class="flex flex-wrap gap-2">
        <span v-for="id in del.ids.slice(0, 12)" :key="id" class="badge badge-neutral">#{{ id }}</span>
        <span v-if="del.ids.length > 12" class="badge badge-neutral">等 {{ del.ids.length }} 个</span>
      </div>

      <!-- 逐项结果：HTTP 200 也要检查失败项 -->
      <div v-if="del.result" class="space-y-3">
        <div class="flex items-center gap-2">
          <span class="badge badge-success">成功 {{ del.result.successCount }}</span>
          <span v-if="del.result.failedCount > 0" class="badge badge-danger">
            失败 {{ del.result.failedCount }}
          </span>
        </div>

        <ul v-if="deleteFailed.length > 0" class="max-h-56 overflow-y-auto rounded-card border border-neutral-100 divide-y divide-neutral-100">
          <li v-for="item in deleteFailed" :key="item.assetId" class="px-3 py-2">
            <p class="text-caption text-neutral-900">#{{ item.assetId }}</p>
            <p class="mt-0.5 text-micro text-feedback-danger">{{ item.error.message }}</p>
            <p class="mt-0.5 text-micro text-neutral-400 font-mono">{{ item.error.code }}</p>
          </li>
        </ul>
        <p v-else class="text-caption text-neutral-500">全部素材已删除。</p>
      </div>

      <template #footer>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="del.submitting" @click="del.open = false">
          {{ del.result ? '关闭' : '取消' }}
        </button>
        <button
          v-if="!del.result || deleteFailed.length > 0"
          type="button"
          class="btn btn-danger btn-sm"
          :disabled="del.submitting || del.ids.length === 0"
          @click="submitDelete"
        >
          {{ del.submitting ? '删除中…' : del.result ? '重试失败项' : '确认删除' }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>
