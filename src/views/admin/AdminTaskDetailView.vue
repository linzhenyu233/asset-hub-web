<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { adminTaskApi } from '../../api'
import { ApiError } from '../../api/client'
import type { Claim, TaskDetail } from '../../api/types'
import { assetTypeLabel, formatBytes, formatDateTime, formatPhone } from '../../utils/format'
import BaseIcon from '../../components/ui/BaseIcon.vue'
import EmptyState from '../../components/ui/EmptyState.vue'
import PaginationBar from '../../components/ui/PaginationBar.vue'

const route = useRoute()
const router = useRouter()

const task = ref<TaskDetail | null>(null)
const loading = ref(true)
const errorMessage = ref('')

const claims = ref<Claim[]>([])
const claimTotal = ref(0)
const claimPage = ref(1)
const claimPageSize = ref(10)
const claimLoading = ref(true)
const claimError = ref('')
const claimKeyword = ref('')

const taskId = String(route.params.id)

const contentLines = computed(() => (task.value?.content ? task.value.content.split('\n') : []))
/** 活动包解压出的子素材数量（未解包时为 0） */
const childCount = computed(() => task.value?.activityAsset.children?.length ?? 0)

let keywordTimer: number | undefined

watch(claimKeyword, () => {
  window.clearTimeout(keywordTimer)
  keywordTimer = window.setTimeout(() => {
    claimPage.value = 1
    loadClaims()
  }, 380)
})

watch(claimPage, () => loadClaims())

async function loadTask() {
  loading.value = true
  errorMessage.value = ''
  try {
    task.value = await adminTaskApi.detail(taskId)
  } catch (error) {
    task.value = null
    if (error instanceof ApiError && error.status === 404) errorMessage.value = '任务不存在'
    else errorMessage.value = error instanceof Error ? error.message : '任务详情加载失败'
  } finally {
    loading.value = false
  }
}

async function loadClaims() {
  claimLoading.value = true
  claimError.value = ''
  try {
    const res = await adminTaskApi.claims(taskId, {
      page: claimPage.value,
      pageSize: claimPageSize.value,
      keyword: claimKeyword.value.trim() || undefined,
    })
    claims.value = res.items
    claimTotal.value = res.total
  } catch (error) {
    claims.value = []
    claimTotal.value = 0
    claimError.value = error instanceof Error ? error.message : '领取明细加载失败'
  } finally {
    claimLoading.value = false
  }
}

onMounted(() => {
  loadTask()
  loadClaims()
})
</script>

