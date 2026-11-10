<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSession } from '../../stores/session'
import BaseDrawer from './BaseDrawer.vue'
import BaseIcon from './BaseIcon.vue'
import ChangePasswordModal from './ChangePasswordModal.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const router = useRouter()
const { state, mustChangePassword, logout } = useSession()

const passwordOpen = ref(false)
const loggingOut = ref(false)

const user = computed(() => state.user)

const displayName = computed(
  () => user.value?.displayName || user.value?.username || user.value?.phone || '未命名用户',
)
const initial = computed(() => displayName.value.trim().charAt(0).toUpperCase() || 'U')

const roleText = computed(() => {
  if (!user.value) return '—'
  if (user.value.isSuperAdmin) return '超级管理员'
  return user.value.role === 'ADMIN' ? '管理子账号' : '门店员工'
})
const roleBadgeClass = computed(() =>
  user.value?.isSuperAdmin ? 'badge badge-brand' : 'badge badge-neutral',
)

/** 后端 /api/account/me 已返回全部字段，此处仅展示，不再发请求 */
const rows = computed(() => {
  const u = user.value
  return [
    { label: '登录账号', value: u?.username || '—', mono: true },
    { label: '手机号', value: u?.phone || '—', mono: false },
    { label: '所属门店', value: u?.storeName || (u?.isSuperAdmin ? '总部' : '—'), mono: false },
    { label: '用户 ID', value: u ? `#${u.id}` : '—', mono: true },
  ]
})

async function handleLogout() {
  loggingOut.value = true
  try {
    await logout()
    emit('close')
    router.push('/login')
  } finally {
    loggingOut.value = false
  }
}
</script>

<template>
  <BaseDrawer :open="props.open" title="账号信息" :width="420" @close="emit('close')">
    <div class="card p-5">
      <div class="flex items-center gap-3">
        <span
          class="w-12 h-12 shrink-0 inline-flex items-center justify-center rounded-pill bg-brand-100 text-brand-600 text-lg font-medium"
        >
          {{ initial }}
        </span>
        <div class="min-w-0">
          <p class="text-[16px] font-bold text-neutral-900 truncate">{{ displayName }}</p>
          <div class="mt-1 flex items-center gap-2 flex-wrap">
            <span :class="roleBadgeClass">{{ roleText }}</span>
            <span v-if="mustChangePassword" class="badge badge-warning">待修改初始密码</span>
          </div>
        </div>
      </div>
    </div>

    <div class="card p-5 mt-4">
      <h3 class="section-title">基本信息</h3>
      <dl class="mt-3 divide-y divide-neutral-100">
        <div
          v-for="row in rows"
          :key="row.label"
          class="flex items-start justify-between gap-4 py-2.5"
        >
          <dt class="text-caption text-neutral-500 shrink-0">{{ row.label }}</dt>
          <dd
            class="text-caption text-neutral-900 text-right break-all"
            :class="row.mono ? 'font-mono' : ''"
          >
            {{ row.value }}
          </dd>
        </div>
      </dl>
      <p class="help-text mt-3">账号资料由后台同步，如需变更手机号或门店请联系超级管理员。</p>
    </div>

    <div class="card p-5 mt-4">
      <h3 class="section-title">账号安全</h3>
      <p class="mt-2 text-caption text-neutral-500 leading-[20px]">
        修改密码后当前凭证失效，其他已登录设备需使用新密码重新登录。
      </p>
      <button type="button" class="btn btn-secondary mt-3 w-full" @click="passwordOpen = true">
        <BaseIcon name="lock" :size="16" />
        修改密码
      </button>
    </div>

    <template #footer>
      <button type="button" class="btn btn-ghost" :disabled="loggingOut" @click="handleLogout">
        <BaseIcon name="logout" :size="16" />
        {{ loggingOut ? '正在退出…' : '退出登录' }}
      </button>
    </template>
  </BaseDrawer>

  <ChangePasswordModal
    :open="passwordOpen"
    @close="passwordOpen = false"
    @success="passwordOpen = false"
  />
</template>
