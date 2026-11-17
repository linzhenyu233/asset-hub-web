<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { adminAssetApi, categoryApi } from '../../api'
import { ApiError } from '../../api/client'
import type { AdminAsset, BatchDeleteFailure, BatchDeleteResult, Category } from '../../api/types'
import { useBatchPreviews } from '../../composables/useBatchPreviews'
import { useToast } from '../../composables/useToast'
import { canPublish, THUMB_AUTO_MAX_BYTES } from '../../utils/asset'
import { assetTypeLabel, categoryLabel, formatBytes, formatDateTime } from '../../utils/format'
import PageHeader from '../../components/ui/PageHeader.vue'
import BaseIcon from '../../components/ui/BaseIcon.vue'
import BaseModal from '../../components/ui/BaseModal.vue'
import CopyButton from '../../components/ui/CopyButton.vue'
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
})

const categoryDict = computed<Record<string, string>>(() =>
  Object.fromEntries(categories.value.map((item) => [item.code, item.name])),
)

const {
  thumbs,
  failures,
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

/** 视频和超大图改为鼠标悬停时单独申请缩略图，其余图片照常自动加载（逐张淡入，不阻塞页面） */
function needsDeferredThumb(asset: AdminAsset): boolean {
  return asset.assetType === 'VIDEO' || asset.fileSize > THUMB_AUTO_MAX_BYTES
}

function ensureThumb(asset: AdminAsset) {
  if (thumbs.value[asset.assetId] || !needsDeferredThumb(asset)) return
  void loadThumbOne(asset)
}

const hasFilter = computed(
  () =>
    Boolean(filters.keyword) ||
    Boolean(filters.categoryCode) ||
    Boolean(filters.assetType) ||
    Boolean(filters.status),
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
  selectedIds.value = checked ? items.value.map((item) => item.assetId) : []
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
  items.value.filter((item) => selectedIds.value.includes(item.assetId)),
)
/** 批量上架只作用于未上架且可独立上架的素材，批量下架只作用于已上架 */
const publishableIds = computed(() =>
  selectedAssets.value.filter((item) => canPublish(item)).map((item) => item.assetId),
)
const offlineableIds = computed(() =>
  selectedAssets.value.filter((item) => item.status === 'PUBLISHED').map((item) => item.assetId),
)
/** 批量上架不可用时的说明：区分「都已上架」与「活动包需走任务发布」 */
const emptyPublishHint = computed(() => {
  const blockedArchive = selectedAssets.value.some(
    (item) =>
      item.status !== 'PUBLISHED' &&
      item.assetType === 'ARCHIVE' &&
      item.categoryCode === 'CAMPAIGN' &&
      !item.taskId,
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

let filterTimer: number | undefined
let loadSeq = 0

/** 筛选一变就回第 1 页重查：已在第 1 页才直接查，否则交给 page 的 watcher，避免同一组参数发两次 */
function restart() {
  if (page.value === 1) load()
  else page.value = 1
}

// 一个 watcher 覆盖全部筛选：关键词逐字输入需要防抖，下拉选择跟着同一条路走，380ms 无感
watch(
  () => [filters.keyword, filters.categoryCode, filters.assetType, filters.status],
  () => {
    window.clearTimeout(filterTimer)
    filterTimer = window.setTimeout(restart, 380)
  },
)

watch(page, () => load())

async function load() {
  const current = ++loadSeq
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
    })
    if (current !== loadSeq) return
    items.value = res.items
    total.value = res.total
    // v2.11.0 的预览接口直接返回 240px 缩略图，几 KB 一张，整页可以放心自动加载
    loadThumbs(res.items)
  } catch (error) {
    if (current !== loadSeq) return
    items.value = []
    total.value = 0
    resetThumbs()
    errorMessage.value = error instanceof Error ? error.message : '素材加载失败'
  } finally {
    if (current === loadSeq) loading.value = false
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
  actionId.value = confirmState.asset.assetId
  try {
    const id = confirmState.asset.assetId
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

/** 清空筛选：上面的 watcher 会回第 1 页并重查，这里不再自己发请求 */
function resetFilters() {
  filters.keyword = ''
  filters.categoryCode = ''
  filters.assetType = ''
  filters.status = ''
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
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div class="lg:col-span-2">
          <label class="label" for="admin-asset-keyword">关键词</label>
          <div class="relative">
            <BaseIcon name="search" :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              id="admin-asset-keyword"
              v-model="filters.keyword"
              class="input pl-9"
              type="search"
              placeholder="素材名称 / 文件名 / 素材 ID"
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
            <option value="ARCHIVE">压缩包</option>
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

      </div>

      <div v-if="hasFilter" class="mt-3 flex items-center justify-between">
        <p class="text-caption text-neutral-500">已应用筛选条件，共匹配 {{ total }} 条</p>
        <button type="button" class="btn btn-secondary btn-sm" @click="resetFilters">清空筛选</button>
      </div>
    </div>

    <!-- 骨架：只在没有可展示内容时出现，刷新时保留原表格，避免整块闪烁 -->
    <div v-if="loading && items.length === 0" class="card p-4 space-y-3">
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
        :description="hasFilter ? '没有符合筛选条件的素材，试试清空筛选。' : '从「新建素材」上传第一份素材，或直接导入任务素材。'"
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

      <div
        class="table-wrap group/table transition-opacity duration-base ease-standard"
        :class="loading ? 'opacity-60' : 'opacity-100'"
      >
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
              <th>上架时间</th>
              <th class="w-44">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="asset in items"
              :key="asset.assetId"
              class="group"
              :class="{ 'is-selected': selectedIds.includes(asset.assetId) }"
              @mouseenter="ensureThumb(asset)"
            >
              <td>
                <div
                  class="flex items-center justify-center transition-opacity duration-fast"
                  :class="
                    selectedIds.length > 0 || selectedIds.includes(asset.assetId)
                      ? 'opacity-100'
                      : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
                  "
                >
                  <SelectionCheckbox
                    :checked="selectedIds.includes(asset.assetId)"
                    :label="`选择素材 ${asset.name}`"
                    @change="(checked) => toggleOne(asset.assetId, checked)"
                  />
                </div>
              </td>
              <td>
                <div class="flex items-center gap-3 min-w-0">
                  <div
                    class="relative w-10 h-10 shrink-0 rounded-control overflow-hidden flex items-center justify-center text-white/90"
                    :class="asset.assetType === 'IMAGE' ? 'bg-thumb-rose' : 'bg-thumb-gold'"
                  >
                    <BaseIcon
                      v-if="showPlaceholder(asset.assetId, kindOf(asset))"
                      :name="asset.assetType === 'IMAGE' ? 'image' : asset.assetType === 'VIDEO' ? 'video' : 'folder'"
                      :size="18"
                    />
                    <img
                      v-if="thumbs[asset.assetId] && kindOf(asset) === 'IMAGE'"
                      :src="thumbs[asset.assetId]"
                      :alt="asset.name"
                      class="absolute inset-0 w-full h-full object-cover bg-white"
                      :class="isLoaded(asset.assetId) ? 'animate-fade-in' : 'opacity-0'"
                      loading="lazy"
                      decoding="async"
                      fetchpriority="low"
                      @load="markLoaded(asset.assetId)"
                      @error="markBroken(asset.assetId)"
                    />
                    <video
                      v-else-if="thumbs[asset.assetId] && kindOf(asset) === 'VIDEO'"
                      :src="thumbs[asset.assetId]"
                      class="absolute inset-0 w-full h-full object-cover bg-neutral-900 transition-opacity duration-200"
                      :class="frames[asset.assetId] ? 'opacity-100' : 'opacity-0'"
                      muted
                      playsinline
                      preload="metadata"
                      @loadeddata="revealFrame(asset.assetId, $event)"
                      @error="markBroken(asset.assetId)"
                    />
                    <span
                      v-if="kindOf(asset) === 'VIDEO' && frames[asset.assetId]"
                      class="absolute inset-0 flex items-center justify-center pointer-events-none"
                    >
                      <span class="w-5 h-5 rounded-pill bg-neutral-900/60 flex items-center justify-center">
                        <BaseIcon name="video" :size="11" class="text-white" />
                      </span>
                    </span>
                    <span
                      v-if="!thumbs[asset.assetId] && failures[asset.assetId]"
                      class="absolute bottom-0 inset-x-0 bg-neutral-900/60 text-[9px] leading-[12px] text-white text-center"
                      :title="failures[asset.assetId]"
                    >
                      缺图
                    </span>
                  </div>
                  <div class="min-w-0">
                    <p class="text-body font-medium text-neutral-900 truncate max-w-[260px] 2xl:max-w-[360px] 3xl:max-w-[460px]">{{ asset.name }}</p>
                    <p class="flex items-center gap-1 text-micro text-neutral-400">
                      <span class="truncate max-w-[240px] 2xl:max-w-[340px] 3xl:max-w-[440px]">
                        #{{ asset.assetId }} · {{ asset.originalFilename }}
                      </span>
                      <CopyButton :value="asset.assetId" label="素材编号" />
                    </p>
                  </div>
                </div>
              </td>
              <td class="text-caption">{{ categoryLabel(asset.categoryCode, categoryDict) }}</td>
              <td class="text-caption">{{ assetTypeLabel(asset.assetType) }}</td>
              <td class="text-caption whitespace-nowrap">{{ formatBytes(asset.fileSize) }}</td>
              <td><StatusBadge :status="asset.status" /></td>
              <td class="text-caption whitespace-nowrap">{{ formatDateTime(asset.publishedAt) }}</td>
              <td>
                <div class="flex items-center gap-1">
                  <button
                    type="button"
                    class="btn-row"
                    @click="router.push(`/admin/assets/${asset.assetId}`)"
                  >
                    详情
                  </button>
                  <button
                    v-if="asset.status !== 'PUBLISHED'"
                    type="button"
                    class="btn-row is-primary"
                    :disabled="actionId === asset.assetId || !canPublish(asset)"
                    :title="canPublish(asset) ? '上架该素材' : '活动包需通过任务发布流程上架'"
                    @click="openConfirm(asset, 'publish')"
                  >
                    上架
                  </button>
                  <button
                    v-else
                    type="button"
                    class="btn-row"
                    :disabled="actionId === asset.assetId"
                    @click="openConfirm(asset, 'offline')"
                  >
                    下架
                  </button>
                  <button
                    type="button"
                    class="btn-row is-danger"
                    :disabled="actionId === asset.assetId"
                    @click="openDelete([asset.assetId])"
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
          ? '上架后小程序里就能看到并下载该素材。'
          : '下架后员工将无法继续下载，已产生的下载记录不会回滚。'
      "
      :width="440"
      @close="confirmState.open = false"
    >
      <div v-if="confirmState.asset" class="rounded-card bg-neutral-50 border border-neutral-100 px-4 py-3">
        <p class="text-body font-medium text-neutral-900 truncate">{{ confirmState.asset.name }}</p>
        <p class="mt-1 text-micro text-neutral-500">
          #{{ confirmState.asset.assetId }} · {{ formatBytes(confirmState.asset.fileSize) }}
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
          ? '上架后小程序里就能看到并下载这些素材。'
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
