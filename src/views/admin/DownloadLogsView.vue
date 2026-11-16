<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { adminAssetApi, employeeApi, logApi } from '../../api'
import type { DownloadLog } from '../../api/types'
import { useBatchPreviews } from '../../composables/useBatchPreviews'
import { assetTypeLabel, formatBytes, formatDateTime, nextDayStart } from '../../utils/format'
import PageHeader from '../../components/ui/PageHeader.vue'
import BaseIcon from '../../components/ui/BaseIcon.vue'
import EmptyState from '../../components/ui/EmptyState.vue'
import EntityPicker from '../../components/ui/EntityPicker.vue'
import PaginationBar from '../../components/ui/PaginationBar.vue'
import type { PickerOption } from '../../components/ui/picker'

const router = useRouter()

/** 明细 / 按素材聚合 两种视图 */
const view = ref<'detail' | 'asset'>('detail')
/** 从聚合行钻取进来时记住素材 ID，返回聚合时原样退回（不污染用户的筛选框） */
const drillAssetId = ref('')
const drillAssetName = ref('')

const items = ref<DownloadLog[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(true)
const errorMessage = ref('')

const filters = reactive({
  from: '',
  to: '',
})

/** 员工 / 素材都按名称选：使用者记不住 ID，选中项里带着后端要的 ID */
const employeeFilter = ref<PickerOption | null>(null)
const assetFilter = ref<PickerOption | null>(null)

function searchEmployees(keyword: string): Promise<PickerOption[]> {
  return employeeApi.list({ page: 1, pageSize: 20, keyword }).then((res) =>
    res.items.map((item) => ({
      id: item.id,
      label: item.displayName || '未登记姓名',
      hint: [item.employeeId ? `工号 ${item.employeeId}` : '', item.phone || '']
        .filter(Boolean)
        .join(' · '),
    })),
  )
}

function searchAssets(keyword: string): Promise<PickerOption[]> {
  return adminAssetApi.list({ page: 1, pageSize: 20, keyword }).then((res) =>
    res.items.map((item) => ({
      id: item.id,
      label: item.name,
      hint: `${assetTypeLabel(item.assetType)} · ${formatBytes(item.fileSize)}`,
    })),
  )
}

const hasFilter = computed(
  () => Boolean(employeeFilter.value || assetFilter.value || filters.from || filters.to),
)

/** 两个视图共用的查询参数：手选的素材优先，其次是聚合钻取的素材 */
function query() {
  return {
    userId: employeeFilter.value?.id,
    assetId: assetFilter.value?.id || drillAssetId.value || undefined,
    from: filters.from ? `${filters.from} 00:00:00` : undefined,
    // 后端 to 为开区间（< to），传次日 00:00:00 才能包含当天全天
    to: filters.to ? nextDayStart(filters.to) : undefined,
  }
}

/* ---------------- 明细视图 ---------------- */

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const res = await logApi.downloads({ page: page.value, pageSize: pageSize.value, ...query() })
    items.value = res.items
    total.value = res.total
  } catch (error) {
    items.value = []
    total.value = 0
    errorMessage.value = error instanceof Error ? error.message : '下载记录加载失败'
  } finally {
    loading.value = false
  }
}

/* ---------------- 按素材聚合 ---------------- */

/** 聚合需要把当前筛选下的记录一次取回，超过上限时只统计最近的部分并提示 */
const AGGREGATE_LIMIT = 2000
/** 后端 pageSize 上限是 100（超出按 100 返回），所以只能按页累加 */
const AGGREGATE_PAGE_SIZE = 100

interface AssetGroup {
  assetId: string
  assetName: string
  count: number
  users: number
  lastAt: string
  lastUser: string
  lastStore: string
}

const groups = ref<AssetGroup[]>([])
const aggTotal = ref(0)
const aggPage = ref(1)
const aggPageSize = ref(15)
const aggLoading = ref(false)
/** 在明细视图期间改过筛选 → 聚合结果已过期，需要重新统计 */
const aggStale = ref(false)

const pagedGroups = computed(() => {
  const start = (aggPage.value - 1) * aggPageSize.value
  return groups.value.slice(start, start + aggPageSize.value)
})

const aggTruncated = computed(() => aggTotal.value > AGGREGATE_LIMIT)

/** 聚合行上的素材封面色块 */
const {
  thumbs,
  frames,
  load: loadThumbs,
  reset: resetThumbs,
  markBroken,
  kindOf,
  revealFrame,
  markLoaded,
  isLoaded,
  showPlaceholder,
} = useBatchPreviews()

