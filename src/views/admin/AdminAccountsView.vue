<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { accountApi } from '../../api'
import { ApiError } from '../../api/client'
import type { AdminAccount, AdminAccountStatus } from '../../api/types'
import { useToast } from '../../composables/useToast'
import { formatDateTime } from '../../utils/format'
import PageHeader from '../../components/ui/PageHeader.vue'
import BaseIcon from '../../components/ui/BaseIcon.vue'
import BaseModal from '../../components/ui/BaseModal.vue'
import EmptyState from '../../components/ui/EmptyState.vue'
import StatusBadge from '../../components/ui/StatusBadge.vue'

const { success, error: toastError } = useToast()

const items = ref<AdminAccount[]>([])
const loading = ref(true)
const forbidden = ref(false)
const errorMessage = ref('')
const keyword = ref('')

const filtered = computed(() => {
  const value = keyword.value.trim().toLowerCase()
  if (!value) return items.value
  return items.value.filter(
    (item) =>
      item.username.toLowerCase().includes(value) || item.displayName.toLowerCase().includes(value),
  )
})

const activeCount = computed(() => items.value.filter((item) => item.status === 'ACTIVE').length)

/* ---------------- 新建子账号 ---------------- */

const create = reactive({
  open: false,
  submitting: false,
  error: '',
  form: { username: '', displayName: '', password: '', confirmPassword: '' },
})

function openCreate() {
  create.form.username = ''
  create.form.displayName = ''
  create.form.password = ''
  create.form.confirmPassword = ''
  create.error = ''
  create.submitting = false
  create.open = true
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

function validateCreate(): string {
  const username = create.form.username.trim()
  if (!username) return '请输入登录账号'
  if (/\s/.test(username)) return '登录账号不能包含空格'
  if (username.length > 100) return '登录账号最多 100 个字符'
  if (!create.form.displayName.trim()) return '请输入管理员姓名'
  if (create.form.displayName.trim().length > 100) return '管理员姓名最多 100 个字符'
  const size = byteLength(create.form.password)
  if (size < 10) return '初始密码至少 10 个字节'
  if (size > 72) return '初始密码最多 72 个字节'
  if (!/[A-Za-z]/.test(create.form.password) || !/\d/.test(create.form.password)) {
    return '初始密码需同时包含字母和数字'
  }
  if (create.form.confirmPassword !== create.form.password) return '两次输入的密码不一致'
  return ''
}

async function submitCreate() {
  if (create.submitting) return
  create.error = validateCreate()
  if (create.error) return

  create.submitting = true
  try {
    await accountApi.create({
      username: create.form.username.trim(),
      displayName: create.form.displayName.trim(),
      password: create.form.password,
    })
    success('子账号已创建，请把初始密码告知对应管理员')
    create.open = false
    await load()
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      create.error = '该登录账号已存在，请更换账号'
    } else if (error instanceof ApiError && error.status === 403) {
      create.error = '只有超级管理员可以创建子账号'
    } else {
      create.error = error instanceof Error ? error.message : '创建失败，请重试'
    }
  } finally {
    create.submitting = false
  }
}

/* ---------------- 启用 / 停用 ---------------- */

const toggle = reactive({
  open: false,
  submitting: false,
  account: null as AdminAccount | null,
  nextStatus: 'DISABLED' as AdminAccountStatus,
})

function openToggle(account: AdminAccount) {
  toggle.account = account
  toggle.nextStatus = account.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
  toggle.open = true
}

async function submitToggle() {
  if (!toggle.account || toggle.submitting) return
  toggle.submitting = true
  try {
    await accountApi.setStatus(toggle.account.userId, toggle.nextStatus)
    success(toggle.nextStatus === 'ACTIVE' ? '账号已启用' : '账号已停用')
    toggle.open = false
    await load()
  } catch (error) {
    toastError(error instanceof Error ? error.message : '操作失败，请重试')
  } finally {
    toggle.submitting = false
  }
}

/* ---------------- 加载 ---------------- */

