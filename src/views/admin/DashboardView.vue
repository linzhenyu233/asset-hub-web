<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { dashboardApi } from '../../api'
import type { Dashboard } from '../../api/types'
import { CATEGORY_LABEL, formatDateTime } from '../../utils/format'
import PageHeader from '../../components/ui/PageHeader.vue'
import BaseIcon from '../../components/ui/BaseIcon.vue'
import EmptyState from '../../components/ui/EmptyState.vue'

const data = ref<Dashboard | null>(null)
const loading = ref(true)
const errorMessage = ref('')

const kpis = computed(() => {
  if (!data.value) return []
  const d = data.value
  return [
    {
      key: 'task',
      label: '发布任务数',
      value: d.taskCount,
      icon: 'clipboard',
      tone: 'brand',
      hint: d.taskCount ? `平均 ${ratio(d.claimCount, d.taskCount)} 人领取` : '还没有发布任务',
    },
    {
      key: 'participant',
      label: '参与员工数',
      value: d.participantCount,
      icon: 'users',
      tone: 'info',
      hint: d.employeeCount ? `覆盖 ${percent(d.participantCount, d.employeeCount)}% 建档员工` : '暂无建档员工',
    },
    {
      key: 'claim',
      label: '领取记录数',
      value: d.claimCount,
      icon: 'check',
      tone: 'success',
      hint: d.participantCount ? `人均 ${ratio(d.claimCount, d.participantCount)} 次` : '还没有领取记录',
    },
    {
      key: 'download',
      label: '下载申请数',
      value: d.downloadRequestCount,
      icon: 'download',
      tone: 'warning',
      hint: d.employeeCount ? `人均 ${ratio(d.downloadRequestCount, d.employeeCount)} 次` : '还没有下载记录',
    },
    {
      key: 'employee',
      label: '建档员工数',
      value: d.employeeCount,
      icon: 'user',
      tone: 'neutral',
      // 参与率已经写在「参与员工数」的提示里，这里只补没参与的人数，别把同一个百分比念两遍
      hint: d.employeeCount ? `未参与 ${d.employeeCount - d.participantCount} 人` : '等待员工激活',
    },
  ]
})

const toneClass: Record<string, string> = {
  brand: 'bg-brand-50 text-brand-600',
  info: 'bg-feedback-info-bg text-feedback-info',
  success: 'bg-feedback-success-bg text-feedback-success',
  warning: 'bg-feedback-warning-bg text-feedback-warning',
  neutral: 'bg-neutral-100 text-neutral-600',
}

interface CategoryStat {
  code: string
  label: string
  published: number
  offline: number
  draft: number
  total: number
}

const categoryStats = computed<CategoryStat[]>(() => {
  if (!data.value) return []
  const map = new Map<string, CategoryStat>()
  for (const item of data.value.assetCounts) {
    const current =
      map.get(item.categoryCode) ??
      { code: item.categoryCode, label: CATEGORY_LABEL[item.categoryCode] ?? item.categoryCode, published: 0, offline: 0, draft: 0, total: 0 }
    if (item.status === 'PUBLISHED') current.published += item.count
    else if (item.status === 'OFFLINE') current.offline += item.count
    else if (item.status === 'DRAFT') current.draft += item.count
    current.total += item.count
    map.set(item.categoryCode, current)
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
})

const grandTotal = computed(() => categoryStats.value.reduce((sum, item) => sum + item.total, 0))

/**
 * 分类行 + 三段状态条宽度。各段独立四舍五入会出现 99%/101%（如 50.5% 与 49.5% 都进位），
 * 所以只给前两段取整、第三段吃掉余数，条子才不会空一格或被挤压。
 */
const categoryRows = computed(() =>
  categoryStats.value.map((item) => {
    const published = percent(item.published, item.total)
    const offline = Math.min(percent(item.offline, item.total), 100 - published)
    return { ...item, widths: [published, offline, Math.max(0, 100 - published - offline)] }
  }),
)

function percent(value: number, total: number): number {
  if (!total) return 0
  return Math.max(0, Math.round((value / total) * 100))
}

/** 派生口径：除法结果统一保留一位小数，除数为 0 时显示占位符 */
function ratio(numerator: number, denominator: number): string {
  if (!denominator) return '—'
  return (numerator / denominator).toFixed(1)
}

const publishedTotal = computed(() =>
  categoryStats.value.reduce((sum, item) => sum + item.published, 0),
)
const offlineTotal = computed(() =>
  categoryStats.value.reduce((sum, item) => sum + item.offline, 0),
)
const draftTotal = computed(() => categoryStats.value.reduce((sum, item) => sum + item.draft, 0))
const publishedRate = computed(() => percent(publishedTotal.value, grandTotal.value))

/** 素材状态环形图：已上架 / 已下架 / 草稿 三段，纯 CSS conic-gradient */
const ringBackground = computed(() => {
  const total = grandTotal.value
  if (!total) return 'conic-gradient(#e9e1e5 0 100%)'
  const published = (publishedTotal.value / total) * 100
  const offline = published + (offlineTotal.value / total) * 100
  return `conic-gradient(#e85d8e 0 ${published}%, #d8ccd2 ${published}% ${offline}%, #e9e1e5 ${offline}% 100%)`
})

/** 三步上手清单：用现有数据判断哪一步已经完成 */
const steps = computed(() => {
  const d = data.value
  if (!d) return []
  return [
    { key: 'upload', label: '导入第一批素材', done: grandTotal.value > 0, to: '/portal/upload', action: '去入库' },
    { key: 'task', label: '发布活动分发任务', done: d.taskCount > 0, to: '/portal/tasks', action: '去发布' },
    { key: 'claim', label: '员工领取并下载', done: d.claimCount > 0, to: '/portal/download-logs', action: '看记录' },
  ]
})

/** 总览是聚合数据，60 秒内重复进入先用上次结果渲染，再静默刷新 */
const CACHE_KEY = 'assethub_dashboard_v1'
const CACHE_TTL = 60_000

function readCache(): Dashboard | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at?: number; data?: Dashboard }
    if (!parsed.data || typeof parsed.at !== 'number' || Date.now() - parsed.at > CACHE_TTL) return null
    return parsed.data
  } catch {
    return null
  }
}

