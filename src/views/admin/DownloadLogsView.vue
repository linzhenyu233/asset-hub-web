<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { logApi } from '../../api'
import type { DownloadLog } from '../../api/types'
import { formatDateTime, nextDayStart, storageLabel } from '../../utils/format'
import PageHeader from '../../components/ui/PageHeader.vue'
import BaseIcon from '../../components/ui/BaseIcon.vue'
import EmptyState from '../../components/ui/EmptyState.vue'
import PaginationBar from '../../components/ui/PaginationBar.vue'

const router = useRouter()

const items = ref<DownloadLog[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(true)
const errorMessage = ref('')

const filters = reactive({
  userId: '',
  assetId: '',
  storageProvider: '',
  from: '',
  to: '',
})

const hasFilter = computed(
  () => Boolean(filters.userId || filters.assetId || filters.storageProvider || filters.from || filters.to),
)

watch(
  () => [filters.userId, filters.assetId, filters.storageProvider, filters.from, filters.to],
  () => {
    page.value = 1
    load()
  },
)

watch(page, () => load())

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const res = await logApi.downloads({
      page: page.value,
      pageSize: pageSize.value,
      userId: filters.userId.trim() || undefined,
      assetId: filters.assetId.trim() || undefined,
      storageProvider: filters.storageProvider || undefined,
      from: filters.from ? `${filters.from} 00:00:00` : undefined,
      // 后端 to 为开区间（< to），传次日 00:00:00 才能包含当天全天
      to: filters.to ? nextDayStart(filters.to) : undefined,
    })
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

function resetFilters() {
  filters.userId = ''
  filters.assetId = ''
  filters.storageProvider = ''
  filters.from = ''
  filters.to = ''
  page.value = 1
  load()
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

    <div class="card p-4 mb-4">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div>
          <label class="label" for="dl-user">员工 ID</label>
          <input id="dl-user" v-model="filters.userId" class="input" type="text" placeholder="按员工筛选" />
        </div>
        <div>
          <label class="label" for="dl-asset">素材 ID</label>
          <input id="dl-asset" v-model="filters.assetId" class="input" type="text" placeholder="按素材筛选" />
        </div>
        <div>
          <label class="label" for="dl-storage">存储来源</label>
          <select id="dl-storage" v-model="filters.storageProvider" class="select">
            <option value="">全部来源</option>
            <option value="OSS">OSS</option>
          </select>
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
              <th>来源</th>
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
              <td class="text-caption">{{ storageLabel(item.storageProvider) }}</td>
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
  </div>
</template>
