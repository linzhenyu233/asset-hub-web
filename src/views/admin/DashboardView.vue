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
  return [
    { key: 'task', label: '发布任务数', value: data.value.taskCount, icon: 'clipboard', tone: 'brand' },
    { key: 'participant', label: '参与员工数', value: data.value.participantCount, icon: 'users', tone: 'info' },
    { key: 'claim', label: '领取记录数', value: data.value.claimCount, icon: 'check', tone: 'success' },
    { key: 'download', label: '下载申请数', value: data.value.downloadRequestCount, icon: 'download', tone: 'warning' },
    { key: 'employee', label: '建档员工数', value: data.value.employeeCount, icon: 'user', tone: 'neutral' },
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

function percent(value: number, total: number): number {
  if (!total) return 0
  return Math.max(0, Math.round((value / total) * 100))
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    data.value = await dashboardApi.get()
  } catch (error) {
    data.value = null
    errorMessage.value = error instanceof Error ? error.message : '数据加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="animate-fade-up">
    <PageHeader
      title="数据总览"
      :subtitle="data ? `统计截止 ${formatDateTime(data.asOf)}（北京时间）` : '素材、任务与下载的全量汇总'"
    >
      <template #actions>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="load">
          <BaseIcon name="refresh" :size="16" />
          刷新数据
        </button>
      </template>
    </PageHeader>

    <!-- 骨架 -->
    <div v-if="loading" class="space-y-5">
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
          <button type="button" class="btn btn-primary" @click="load">重新加载</button>
        </template>
      </EmptyState>
    </div>

    <div v-else-if="data" class="space-y-5">
      <!-- KPI -->
      <div class="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <div v-for="item in kpis" :key="item.key" class="card p-4">
          <div class="w-8 h-8 rounded-control flex items-center justify-center" :class="toneClass[item.tone]">
            <BaseIcon :name="item.icon" :size="16" />
          </div>
          <p class="mt-3 data-num text-[28px] leading-[34px] text-neutral-900">{{ item.value }}</p>
          <p class="mt-0.5 text-caption text-neutral-500">{{ item.label }}</p>
        </div>
      </div>

      <div class="grid gap-5 lg:grid-cols-[1fr_340px] items-start">
        <!-- 素材分布 -->
        <section class="card p-6">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="section-title">素材分类与状态分布</h2>
              <p class="mt-1 text-caption text-neutral-500">共 {{ grandTotal }} 份素材</p>
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
            <div v-for="item in categoryStats" :key="item.code">
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
                <div class="h-full bg-brand-500" :style="{ width: `${percent(item.published, item.total)}%` }" />
                <div class="h-full bg-neutral-300" :style="{ width: `${percent(item.offline, item.total)}%` }" />
                <div class="h-full bg-neutral-200" :style="{ width: `${percent(item.draft, item.total)}%` }" />
              </div>
              <div class="mt-1.5 flex items-center gap-4 text-micro text-neutral-500">
                <span>已上架 {{ item.published }}</span>
                <span>已下架 {{ item.offline }}</span>
                <span>草稿 {{ item.draft }}</span>
              </div>
            </div>
          </div>
        </section>

        <!-- 说明卡 -->
        <aside class="space-y-4">
          <div class="card p-5 bg-brand-50 border-brand-100">
            <div class="flex items-center gap-2 text-brand-700">
              <BaseIcon name="sparkles" :size="16" />
              <span class="text-caption font-medium">开展一次活动分发</span>
            </div>
            <p class="mt-2 text-caption text-brand-700/80 leading-[18px]">
              在「素材入库」上传活动包，再到「任务管理」发布任务，员工即可在门店端一键领取与下载。
            </p>
            <div class="mt-3 flex gap-2">
              <RouterLink to="/admin/upload" class="btn btn-primary btn-sm">去入库</RouterLink>
              <RouterLink to="/admin/tasks" class="btn btn-secondary btn-sm">去发布任务</RouterLink>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>