function writeCache(value: Dashboard) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: value }))
  } catch {
    // 隐私模式禁用 sessionStorage，忽略即可
  }
}

async function load(silent = false) {
  if (!silent) loading.value = true
  errorMessage.value = ''
  try {
    const res = await dashboardApi.get()
    data.value = res
    writeCache(res)
  } catch (error) {
    // 后台静默刷新失败时保留已有数据，不打断阅读
    if (silent) return
    data.value = null
    errorMessage.value = error instanceof Error ? error.message : '数据加载失败'
  } finally {
    if (!silent) loading.value = false
  }
}

onMounted(() => {
  const cached = readCache()
  if (cached) {
    data.value = cached
    loading.value = false
    void load(true)
    return
  }
  void load()
})
</script>

<template>
  <!-- 内容宽度由路由 meta.wide 经 AppShell 统一控制，这里不要再加 mx-auto max-w -->
  <div class="animate-fade-up">
    <PageHeader
      title="数据总览"
      :subtitle="data ? `统计截止 ${formatDateTime(data.asOf)}（北京时间）` : '素材、任务与下载的全量汇总'"
    >
      <template #actions>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="load()">
          <BaseIcon name="refresh" :size="16" />
          刷新数据
        </button>
      </template>
    </PageHeader>

    <!-- 骨架：只在没有缓存数据时出现，刷新时保留旧内容 -->
    <div v-if="loading && !data" class="space-y-5">
      <div class="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <div v-for="index in 5" :key="index" class="card p-4 space-y-3">
          <div class="skeleton h-8 w-8 rounded-control" />
          <div class="skeleton h-6 w-1/2" />
          <div class="skeleton h-2.5 w-2/3" />
        </div>
      </div>
      <div class="card p-6 space-y-4">
        <div class="skeleton h-4 w-1/4" />
        <div class="skeleton h-3 w-full" />
        <div class="skeleton h-3 w-full" />
      </div>
    </div>

    <!-- 错误 -->
    <div v-else-if="errorMessage" class="card">
      <EmptyState icon="alert" title="数据加载失败" :description="errorMessage">
        <template #action>
          <button type="button" class="btn btn-primary" @click="load()">重新加载</button>
        </template>
      </EmptyState>
    </div>

    <div v-else-if="data" class="space-y-5">
      <!-- KPI -->
      <div class="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <div v-for="item in kpis" :key="item.key" class="card flex flex-col p-4">
          <div class="w-8 h-8 rounded-control flex items-center justify-center" :class="toneClass[item.tone]">
            <BaseIcon :name="item.icon" :size="16" />
          </div>
          <p class="mt-3 data-num text-[28px] leading-[34px] text-neutral-900">{{ item.value }}</p>
          <p class="mt-0.5 text-caption text-neutral-500">{{ item.label }}</p>
          <p class="mt-auto truncate border-t border-dashed border-neutral-100 pt-2 text-micro text-neutral-400">
            {{ item.hint }}
          </p>
        </div>
      </div>

      <div class="grid gap-5 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_380px] 3xl:grid-cols-[1fr_460px] items-start">
        <!-- 素材分布 -->
        <section class="card p-6">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="section-title">素材分类与状态分布</h2>
              <p class="mt-1 text-caption text-neutral-500">
                共 {{ grandTotal }} 份素材 · 上架率 {{ publishedRate }}%
              </p>
            </div>
            <div class="flex items-center gap-3 text-micro text-neutral-500">
              <span class="inline-flex items-center gap-1">
                <span class="w-2 h-2 rounded-xs bg-brand-500" />已上架
              </span>
              <span class="inline-flex items-center gap-1">
                <span class="w-2 h-2 rounded-xs bg-neutral-300" />已下架
              </span>
              <span class="inline-flex items-center gap-1">
                <span class="w-2 h-2 rounded-xs bg-neutral-200" />草稿
              </span>
            </div>
          </div>

          <div v-if="categoryStats.length === 0" class="mt-6">
            <EmptyState icon="image" title="暂无素材数据" description="上传第一批素材后，这里会展示分类与状态分布。" />
          </div>

          <div v-else class="mt-5 space-y-5">
            <div v-for="item in categoryRows" :key="item.code">
              <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-2">
                  <span class="text-body font-medium text-neutral-900">{{ item.label }}</span>
                  <span class="text-micro text-neutral-400">{{ item.code }}</span>
                </div>
                <span class="text-caption text-neutral-500">
                  <span class="text-neutral-900 font-medium">{{ item.total }}</span> 份
                </span>
              </div>
              <div class="mt-2 h-2 rounded-pill bg-neutral-100 overflow-hidden flex">
                <div class="h-full bg-brand-500" :style="{ width: `${item.widths[0]}%` }" />
                <div class="h-full bg-neutral-300" :style="{ width: `${item.widths[1]}%` }" />
                <div class="h-full bg-neutral-200" :style="{ width: `${item.widths[2]}%` }" />
              </div>
              <!-- 只显示非 0 的状态：一堆「已下架 0」只是噪音 -->
              <div class="mt-1.5 flex items-center gap-4 text-micro text-neutral-500">
                <span v-if="item.published > 0">已上架 {{ item.published }}</span>
                <span v-if="item.offline > 0">已下架 {{ item.offline }}</span>
                <span v-if="item.draft > 0">草稿 {{ item.draft }}</span>
              </div>
            </div>
          </div>
        </section>

        <aside class="space-y-4">
          <!-- 素材状态构成（上架率已在左侧标题里，这里不再重复） -->
          <div class="card p-5">
            <h2 class="section-title">素材状态构成</h2>
            <div class="mt-4 flex items-center gap-5">
              <div
                class="relative w-[116px] h-[116px] shrink-0 rounded-pill"
                :style="{ background: ringBackground }"
              >
                <div class="absolute inset-[13px] rounded-pill bg-neutral-0 flex flex-col items-center justify-center">
                  <span class="data-num text-[20px] leading-[24px] text-neutral-900">{{ grandTotal }}</span>
                  <span class="text-micro text-neutral-500">份素材</span>
                </div>
              </div>
              <ul class="min-w-0 flex-1 space-y-2.5 text-caption">
                <li class="flex items-center justify-between gap-2">
                  <span class="inline-flex items-center gap-1.5 text-neutral-600">
                    <span class="w-2 h-2 rounded-xs bg-brand-500" />已上架
                  </span>
                  <span class="font-medium text-neutral-900">{{ publishedTotal }}</span>
                </li>
                <li class="flex items-center justify-between gap-2">
                  <span class="inline-flex items-center gap-1.5 text-neutral-600">
                    <span class="w-2 h-2 rounded-xs bg-neutral-300" />已下架
                  </span>
                  <span class="font-medium text-neutral-900">{{ offlineTotal }}</span>
                </li>
                <li class="flex items-center justify-between gap-2">
                  <span class="inline-flex items-center gap-1.5 text-neutral-600">
                    <span class="w-2 h-2 rounded-xs bg-neutral-200" />草稿
                  </span>
                  <span class="font-medium text-neutral-900">{{ draftTotal }}</span>
                </li>
              </ul>
            </div>
          </div>

          <!-- 三步上手：三步都做完后整张卡自己消失，不再长期占地方 -->
          <div v-if="steps.some((step) => !step.done)" class="card p-5">
            <div class="flex items-center gap-2 text-brand-700">
              <BaseIcon name="sparkles" :size="16" />
              <span class="text-caption font-medium">三步完成一次分发</span>
            </div>
            <ol class="mt-3 space-y-1">
              <li v-for="(step, index) in steps" :key="step.key" class="flex items-center gap-2.5 py-1">
                <span
                  class="w-5 h-5 shrink-0 rounded-pill flex items-center justify-center text-micro font-medium"
                  :class="
                    step.done
                      ? 'bg-feedback-success-bg text-feedback-success'
                      : 'bg-neutral-100 text-neutral-500'
                  "
                >
                  <BaseIcon v-if="step.done" name="check" :size="11" />
                  <template v-else>{{ index + 1 }}</template>
                </span>
                <p
                  class="min-w-0 flex-1 truncate text-caption"
                  :class="step.done ? 'text-neutral-400' : 'text-neutral-700'"
                >
                  {{ step.label }}
                </p>
                <RouterLink :to="step.to" class="btn-row shrink-0">{{ step.action }}</RouterLink>
              </li>
            </ol>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>