async function load() {
  loading.value = true
  errorMessage.value = ''
  forbidden.value = false
  try {
    const res = await accountApi.list()
    items.value = res.items
  } catch (error) {
    items.value = []
    if (error instanceof ApiError && error.status === 403) forbidden.value = true
    else errorMessage.value = error instanceof Error ? error.message : '账号列表加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="animate-fade-up">
    <PageHeader title="账号管理" subtitle="创建并管理总部管理子账号，仅超级管理员可操作">
      <template #actions>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="load">
          <BaseIcon name="refresh" :size="16" />
          刷新
        </button>
        <button type="button" class="btn btn-primary btn-sm" :disabled="forbidden" @click="openCreate">
          <BaseIcon name="plus" :size="16" />
          新建管理员子账号
        </button>
      </template>
    </PageHeader>

    <div class="card p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2 text-caption text-neutral-500">
        <BaseIcon name="users" :size="16" class="text-neutral-400" />
        <span>共 {{ items.length }} 个子账号，其中 {{ activeCount }} 个启用中</span>
      </div>
      <div class="relative w-full sm:w-[280px]">
        <BaseIcon name="search" :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input v-model="keyword" class="input pl-9" type="search" placeholder="搜索账号或姓名" />
      </div>
    </div>

    <!-- 骨架 -->
    <div v-if="loading" class="card p-4 space-y-3">
      <div v-for="index in 5" :key="index" class="flex items-center gap-4">
        <div class="skeleton h-10 w-10 rounded-pill" />
        <div class="skeleton h-3 flex-1" />
        <div class="skeleton h-3 w-20" />
        <div class="skeleton h-3 w-28" />
      </div>
    </div>

    <!-- 无权限 -->
    <div v-else-if="forbidden" class="card">
      <EmptyState
        icon="shield"
        title="仅超级管理员可管理子账号"
        description="当前账号是管理子账号，可以继续使用素材、任务与日志等后台功能。"
      >
        <template #action>
          <button type="button" class="btn btn-secondary" @click="$router.push('/portal')">返回数据总览</button>
        </template>
      </EmptyState>
    </div>

    <!-- 错误 -->
    <div v-else-if="errorMessage" class="card">
      <EmptyState icon="alert" title="账号列表加载失败" :description="errorMessage">
        <template #action>
          <button type="button" class="btn btn-primary" @click="load">重新加载</button>
        </template>
      </EmptyState>
    </div>

    <!-- 空 -->
    <div v-else-if="filtered.length === 0" class="card">
      <EmptyState
        icon="users"
        :title="keyword ? '没有匹配的子账号' : '还没有子账号'"
        :description="
          keyword ? '换个关键词试试，或清空搜索条件。' : '创建子账号后，对应管理员可用该账号登录后台处理素材与任务。'
        "
      >
        <template #action>
          <button v-if="keyword" type="button" class="btn btn-secondary" @click="keyword = ''">清空搜索</button>
          <button v-else type="button" class="btn btn-primary" @click="openCreate">新建管理员子账号</button>
        </template>
      </EmptyState>
    </div>

    <!-- 表格 -->
    <div v-else class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>登录账号</th>
            <th>管理员姓名</th>
            <th>状态</th>
            <th>创建时间</th>
            <th class="w-32">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="account in filtered" :key="account.userId">
            <td>
              <div class="flex items-center gap-3 min-w-0">
                <span
                  class="w-10 h-10 shrink-0 inline-flex items-center justify-center rounded-pill bg-brand-100 text-brand-600 text-body font-medium"
                >
                  {{ account.displayName.trim().charAt(0).toUpperCase() || 'A' }}
                </span>
                <div class="min-w-0">
                  <p class="text-body font-medium text-neutral-900 truncate">{{ account.username }}</p>
                </div>
              </div>
            </td>
            <td class="text-caption">{{ account.displayName }}</td>
            <td><StatusBadge :status="account.status" /></td>
            <td class="text-caption whitespace-nowrap">{{ formatDateTime(account.createdAt) }}</td>
            <td>
              <button
                type="button"
                class="btn-row"
                :class="account.status === 'ACTIVE' ? 'is-danger' : 'is-primary'"
                @click="openToggle(account)"
              >
                {{ account.status === 'ACTIVE' ? '停用' : '启用' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 新建子账号 -->
    <BaseModal
      :open="create.open"
      title="新建管理员子账号"
      description="子账号可登录后台处理素材与任务，但不能创建其他账号。"
      :width="480"
      @close="create.open = false"
    >
      <form id="create-account-form" novalidate @submit.prevent="submitCreate">
        <div
          v-if="create.error"
          role="alert"
          class="mb-4 flex items-start gap-2 rounded-control bg-feedback-danger-bg px-3.5 py-3 text-[13px] leading-[19px] text-feedback-on-danger"
        >
          <BaseIcon name="alert" :size="18" class="mt-px shrink-0" />
          <span>{{ create.error }}</span>
        </div>

        <div class="space-y-4">
          <div>
            <label class="label" for="account-username">登录账号</label>
            <input
              id="account-username"
              v-model="create.form.username"
              class="input"
              type="text"
              autocomplete="off"
              placeholder="不含空格的账号，如 zhangsan"
            />
          </div>

          <div>
            <label class="label" for="account-name">管理员姓名</label>
            <input
              id="account-name"
              v-model="create.form.displayName"
              class="input"
              type="text"
              autocomplete="off"
              placeholder="用于列表与领取记录展示"
            />
          </div>

          <div>
            <label class="label" for="account-password">初始密码</label>
            <input
              id="account-password"
              v-model="create.form.password"
              class="input"
              type="password"
              autocomplete="new-password"
              placeholder="10-72 个字节，含字母和数字"
            />
          </div>

          <div>
            <label class="label" for="account-confirm">确认初始密码</label>
            <input
              id="account-confirm"
              v-model="create.form.confirmPassword"
              class="input"
              type="password"
              autocomplete="new-password"
              placeholder="再次输入初始密码"
            />
          </div>
        </div>
      </form>

      <template #footer>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="create.submitting" @click="create.open = false">
          取消
        </button>
        <button type="submit" form="create-account-form" class="btn btn-primary btn-sm" :disabled="create.submitting">
          {{ create.submitting ? '创建中…' : '创建账号' }}
        </button>
      </template>
    </BaseModal>

    <!-- 启用 / 停用确认 -->
    <BaseModal
      :open="toggle.open"
      :title="toggle.nextStatus === 'ACTIVE' ? '启用子账号' : '停用子账号'"
      :description="
        toggle.nextStatus === 'ACTIVE'
          ? '启用后该账号可以立即登录后台。'
          : '停用后该账号无法登录，已产生的操作记录不受影响。'
      "
      :width="440"
      @close="toggle.open = false"
    >
      <div v-if="toggle.account" class="rounded-card bg-neutral-50 border border-neutral-100 px-4 py-3">
        <p class="text-body font-medium text-neutral-900 truncate">{{ toggle.account.displayName }}</p>
        <p class="mt-1 text-micro text-neutral-500">{{ toggle.account.username }} · #{{ toggle.account.userId }}</p>
      </div>

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