function loadAggregateThumbs() {
  const targets = pagedGroups.value.map((group) => ({ id: group.assetId, assetType: 'IMAGE' }))
  if (targets.length === 0) {
    resetThumbs()
    return
  }
  // 真实类型由票据返回的 mimeType 纠正（图片用 img、视频用 video 取首帧）
  loadThumbs(targets)
}

/** 聚合行缩略图类型（真实类型由 mimeType 纠正） */
function groupKind(assetId: string) {
  return kindOf({ id: assetId, assetType: 'IMAGE' })
}

/** 按页取到 AGGREGATE_LIMIT（或取满 total）：一次请求会被后端截到 100 条，统计会少 */
async function fetchAggregateLogs(): Promise<{ logs: DownloadLog[]; total: number }> {
  const logs: DownloadLog[] = []
  let total = 0
  for (let page = 1; logs.length < AGGREGATE_LIMIT; page += 1) {
    const res = await logApi.downloads({ page, pageSize: AGGREGATE_PAGE_SIZE, ...query() })
    total = res.total
    logs.push(...res.items)
    if (res.items.length < AGGREGATE_PAGE_SIZE || logs.length >= total) break
  }
  return { logs: logs.slice(0, AGGREGATE_LIMIT), total }
}

async function loadAggregate() {
  aggLoading.value = true
  errorMessage.value = ''
  try {
    const { logs, total } = await fetchAggregateLogs()
    aggTotal.value = total

    const map = new Map<string, AssetGroup & { userIds: Set<string> }>()
    for (const log of logs) {
      const current =
        map.get(log.assetId) ??
        {
          assetId: log.assetId,
          assetName: log.assetName,
          count: 0,
          users: 0,
          lastAt: log.createdAt,
          lastUser: log.displayName || `#${log.userId}`,
          lastStore: log.storeName || '',
          userIds: new Set<string>(),
        }
      current.count += 1
      current.userIds.add(log.userId)
      // 时间格式固定为 YYYY-MM-DD HH:mm:ss，可直接按字符串比较
      if (log.createdAt > current.lastAt) {
        current.lastAt = log.createdAt
        current.lastUser = log.displayName || `#${log.userId}`
        current.lastStore = log.storeName || ''
      }
      if (log.assetName) current.assetName = log.assetName
      map.set(log.assetId, current)
    }

    groups.value = [...map.values()]
      .map(({ userIds, ...rest }) => ({ ...rest, users: userIds.size }))
      .sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt))
    aggPage.value = 1
    aggStale.value = false
    loadAggregateThumbs()
  } catch (error) {
    groups.value = []
    aggTotal.value = 0
    resetThumbs()
    errorMessage.value = error instanceof Error ? error.message : '聚合统计失败'
  } finally {
    aggLoading.value = false
  }
}

/** 从聚合行钻取到明细：只设置钻取状态，不改动用户的筛选框 */
function showDetail(group: AssetGroup) {
  drillAssetId.value = group.assetId
  drillAssetName.value = group.assetName
  view.value = 'detail'
  page.value = 1
  load()
}

/** 返回聚合视图：清掉钻取标记；聚合数据还在就直接复用，避免重复请求 */
function backToAggregate() {
  drillAssetId.value = ''
  drillAssetName.value = ''
  errorMessage.value = ''
  view.value = 'asset'
  openAggregate()
}

function switchView(next: 'detail' | 'asset') {
  if (view.value === next) return
  view.value = next
  drillAssetId.value = ''
  drillAssetName.value = ''
  errorMessage.value = ''
  if (next === 'asset') openAggregate()
  else load()
}

/** 回到聚合视图：数据没过期就直接复用，避免每次返回都重新统计 2000 条 */
function openAggregate() {
  if (groups.value.length === 0 || aggStale.value) loadAggregate()
  else loadAggregateThumbs()
}

watch(
  () => [employeeFilter.value?.id, assetFilter.value?.id, filters.from, filters.to],
  () => {
    if (view.value === 'asset') {
      aggPage.value = 1
      loadAggregate()
    } else {
      // 明细视图里改了筛选，聚合结果需要重算
      aggStale.value = true
      page.value = 1
      load()
    }
  },
)

watch(page, () => {
  if (view.value === 'detail') load()
})

watch(aggPage, () => {
  if (view.value === 'asset') loadAggregateThumbs()
})

watch(view, (next) => {
  if (next === 'detail') resetThumbs()
})

/** 清空筛选：上面的 watcher 会回第 1 页并重查，这里只清值 */
function resetFilters() {
  employeeFilter.value = null
  assetFilter.value = null
  filters.from = ''
  filters.to = ''
  drillAssetId.value = ''
  drillAssetName.value = ''
}

