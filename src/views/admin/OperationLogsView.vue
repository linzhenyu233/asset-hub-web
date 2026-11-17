<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { logApi } from '../../api'
import type { Operation } from '../../api/types'
import { actionLabel, formatDateTime, nextDayStart, statusLabel, targetTypeLabel } from '../../utils/format'
import PageHeader from '../../components/ui/PageHeader.vue'
import BaseDrawer from '../../components/ui/BaseDrawer.vue'
import BaseIcon from '../../components/ui/BaseIcon.vue'
import EmptyState from '../../components/ui/EmptyState.vue'
import PaginationBar from '../../components/ui/PaginationBar.vue'

const items = ref<Operation[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(true)
const errorMessage = ref('')
const selected = ref<Operation | null>(null)

const filters = reactive({
  operatorId: '',
  action: '',
  targetType: '',
  result: '',
  from: '',
  to: '',
})

const hasFilter = computed(() =>
  Boolean(
    filters.operatorId ||
      filters.action ||
      filters.targetType ||
      filters.result ||
      filters.from ||
      filters.to,
  ),
)

let filterTimer: number | undefined
let loadSeq = 0

/** 筛选一变就回第 1 页重查：已在第 1 页才直接查，否则交给 page 的 watcher，避免同一组参数发两次 */
function restart() {
  if (page.value === 1) load()
  else page.value = 1
}

// 一个 watcher 覆盖全部筛选（操作人 ID 逐字输入要防抖，下拉与日期跟着同一条路走）
watch(
  () => [
    filters.operatorId,
    filters.action,
    filters.targetType,
    filters.result,
    filters.from,
    filters.to,
  ],
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
  try {
    const res = await logApi.operations({
      page: page.value,
      pageSize: pageSize.value,
      operatorId: filters.operatorId.trim() || undefined,
      action: filters.action || undefined,
      targetType: filters.targetType || undefined,
      result: filters.result || undefined,
      from: filters.from ? `${filters.from} 00:00:00` : undefined,
      // 后端 to 为开区间（< to），传次日 00:00:00 才能包含当天全天
      to: filters.to ? nextDayStart(filters.to) : undefined,
    })
    if (current !== loadSeq) return
    items.value = res.items
    total.value = res.total
  } catch (error) {
    if (current !== loadSeq) return
    items.value = []
    total.value = 0
    errorMessage.value = error instanceof Error ? error.message : '操作日志加载失败'
  } finally {
    if (current === loadSeq) loading.value = false
  }
}

/** 清空筛选：上面的 watcher 会回第 1 页并重查，这里不再自己发请求 */
function resetFilters() {
  filters.operatorId = ''
  filters.action = ''
  filters.targetType = ''
  filters.result = ''
  filters.from = ''
  filters.to = ''
}

onMounted(load)
</script>

<template>
  <div class="animate-fade-up">
    <PageHeader title="操作日志" subtitle="上传、上架、下架与任务发布的全量追溯">
      <template #actions>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="load">
          <BaseIcon name="refresh" :size="16" />
          刷新
        </button>
      </template>
    </PageHeader>

    <div class="card p-4 mb-4">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <div>
          <label class="label" for="op-operator">操作人 ID</label>
          <input id="op-operator" v-model="filters.operatorId" class="input" type="text" placeholder="用户 ID，如 A7K2M9Q4B6X" />
        </div>
        <div>
          <label class="label" for="op-action">操作类型</label>
          <select id="op-action" v-model="filters.action" class="select">
            <option value="">全部操作</option>
            <option value="UPLOAD">上传</option>
            <option value="PUBLISH">上架</option>
            <option value="OFFLINE">下架</option>
            <option value="DELETE">删除素材</option>
            <option value="TASK_PUBLISH">发布任务</option>
            <option value="TASK_DEADLINE">修改截止时间</option>
            <option value="ACCOUNT_CREATE">新建子账号</option>
            <option value="ACCOUNT_STATUS">启停子账号</option>
          </select>
        </div>
        <div>
          <label class="label" for="op-target">对象类型</label>
          <select id="op-target" v-model="filters.targetType" class="select">
            <option value="">全部对象</option>
            <option value="ASSET">素材</option>
            <option value="TASK">任务素材</option>
            <option value="ADMIN_ACCOUNT">子账号</option>
            <option value="EMPLOYEE_ACCOUNT">员工账号</option>
          </select>
        </div>
        <div>
          <label class="label" for="op-result">结果</label>
          <select id="op-result" v-model="filters.result" class="select">
            <option value="">全部结果</option>
            <option value="SUCCESS">成功</option>
            <option value="FAILED">失败</option>
          </select>
        </div>
        <div>
          <label class="label" for="op-from">开始日期</label>
          <input id="op-from" v-model="filters.from" class="input" type="date" />
        </div>
        <div>
          <label class="label" for="op-to">结束日期</label>
          <input id="op-to" v-model="filters.to" class="input" type="date" />
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
        <div class="skeleton h-3 w-32" />
        <div class="skeleton h-3 flex-1" />
        <div class="skeleton h-3 w-16" />
      </div>
    </div>

    <div v-else-if="errorMessage" class="card">
      <EmptyState icon="alert" title="操作日志加载失败" :description="errorMessage">
        <template #action>
          <button type="button" class="btn btn-primary" @click="load">重新加载</button>
        </template>
      </EmptyState>
    </div>

    <div v-else-if="items.length === 0" class="card">
      <EmptyState
        icon="list"
        title="暂无操作记录"
        :description="hasFilter ? '没有符合筛选条件的记录，试试清空筛选。' : '素材上传与上下架后，这里会记录完整操作轨迹。'"
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
              <th>操作时间</th>
              <th>操作</th>
              <th>对象</th>
              <th>结果</th>
              <th>操作人</th>
              <th class="w-24">详情</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.id">
              <td class="text-caption whitespace-nowrap">{{ formatDateTime(item.operatedAt) }}</td>
              <td class="text-caption">{{ actionLabel(item.action) }}</td>
              <td>
                <p class="text-body text-neutral-900 truncate max-w-[240px]">
                  {{ item.targetNameSnapshot || '—' }}
                </p>
                <p class="text-micro text-neutral-400">
                  #{{ item.targetId || '—' }} · {{ targetTypeLabel(item.targetType) }}
                </p>
              </td>
              <td>
                <span class="badge" :class="item.result === 'SUCCESS' ? 'badge-claimed' : 'badge-failed'">
                  {{ item.result === 'SUCCESS' ? '成功' : '失败' }}
                </span>
              </td>
              <td class="text-caption">{{ item.operatorSnapshot || `#${item.operatorId}` }}</td>
              <td>
                <button type="button" class="btn-row" @click="selected = item">查看</button>
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

    <BaseDrawer :open="selected !== null" title="操作详情" @close="selected = null">
      <div v-if="selected" class="space-y-5">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="badge badge-brand">{{ actionLabel(selected.action) }}</span>
          <span class="badge" :class="selected.result === 'SUCCESS' ? 'badge-claimed' : 'badge-failed'">
            {{ selected.result === 'SUCCESS' ? '成功' : '失败' }}
          </span>
          <span class="badge badge-neutral">#{{ selected.id }}</span>
        </div>

        <div class="rounded-card bg-neutral-50 border border-neutral-100 p-4">
          <p class="text-body font-medium text-neutral-900">{{ selected.targetNameSnapshot || '—' }}</p>
          <p class="mt-1 text-micro text-neutral-500">
            对象：{{ targetTypeLabel(selected.targetType) }} #{{ selected.targetId || '—' }}
            <span class="mx-1 text-neutral-300">·</span>
            {{ formatDateTime(selected.operatedAt) }}
          </p>
        </div>

        <div v-if="selected.result === 'FAILED'" class="rounded-control bg-feedback-danger-bg px-4 py-3">
          <p class="text-caption font-medium text-feedback-on-danger">失败原因</p>
          <p class="mt-1 text-caption text-feedback-on-danger/85">
            {{ selected.errorMessage || '未返回失败说明' }}
            <span v-if="selected.errorCode" class="ml-1 font-mono text-micro">({{ selected.errorCode }})</span>
          </p>
        </div>

        <div>
          <h3 class="section-title">状态变化</h3>
          <div class="mt-3 flex items-center gap-3">
            <div class="flex-1 rounded-control border border-neutral-200 px-3 py-2">
              <p class="text-micro text-neutral-500">操作前</p>
              <p class="text-caption text-neutral-900">{{ statusLabel(selected.beforeState) || '—' }}</p>
            </div>
            <BaseIcon name="arrow-right" :size="16" class="text-neutral-400" />
            <div class="flex-1 rounded-control border border-neutral-200 px-3 py-2">
              <p class="text-micro text-neutral-500">操作后</p>
              <p class="text-caption text-neutral-900">{{ statusLabel(selected.afterState) || '—' }}</p>
            </div>
          </div>
        </div>

        <div>
          <h3 class="section-title">操作身份</h3>
          <dl class="mt-3 divide-y divide-neutral-100">
            <div class="flex items-start justify-between gap-4 py-2.5">
              <dt class="text-caption text-neutral-500">操作人</dt>
              <dd class="text-caption text-neutral-900 text-right">{{ selected.operatorSnapshot || `#${selected.operatorId}` }}</dd>
            </div>
            <div class="flex items-start justify-between gap-4 py-2.5">
              <dt class="text-caption text-neutral-500">请求标识</dt>
              <dd class="text-caption text-neutral-900 text-right break-all font-mono">{{ selected.requestId || '—' }}</dd>
            </div>
          </dl>
        </div>

      </div>
    </BaseDrawer>
  </div>
</template>
