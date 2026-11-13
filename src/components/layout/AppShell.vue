<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PASSWORD_REQUIRED_EVENT } from '../../api/client'
import { useSession } from '../../stores/session'
import BrandMark from '../ui/BrandMark.vue'
import BaseIcon from '../ui/BaseIcon.vue'
import AccountDrawer from '../ui/AccountDrawer.vue'
import ChangePasswordModal from '../ui/ChangePasswordModal.vue'

const route = useRoute()
const router = useRouter()
const { state, isSuperAdmin, mustChangePassword, isPreview, logout, markPasswordRequired } =
  useSession()

const collapsed = ref(false)
const mobileOpen = ref(false)
const passwordOpen = ref(false)
const accountOpen = ref(false)

interface NavItem {
  to: string
  label: string
  icon: string
  /** 仅超级管理员可见的菜单 */
  superAdminOnly?: boolean
}

const adminNav: NavItem[] = [
  { to: '/admin', label: '数据总览', icon: 'dashboard' },
  { to: '/admin/assets', label: '素材管理', icon: 'image' },
  { to: '/admin/upload', label: '素材入库', icon: 'upload' },
  { to: '/admin/tasks', label: '任务管理', icon: 'clipboard' },
  { to: '/admin/download-logs', label: '下载记录', icon: 'download' },
  { to: '/admin/operation-logs', label: '操作日志', icon: 'list' },
  { to: '/admin/accounts', label: '账号管理', icon: 'users', superAdminOnly: true },
]

const nav = computed(() => adminNav.filter((item) => !item.superAdminOnly || isSuperAdmin.value))

const passwordModalOpen = computed(() => passwordOpen.value || mustChangePassword.value)

// 后端用 403 PASSWORD_CHANGE_REQUIRED 拒绝业务接口时，立刻弹强制改密
function onPasswordRequired() {
  markPasswordRequired()
}

onMounted(() => window.addEventListener(PASSWORD_REQUIRED_EVENT, onPasswordRequired))
onBeforeUnmount(() => window.removeEventListener(PASSWORD_REQUIRED_EVENT, onPasswordRequired))

const displayName = computed(
  () => state.user?.displayName || state.user?.username || state.user?.phone || '未命名用户',
)

const initial = computed(() => displayName.value.trim().charAt(0).toUpperCase() || 'U')

const roleLabel = '总部 · 管理员'
const pageTitle = computed(() => (route.meta.title as string) || '云素材中台')

// 列表/表格类页面放宽内容宽度，阅读型页面仍用设计令牌的 1200px
const isWide = computed(() => route.meta.wide === true)

function isActive(to: string): boolean {
  if (to === '/admin') return route.path === '/admin'
  return route.path === to || route.path.startsWith(`${to}/`)
}

async function handleLogout() {
  await logout()
  router.push('/login')
}

watch(
  () => route.path,
  () => {
    mobileOpen.value = false
  },
)
</script>