onMounted(load)
</script>

<template>
  <div class="animate-fade-up">
    <PageHeader title="下载记录" subtitle="成功授权的下载申请，可追溯到员工与素材">
      <template #actions>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="load">
          <BaseIcon name="refresh" :size="16" />
          刷新
        </button>
      </template>
    </PageHeader>

    <!-- 视图切换 -->
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div class="segmented">
        <button
          type="button"
          class="segmented-item"
          :class="view === 'detail' ? 'is-active' : ''"
          @click="switchView('detail')"
        >
          明细
        </button>
        <button
          type="button"
          class="segmented-item"
          :class="view === 'asset' ? 'is-active' : ''"
          @click="switchView('asset')"
        >
          按素材聚合
        </button>
      </div>
      <p v-if="view === 'asset' && !aggLoading" class="text-micro text-neutral-500">
        统计{{ aggTruncated ? `最近 ${AGGREGATE_LIMIT} 条` : `全部 ${aggTotal} 条` }}记录 · 共
        <span class="font-medium text-neutral-900">{{ groups.length }}</span> 个素材
      </p>
    </div>

    <div class="card p-4 mb-4">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <p class="label">员工</p>
          <EntityPicker
            v-model="employeeFilter"
            :search="searchEmployees"
            aria-label="按员工筛选"
            placeholder="按姓名 / 工号 / 手机号搜索"
            empty-hint="输入姓名 / 工号 / 手机号后显示候选"
          />
        </div>
        <div>
          <p class="label">素材</p>
          <EntityPicker
            v-model="assetFilter"
            :search="searchAssets"
            aria-label="按素材筛选"
            placeholder="按素材名称搜索"
            empty-hint="输入素材名称后显示候选"
          />
        </div>
        <div>
          <label class="label" for="dl-from">开始日期</label>
          <input id="dl-from" v-model="filters.from" class="input" type="date" />
        </div>
        <div>
          <label class="label" for="dl-to">结束日期</label>
          <input id="dl-to" v-model="filters.to" class="input" type="date" />
        </div>
        <div class="flex items-end">
          <button v-if="hasFilter" type="button" class="btn btn-secondary w-full" @click="resetFilters">
            清空筛选
          </button>
        </div>
      </div>
    </div>

    <!-- 明细视图 -->
    <template v-if="view === 'detail'">
    <div
      v-if="drillAssetId"
      class="mb-4 flex flex-wrap items-center gap-3 rounded-control border border-brand-200 bg-brand-50 px-3.5 py-2.5"
    >
      <BaseIcon name="info" :size="16" class="shrink-0 text-brand-600" />
      <p class="min-w-0 flex-1 truncate text-caption text-brand-700">
        正在查看素材 <span class="font-medium">#{{ drillAssetId }}</span>
        <template v-if="drillAssetName"> · {{ drillAssetName }}</template>
        的下载明细
      </p>
      <button type="button" class="btn-row is-primary shrink-0" @click="backToAggregate">
        <BaseIcon name="arrow-left" :size="13" />
        返回按素材聚合
      </button>
    </div>

    <div v-if="loading" class="card p-4 space-y-3">
      <div v-for="index in 6" :key="index" class="flex items-center gap-4">
        <div class="skeleton h-3 w-28" />
        <div class="skeleton h-3 flex-1" />
        <div class="skeleton h-3 w-20" />
      </div>
    </div>

    <div v-else-if="errorMessage" class="card">
      <EmptyState icon="alert" title="下载记录加载失败" :description="errorMessage">
        <template #action>
          <button type="button" class="btn btn-primary" @click="load">重新加载</button>
        </template>
      </EmptyState>
    </div>

    <div v-else-if="items.length === 0" class="card">
      <EmptyState
        icon="download"
        title="暂无下载记录"
        :description="hasFilter ? '没有符合筛选条件的记录，试试清空筛选。' : '员工下载素材后，这里会记录申请时间与来源。'"
      >
        <template #action>
          <button v-if="hasFilter" type="button" class="btn btn-secondary" @click="resetFilters">清空筛选</button>
        </template>
      </EmptyState>
    </div>

    <template v-else>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>申请时间</th>
              <th>员工</th>
              <th>门店</th>
              <th>素材</th>
              <th>请求标识</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.id">
              <td class="text-caption whitespace-nowrap">{{ formatDateTime(item.createdAt) }}</td>
              <td class="text-caption">{{ item.displayName || `#${item.userId}` }}</td>
              <td class="text-caption">{{ item.storeName || '—' }}</td>
              <td>
                <button
                  type="button"
                  class="text-left text-body text-neutral-900 hover:text-brand-600 transition-colors max-w-[280px] truncate block"
                  @click="router.push(`/admin/assets/${item.assetId}`)"
                >
                  {{ item.assetName }}
                </button>
                <p class="text-micro text-neutral-400">#{{ item.assetId }}</p>
              </td>
              <td class="text-micro text-neutral-400 font-mono truncate max-w-[200px]">{{ item.requestId }}</td>
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
    </template>

    <!-- 按素材聚合 -->
    <template v-else>
      <div v-if="aggLoading" class="card p-4 space-y-3">
        <div v-for="index in 6" :key="index" class="flex items-center gap-4">
          <div class="skeleton h-10 w-10 rounded-sm" />
          <div class="skeleton h-3 flex-1" />
          <div class="skeleton h-3 w-16" />
        </div>
      </div>

      <div v-else-if="errorMessage" class="card">
        <EmptyState icon="alert" title="聚合统计失败" :description="errorMessage">
          <template #action>
            <button type="button" class="btn btn-primary" @click="loadAggregate">重新统计</button>
          </template>
        </EmptyState>
      </div>

      <div v-else-if="groups.length === 0" class="card">
        <EmptyState
          icon="download"
          title="暂无可聚合的下载记录"
          :description="hasFilter ? '没有符合筛选条件的记录，试试清空筛选。' : '员工下载素材后，这里会按素材汇总下载次数与人数。'"
        >
          <template #action>
            <button v-if="hasFilter" type="button" class="btn btn-secondary" @click="resetFilters">清空筛选</button>
          </template>
        </EmptyState>
      </div>

      <template v-else>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th class="w-16"><span class="sr-only">封面</span></th>
                <th>素材</th>
                <th class="w-28">下载次数</th>
                <th class="w-28">下载人数</th>
                <th>最近下载</th>
                <th class="w-28">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="group in pagedGroups" :key="group.assetId">
                <td>
                  <div class="relative w-10 h-10 rounded-sm overflow-hidden border border-neutral-100 bg-white flex items-center justify-center">
                    <BaseIcon
                      v-if="showPlaceholder(group.assetId, groupKind(group.assetId))"
                      name="image"
                      :size="16"
                      class="text-neutral-300"
                    />
                    <img
                      v-if="thumbs[group.assetId] && groupKind(group.assetId) === 'IMAGE'"
                      :src="thumbs[group.assetId]"
                      alt=""
                      class="absolute inset-0 w-full h-full object-cover bg-white"
                      :class="isLoaded(group.assetId) ? 'animate-fade-in' : 'opacity-0'"
                      loading="lazy"
                      decoding="async"
                      fetchpriority="low"
                      @load="markLoaded(group.assetId)"
                      @error="markBroken(group.assetId)"
                    />
                    <video
                      v-else-if="thumbs[group.assetId] && groupKind(group.assetId) === 'VIDEO'"
                      :src="thumbs[group.assetId]"
                      class="absolute inset-0 w-full h-full object-cover bg-neutral-900 transition-opacity duration-200"
                      :class="frames[group.assetId] ? 'opacity-100' : 'opacity-0'"
                      muted
                      playsinline
                      preload="metadata"
                      @loadeddata="revealFrame(group.assetId, $event)"
                      @error="markBroken(group.assetId)"
                    />
                  </div>
                </td>
                <td>
                  <button
                    type="button"
                    class="block max-w-[320px] truncate text-left text-body text-neutral-900 transition-colors hover:text-brand-600"
                    :title="group.assetName"
                    @click="showDetail(group)"
                  >
                    {{ group.assetName }}
                  </button>
                  <p class="text-micro text-neutral-400">#{{ group.assetId }}</p>
                </td>
                <td>
                  <span class="data-num text-body font-medium text-neutral-900">{{ group.count }}</span>
                </td>
                <td class="text-caption">{{ group.users }}</td>
                <td>
                  <p class="text-caption text-neutral-700">{{ formatDateTime(group.lastAt) }}</p>
                  <p class="text-micro text-neutral-400">
                    {{ group.lastUser }}<template v-if="group.lastStore"> · {{ group.lastStore }}</template>
                  </p>
                </td>
                <td>
                  <button type="button" class="btn-row" @click="showDetail(group)">查看明细</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <PaginationBar
          :page="aggPage"
          :page-size="aggPageSize"
          :total="groups.length"
          @update:page="(value) => (aggPage = value)"
        />
      </template>
    </template>
  </div>
</template>
