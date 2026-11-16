<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { employeeApi } from '../../api'
import { ApiError } from '../../api/client'
import type { EmployeeAccount, EmployeeAccountStatus } from '../../api/types'
import { useToast } from '../../composables/useToast'
import { formatDateTime } from '../../utils/format'
import PageHeader from '../../components/ui/PageHeader.vue'
import BaseIcon from '../../components/ui/BaseIcon.vue'
import BaseModal from '../../components/ui/BaseModal.vue'
import EmptyState from '../../components/ui/EmptyState.vue'
import PaginationBar from '../../components/ui/PaginationBar.vue'
import StatusBadge from '../../components/ui/StatusBadge.vue'

const { success, error: toastError } = useToast()

const PAGE_SIZE = 20

const items = ref<EmployeeAccount[]>([])
const total = ref(0)
const page = ref(1)
const keyword = ref('')
const status = ref<EmployeeAccountStatus | ''>('')

const loading = ref(true)
const forbidden = ref(false)
const errorMessage = ref('')

const hasFilter = computed(() => Boolean(keyword.value.trim()) || Boolean(status.value))
/** 本页概览（分页接口不给全局启用数，只统计当前页） */
const pageActive = computed(() => items.value.filter((item) => item.status === 'ACTIVE').length)
const pagePendingPassword = computed(() => items.value.filter((item) => item.mustChangePassword).length)

function displayNameOf(item: EmployeeAccount): string {
  return item.displayName?.trim() || '未登记姓名'
}

function initialOf(item: EmployeeAccount): string {
  return item.displayName?.trim().charAt(0) || '员'
}

async function load() {
  const current = ++loadSeq
  loading.value = true
  errorMessage.value = ''
  forbidden.value = false
  try {
    const res = await employeeApi.list({
      page: page.value,
      pageSize: PAGE_SIZE,
      keyword: keyword.value,
      status: status.value,
    })
    if (current !== loadSeq) return
    items.value = res.items
    total.value = res.total
    // 停用掉最后一页的最后一个人后当前页会变空，自动回退到最后一个有效页
    if (res.items.length === 0 && res.total > 0 && page.value > 1) {
      page.value = Math.max(1, Math.ceil(res.total / PAGE_SIZE))
    }
  } catch (error) {
    if (current !== loadSeq) return
    items.value = []
    total.value = 0
    if (error instanceof ApiError && error.status === 403) forbidden.value = true
    else errorMessage.value = error instanceof Error ? error.message : '员工列表加载失败'
  } finally {
    if (current === loadSeq) loading.value = false
  }
}

let filterTimer: number | undefined
let loadSeq = 0

/** 筛选一变就回第 1 页重查：已在第 1 页才直接查，否则交给 page 的 watcher，避免同一组参数发两次 */
function restart() {
  if (page.value === 1) load()
  else page.value = 1
}

// 一个 watcher 覆盖两个筛选（关键词防抖，状态下拉跟着同一条路走，380ms 无感）
watch(
  () => [keyword.value, status.value],
  () => {
    window.clearTimeout(filterTimer)
    filterTimer = window.setTimeout(restart, 380)
  },
)

watch(page, () => load())

/** 清空筛选：上面的 watcher 会回第 1 页并重查，这里不再自己发请求 */
function resetFilters() {
  keyword.value = ''
  status.value = ''
}

/* ---------------- 启用 / 停用 ---------------- */

const toggle = reactive({
  open: false,
  submitting: false,
  employee: null as EmployeeAccount | null,
  nextStatus: 'DISABLED' as EmployeeAccountStatus,
})

function openToggle(employee: EmployeeAccount) {
  toggle.employee = employee
  toggle.nextStatus = employee.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
  toggle.open = true
}

async function submitToggle() {
  if (!toggle.employee || toggle.submitting) return
  toggle.submitting = true
  const switching = toggle.employee
  try {
    await employeeApi.setStatus(switching.id, toggle.nextStatus)
    success(toggle.nextStatus === 'ACTIVE' ? '员工已启用' : '员工已停用')
    toggle.open = false
    await load()
  } catch (error) {
    toastError(error instanceof Error ? error.message : '操作失败，请重试')
  } finally {
    toggle.submitting = false
  }
}

onMounted(load)
</script>