<template>
  <div class="animate-fade-up">
    <div class="flex items-center justify-between gap-3 mb-5">
      <button type="button" class="btn btn-secondary btn-sm" @click="router.push('/admin/tasks')">
        <BaseIcon name="arrow-left" :size="16" />
        返回任务管理
      </button>
      <button type="button" class="btn btn-secondary btn-sm" @click="loadTask(); loadClaims()">
        <BaseIcon name="refresh" :size="16" />
        刷新
      </button>
    </div>

    <div v-if="loading" class="space-y-4">
      <div class="card p-6 space-y-3">
        <div class="skeleton h-6 w-1/2" />
        <div class="skeleton h-3 w-1/3" />
        <div class="skeleton h-3 w-full" />
        <div class="skeleton h-3 w-full" />
      </div>
      <div class="card p-4 space-y-3">
        <div v-for="index in 4" :key="index" class="skeleton h-3 w-full" />
      </div>
    </div>

    <div v-else-if="!task" class="card">
      <EmptyState icon="alert" title="无法打开任务" :description="errorMessage">
        <template #action>
          <button type="button" class="btn btn-primary" @click="loadTask">重试</button>
        </template>
      </EmptyState>
    </div>

    <!-- 主内容 + 右侧活动包：领取明细并入左栏，避免左短右长产生大片留白 -->
    <div v-else class="grid gap-5 lg:grid-cols-[1fr_340px] items-start">
      <div class="min-w-0 space-y-5">
        <section class="card p-6">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="badge badge-brand">#{{ task.id }}</span>
            <span class="badge badge-claimed">{{ task.claimCount }} 人已领取</span>
          </div>
          <h1 class="mt-3 text-h1 font-bold text-neutral-900">{{ task.title }}</h1>
          <p class="mt-2 text-caption text-neutral-500">发布于 {{ formatDateTime(task.publishedAt) }}</p>

          <div class="mt-5">
            <h2 class="section-title">任务内容</h2>
            <p class="mt-3 text-body text-neutral-700 leading-[24px] whitespace-pre-line">
              {{ contentLines.join('\n') }}
            </p>
          </div>
        </section>

        <!-- 领取明细 -->
        <section class="card p-5">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 class="section-title">领取明细</h2>
              <p class="mt-1 text-caption text-neutral-500">共 {{ claimTotal }} 条领取记录</p>
            </div>
            <div class="relative w-full sm:w-64">
              <BaseIcon name="search" :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input v-model="claimKeyword" class="input pl-9" type="search" placeholder="搜索员工 / 门店" aria-label="搜索领取记录" />
            </div>
          </div>

          <div v-if="claimLoading" class="mt-4 space-y-3">
            <div v-for="index in 4" :key="index" class="skeleton h-3 w-full" />
          </div>

          <div v-else-if="claimError" class="mt-4">
            <EmptyState icon="alert" title="领取明细加载失败" :description="claimError">
              <template #action>
                <button type="button" class="btn btn-secondary btn-sm" @click="loadClaims">重试</button>
              </template>
            </EmptyState>
          </div>

          <div v-else-if="claims.length === 0" class="mt-4">
            <EmptyState icon="users" title="暂无领取记录" description="门店员工领取任务后，这里会显示员工、门店与领取时间。" />
          </div>

          <template v-else>
            <div class="mt-4 table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>员工</th>
                    <th>手机号</th>
                    <th>门店</th>
                    <th>领取时间</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="claim in claims" :key="`${claim.taskId}-${claim.userId}`">
                    <td>
                      <div class="flex items-center gap-2">
                        <span class="w-7 h-7 rounded-pill bg-brand-100 text-brand-600 text-micro font-medium flex items-center justify-center">
                          {{ (claim.displayName || '未').charAt(0) }}
                        </span>
                        <span class="text-body text-neutral-900">{{ claim.displayName || '未命名' }}</span>
                      </div>
                    </td>
                    <td class="text-caption">{{ formatPhone(claim.phone) }}</td>
                    <td class="text-caption">{{ claim.storeName || '—' }}</td>
                    <td class="text-caption whitespace-nowrap">{{ formatDateTime(claim.claimedAt) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <PaginationBar
              :page="claimPage"
              :page-size="claimPageSize"
              :total="claimTotal"
              @update:page="(value) => (claimPage = value)"
            />
          </template>
        </section>
      </div>

      <!-- 右侧：本次活动包（滚动时吸顶） -->
      <aside class="card p-5 lg:sticky lg:top-[84px]">
        <h2 class="section-title">本次活动包</h2>
        <div class="mt-3 rounded-card border border-neutral-100 overflow-hidden">
          <div
            class="aspect-[16/9] flex items-center justify-center text-white/85"
            :class="task.activityAsset.assetType === 'IMAGE' ? 'bg-thumb-rose' : 'bg-thumb-gold'"
          >
            <BaseIcon
              :name="task.activityAsset.assetType === 'IMAGE' ? 'image' : task.activityAsset.assetType === 'VIDEO' ? 'video' : 'folder'"
              :size="40"
              :stroke-width="1.2"
            />
          </div>
          <div class="p-3">
            <p class="text-[13px] font-medium text-neutral-900 truncate">{{ task.activityAsset.name }}</p>
            <p class="mt-1 text-micro text-neutral-500">
              {{ assetTypeLabel(task.activityAsset.assetType) }} · {{ formatBytes(task.activityAsset.fileSize) }}
            </p>
            <div class="mt-2 flex items-center gap-2">
              <span class="badge" :class="task.activityAsset.available ? 'badge-claimed' : 'badge-offline'">
                {{ task.activityAsset.available ? '可下载' : '已下架' }}
              </span>
              <span class="badge badge-neutral">#{{ task.activityAsset.id }}</span>
              <span v-if="childCount > 0" class="badge badge-brand">包内 {{ childCount }} 个素材</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          class="btn btn-secondary w-full mt-3"
          @click="router.push(`/admin/assets/${task.activityAsset.id}`)"
        >
          <BaseIcon name="external" :size="16" />
          管理活动包素材
        </button>
      </aside>
    </div>
  </div>
</template>
