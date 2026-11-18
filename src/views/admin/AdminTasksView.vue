<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { adminTaskApi } from '../../api'
import type { Task } from '../../api/types'
import { formatDateTime } from '../../utils/format'
import PageHeader from '../../components/ui/PageHeader.vue'
import BaseIcon from '../../components/ui/BaseIcon.vue'
import EmptyState from '../../components/ui/EmptyState.vue'
import PaginationBar from '../../components/ui/PaginationBar.vue'

const router = useRouter()

const items = ref<Task[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(15)
const loading = ref(true)
const errorMessage = ref('')
const keyword = ref('')

const hasFilter = computed(() => Boolean(keyword.value))

let keywordTimer: number | undefined
let loadSeq = 0

/** 关键词一变就回第 1 页重查：已在第 1 页才直接查，否则交给 page 的 watcher，避免同一组参数发两次 */
function restart() {
  if (page.value === 1) load()
  else page.value = 1
}

watch(keyword, () => {
  window.clearTimeout(keywordTimer)
  keywordTimer = window.setTimeout(restart, 380)
})

watch(page, () => load())

async function load() {
  const current = ++loadSeq
  loading.value = true
  errorMessage.value = ''
  try {
    const res = await adminTaskApi.list({
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value.trim() || undefined,
    })
    if (current !== loadSeq) return
    items.value = res.items
    total.value = res.total
  } catch (error) {
    if (current !== loadSeq) return
    items.value = []
    total.value = 0
    errorMessage.value = error instanceof Error ? error.message : '任务加载失败'
  } finally {
    if (current === loadSeq) loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="animate-fade-up">
    <PageHeader title="任务管理" subtitle="发布活动任务并查看小程序领取情况">
      <template #actions>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="load">
          <BaseIcon name="refresh" :size="16" />
          刷新
        </button>
        <button type="button" class="btn btn-primary btn-sm" @click="router.push('/portal/upload?mode=task')">
          <BaseIcon name="plus" :size="16" />
          发布任务
        </button>
      </template>
    </PageHeader>

    <div class="flex items-center justify-between gap-3 mb-4">
      <div class="relative w-full sm:w-72">
        <BaseIcon name="search" :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input v-model="keyword" class="input pl-9" type="search" placeholder="搜索任务标题" aria-label="搜索任务" />
      </div>
      <p v-if="hasFilter" class="text-caption text-neutral-500 shrink-0">共匹配 {{ total }} 条</p>
    </div>

    <div v-if="loading" class="card p-4 space-y-3">
      <div v-for="index in 5" :key="index" class="flex items-center gap-4">
        <div class="skeleton h-4 flex-1" />
        <div class="skeleton h-3 w-20" />
        <div class="skeleton h-3 w-28" />
      </div>
    </div>

    <div v-else-if="errorMessage" class="card">
      <EmptyState icon="alert" title="任务加载失败" :description="errorMessage">
        <template #action>
          <button type="button" class="btn btn-primary" @click="load">重新加载</button>
        </template>
      </EmptyState>
    </div>

    <div v-else-if="items.length === 0" class="card">
      <EmptyState
        icon="clipboard"
        title="暂无任务"
        :description="hasFilter ? '没有匹配的任务，试试其他关键词。' : '发布第一个活动任务，让员工在小程序里领取素材。'"
      >
        <template #action>
          <button type="button" class="btn btn-primary" @click="router.push('/portal/upload?mode=task')">
            发布任务
          </button>
        </template>
      </EmptyState>
    </div>

    <template v-else>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>任务标题</th>
              <th>领取人数</th>
              <th>发布时间</th>
              <th class="w-28">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.id">
              <td>
                <p class="text-body font-medium text-neutral-900 truncate max-w-[420px]">{{ item.title }}</p>
                <p class="text-micro text-neutral-400">#{{ item.id }}</p>
              </td>
              <td>
                <span class="badge" :class="item.claimCount > 0 ? 'badge-claimed' : 'badge-neutral'">
                  {{ item.claimCount }} 人
                </span>
                <span v-if="item.expired" class="badge badge-danger ml-1">已截止</span>
              </td>
              <td class="text-caption whitespace-nowrap">{{ formatDateTime(item.publishedAt) }}</td>
              <td>
                <button type="button" class="btn-row" @click="router.push(`/portal/tasks/${item.id}`)">
                  详情
                </button>
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
  </div>
</template>