<template>
  <div class="min-h-screen bg-neutral-50">
    <!-- 移动端遮罩 -->
    <div
      v-if="mobileOpen"
      class="fixed inset-0 z-sticky bg-neutral-900/40 md:hidden"
      @click="mobileOpen = false"
    />

    <!-- 侧栏 -->
    <aside
      class="fixed inset-y-0 left-0 z-sticky flex flex-col bg-neutral-0 border-r border-neutral-100
        transition-all duration-base ease-standard"
      :class="[
        collapsed ? 'md:w-sidebar-min' : 'md:w-sidebar',
        'w-sidebar',
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      ]"
    >
      <!-- 品牌 -->
      <div class="h-topbar flex items-center gap-3 px-5 shrink-0">
        <BrandMark variant="dark" :size="28" />
        <div v-show="!collapsed" class="min-w-0 text-center">
          <p class="text-[15px] font-bold text-neutral-900 leading-tight truncate tracking-[0.06em]">
            SHINING HOUSE
          </p>
          <p class="text-micro text-neutral-500 leading-tight truncate">云素材中台</p>
        </div>
      </div>

      <!-- 导航 -->
      <nav class="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        <button
          v-for="item in nav"
          :key="item.to"
          type="button"
          class="nav-item w-full text-left"
          :class="{ 'is-active': isActive(item.to), 'justify-center px-0': collapsed }"
          :title="collapsed ? item.label : undefined"
          @click="router.push(item.to)"
        >
          <BaseIcon :name="item.icon" :size="18" />
          <span v-show="!collapsed">{{ item.label }}</span>
        </button>
      </nav>

      <!-- 底部：用户 -->
      <div class="px-3 pb-3 space-y-2 shrink-0">
        <div
          class="flex rounded-control"
          :class="collapsed ? 'flex-col items-center gap-1 p-1' : 'items-center gap-1 p-1'"
        >
          <!-- 点击头像 / 姓名打开账号信息抽屉 -->
          <button
            type="button"
            class="group flex items-center gap-2 min-w-0 flex-1 rounded-control px-1 py-1 text-left
              transition-colors hover:bg-neutral-50 focus-visible:bg-neutral-50"
            :class="collapsed ? 'justify-center' : ''"
            title="查看账号信息"
            aria-label="查看账号信息"
            :aria-expanded="accountOpen"
            @click="accountOpen = true"
          >
            <span
              class="w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-pill bg-brand-100 text-brand-600 text-[13px] font-medium
                transition-shadow group-hover:shadow-e2"
            >
              {{ initial }}
            </span>
            <span v-show="!collapsed" class="min-w-0 flex-1 block">
              <span class="block text-caption font-medium text-neutral-900 truncate">{{ displayName }}</span>
              <span class="block text-micro text-neutral-500 truncate">{{ roleLabel }}</span>
            </span>
            <BaseIcon
              v-show="!collapsed"
              name="chevron-right"
              :size="14"
              class="text-neutral-400 transition-colors group-hover:text-neutral-600"
            />
          </button>
          <button
            type="button"
            class="inline-flex items-center justify-center rounded-control text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 transition-colors"
            :class="collapsed ? 'w-6 h-6' : 'w-8 h-8'"
            title="退出登录"
            aria-label="退出登录"
            @click="handleLogout"
          >
            <BaseIcon name="logout" :size="collapsed ? 14 : 16" />
          </button>
        </div>

        <!-- 收起 / 展开：始终可见，图标方向随状态切换 -->
        <button
          type="button"
          class="hidden md:flex w-full items-center justify-center gap-1 h-8 rounded-control text-micro text-neutral-500 hover:bg-neutral-50"
          :title="collapsed ? '展开侧栏' : '收起侧栏'"
          :aria-label="collapsed ? '展开侧栏' : '收起侧栏'"
          :aria-expanded="!collapsed"
          @click="collapsed = !collapsed"
        >
          <BaseIcon :name="collapsed ? 'chevron-right' : 'chevron-left'" :size="14" />
          <span v-if="!collapsed">收起侧栏</span>
        </button>
      </div>
    </aside>

    <!-- 主区域 -->
    <div
      class="transition-all duration-base ease-standard"
      :class="collapsed ? 'md:pl-sidebar-min' : 'md:pl-sidebar'"
    >
      <!-- 顶栏：内容与页面内容区同宽对齐 -->
      <header
        class="fixed top-0 right-0 left-0 z-sticky h-topbar bg-neutral-0/90 backdrop-blur border-b border-neutral-200"
        :class="collapsed ? 'md:left-sidebar-min' : 'md:left-sidebar'"
      >
        <div class="h-full w-full px-4 sm:px-10 flex items-center gap-3">
          <button
            type="button"
            class="md:hidden w-9 h-9 inline-flex items-center justify-center rounded-control text-neutral-600 hover:bg-neutral-100"
            aria-label="打开菜单"
            @click="mobileOpen = true"
          >
            <BaseIcon name="menu" :size="18" />
          </button>

          <!-- 唯一顶栏：直接显示当前页面名，靠左 -->
          <div class="flex min-w-0 flex-1 items-center gap-2">
            <!-- 品牌锚点：页头左侧 3px 渐变竖条 -->
            <span
              class="h-4 w-[3px] shrink-0 rounded-pill"
              style="background: linear-gradient(180deg, #e85d8e 0%, #f29cbb 100%)"
            />
            <h1 class="min-w-0 truncate text-[18px] font-bold text-neutral-900">{{ pageTitle }}</h1>
          </div>

          <!-- 页面操作按钮由各页 PageHeader 传送到这里 -->
          <div id="topbar-actions" class="flex items-center gap-2 shrink-0"></div>

          <span v-if="isPreview" class="badge badge-warning hidden sm:inline-flex shrink-0">演示数据</span>
        </div>
      </header>

      <main class="pt-topbar">
        <div
          class="px-4 py-4 sm:py-5"
          :class="isWide ? 'w-full sm:px-10' : 'max-w-content mx-auto sm:px-6'"
        >
          <RouterView />
        </div>
      </main>
    </div>

    <AccountDrawer :open="accountOpen" @close="accountOpen = false" />

    <ChangePasswordModal
      :open="passwordModalOpen"
      :forced="mustChangePassword"
      @close="passwordOpen = false"
      @success="passwordOpen = false"
    />
  </div>
</template>