<template>
  <div class="animate-fade-up">
    <PageHeader
      title="员工账号"
      subtitle="查看本系统已建档的门店员工，可停用或恢复访问；账号由员工首次登录时按 ERP 档案自动建档"
    >
      <template #actions>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="load">
          <BaseIcon name="refresh" :size="16" />
          刷新
        </button>
      </template>
    </PageHeader>

    <!-- 筛选 -->
    <div class="card p-4 mb-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-neutral-500">
          <BaseIcon name="user" :size="16" class="text-neutral-400" />
          <span>共 {{ total }} 名员工</span>
          <span class="text-neutral-300">·</span>
          <span>本页启用 {{ pageActive }} 名</span>
          <template v-if="pagePendingPassword > 0">
            <span class="text-neutral-300">·</span>
            <span class="text-feedback-warning">{{ pagePendingPassword }} 名待改初始密码</span>
          </template>
        </div>

        <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div class="relative w-full sm:w-[300px]">
            <BaseIcon name="search" :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              v-model="keyword"
              class="input pl-9"
              type="search"
              placeholder="工号 / 姓名 / 手机号 / 门店"
              aria-label="搜索员工"
            />
          </div>
          <select v-model="status" class="select sm:w-[140px]" aria-label="按状态筛选">
            <option value="">全部状态</option>
            <option value="ACTIVE">已启用</option>
            <option value="DISABLED">已停用</option>
          </select>
        </div>
      </div>
    </div>

    <!-- 骨架 -->
    <div v-if="loading" class="card p-4 space-y-3">
      <div v-for="index in 6" :key="index" class="flex items-center gap-4">
        <div class="skeleton h-10 w-10 rounded-pill" />
        <div class="skeleton h-3 flex-1" />
        <div class="skeleton h-3 w-24" />
        <div class="skeleton h-3 w-20" />
        <div class="skeleton h-3 w-28" />
      </div>
    </div>

    <!-- 无权限 -->
    <div v-else-if="forbidden" class="card">
      <EmptyState
        icon="shield"
        title="无权限查看员工账号"
        description="当前账号无法访问员工列表，请联系超级管理员确认账号状态。"
      >
        <template #action>
          <button type="button" class="btn btn-secondary" @click="$router.push('/admin')">返回数据总览</button>
        </template>
      </EmptyState>
    </div>

    <!-- 错误 -->
    <div v-else-if="errorMessage" class="card">
      <EmptyState icon="alert" title="员工列表加载失败" :description="errorMessage">
        <template #action>
          <button type="button" class="btn btn-primary" @click="load">重新加载</button>
        </template>
      </EmptyState>
    </div>

    <!-- 空 -->
    <div v-else-if="items.length === 0" class="card">
      <EmptyState
        icon="user"
        :title="hasFilter ? '没有匹配的员工' : '还没有建档员工'"
        :description="
          hasFilter
            ? '换个关键词或状态试试，也可以清空筛选条件。'
            : '员工首次用手机号登录后，系统会按 ERP 档案自动建档并显示在这里。'
        "
      >
        <template #action>
          <button v-if="hasFilter" type="button" class="btn btn-secondary" @click="resetFilters">清空筛选</button>
        </template>
      </EmptyState>
    </div>

    <!-- 表格 -->
    <template v-else>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>员工</th>
              <th>工号</th>
              <th>手机号</th>
              <th>状态</th>
              <th>首次改密</th>
              <th>最近登录</th>
              <th class="w-32">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="employee in items" :key="employee.id">
              <td>
                <div class="flex items-center gap-3 min-w-0">
                  <span
                    class="w-10 h-10 shrink-0 inline-flex items-center justify-center rounded-pill bg-brand-100 text-brand-600 text-body font-medium"
                  >
                    {{ initialOf(employee) }}
                  </span>
                  <div class="min-w-0">
                    <p class="text-body font-medium text-neutral-900 truncate">{{ displayNameOf(employee) }}</p>
                    <p class="text-micro text-neutral-400">#{{ employee.id }}</p>
                  </div>
                </div>
              </td>
              <td class="text-caption font-mono whitespace-nowrap">{{ employee.employeeId || '—' }}</td>
              <td class="text-caption font-mono whitespace-nowrap">{{ employee.phone || '—' }}</td>
              <td><StatusBadge :status="employee.status" /></td>
              <td>
                <span v-if="employee.mustChangePassword" class="badge badge-warning">待改密</span>
                <span v-else class="text-caption text-neutral-500">已改密</span>
              </td>
              <td class="text-caption whitespace-nowrap">
                <template v-if="employee.lastLoginAt">{{ formatDateTime(employee.lastLoginAt) }}</template>
                <span v-else class="text-neutral-400">从未登录</span>
              </td>
              <td>
                <button
                  type="button"
                  class="btn-row"
                  :class="employee.status === 'ACTIVE' ? 'is-danger' : 'is-primary'"
                  @click="openToggle(employee)"
                >
                  {{ employee.status === 'ACTIVE' ? '停用' : '启用' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <PaginationBar :page="page" :page-size="PAGE_SIZE" :total="total" @update:page="page = $event" />
    </template>

    <!-- 启用 / 停用确认 -->
    <BaseModal
      :open="toggle.open"
      :title="toggle.nextStatus === 'ACTIVE' ? '启用员工账号' : '停用员工账号'"
      :description="
        toggle.nextStatus === 'ACTIVE'
          ? '启用后该员工可以重新登录，原密码、领取与下载记录都会保留。'
          : '停用后该员工无法登录，已登录的页面与未过期的预览、下载链接也会立即失效；历史记录不受影响。'
      "
      :width="440"
      @close="toggle.open = false"
    >
      <p v-if="toggle.employee" class="text-caption text-neutral-600">
        员工：<span class="font-medium text-neutral-900">{{ displayNameOf(toggle.employee) }}</span>
        <span v-if="toggle.employee.employeeId" class="text-neutral-400">（工号 {{ toggle.employee.employeeId }}）</span>
      </p>

      <template #footer>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="toggle.submitting" @click="toggle.open = false">
          取消
        </button>
        <button
          type="button"
          class="btn btn-sm"
          :class="toggle.nextStatus === 'ACTIVE' ? 'btn-primary' : 'btn-danger'"
          :disabled="toggle.submitting"
          @click="submitToggle"
        >
          {{ toggle.submitting ? '处理中…' : toggle.nextStatus === 'ACTIVE' ? '确认启用' : '确认停用' }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>
