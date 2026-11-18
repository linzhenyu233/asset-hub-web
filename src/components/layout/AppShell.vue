<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PASSWORD_REQUIRED_EVENT, SESSION_EXPIRED_EVENT } from '../../api/client'
import { useSession } from '../../stores/session'
import BrandMark from '../ui/BrandMark.vue'
import BaseIcon from '../ui/BaseIcon.vue'
import AccountDrawer from '../ui/AccountDrawer.vue'
import ChangePasswordModal from '../ui/ChangePasswordModal.vue'

const route = useRoute()
const router = useRouter()
const {
  state,
  isSuperAdmin,
  mustChangePassword,
  isPreview,
  logout,
  markPasswordRequired,
  clearSession,
} = useSession()

const collapsed = ref(false)
const mobileOpen = ref(false)
const accountOpen = ref(false)

interface NavItem {
  to: string
  label: string
  icon: string
  /** 仅超级管理员可见的菜单 */
  superAdminOnly?: boolean
}

const adminNav: NavItem[] = [
  { to: '/portal', label: '数据总览', icon: 'dashboard' },
  { to: '/portal/upload', label: '素材入库', icon: 'upload' },
  { to: '/portal/assets', label: '素材管理', icon: 'image' },
  { to: '/portal/tasks', label: '任务管理', icon: 'clipboard' },
  { to: '/portal/download-logs', label: '下载记录', icon: 'download' },
  { to: '/portal/operation-logs', label: '操作日志', icon: 'list' },
  { to: '/portal/accounts', label: '账号管理', icon: 'users' },
]

const nav = computed(() => adminNav.filter((item) => !item.superAdminOnly || isSuperAdmin.value))

// 后端用 403 PASSWORD_CHANGE_REQUIRED 拒绝业务接口时，立刻弹强制改密
function onPasswordRequired() {
  markPasswordRequired()
}

/** 任意业务接口返回 401（会话被撤销/过期）：清本地身份并回登录页，别留在打不开的页面上 */
function onSessionExpired() {
  clearSession()
  if (route.path !== '/login') void router.replace('/login')
}

onMounted(() => {
  window.addEventListener(PASSWORD_REQUIRED_EVENT, onPasswordRequired)
  window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired)
})
onBeforeUnmount(() => {
  window.removeEventListener(PASSWORD_REQUIRED_EVENT, onPasswordRequired)
  window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired)
})

const displayName = computed(
  () => state.user?.displayName || state.user?.username || state.user?.phone || '未命名用户',
)

const initial = computed(() => displayName.value.trim().charAt(0).toUpperCase() || 'U')

const roleLabel = '总部 · 钻石世家'
const pageTitle = computed(() => (route.meta.title as string) || '素材中心')

// 列表/表格类页面放宽内容宽度，阅读型页面仍用设计令牌的 1200px
const isWide = computed(() => route.meta.wide === true)

function isActive(to: string): boolean {
  if (to === '/portal') return route.path === '/portal'
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
          <p class="text-micro text-neutral-500 leading-tight truncate">素材中心</p>
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

      <main class="pt-topbar min-h-screen flex flex-col">
        <!--
          内容区宽度随视口分级：常规页 1200 → 1400 → 1600，列表/表格页 1600 → 1760 → 2000。
          大屏（2K/4K）不再被 1200px 卡住导致页面看着很小。
          注意：目前所有子路由都标了 meta.wide，下面的常规页分支暂无页面使用，留给阅读型页面。
        -->
        <div
          class="flex-1 px-4 py-4 sm:py-5"
          :class="
            isWide
              ? 'mx-auto w-full max-w-[1600px] sm:px-10 2xl:max-w-[1760px] 2xl:px-12 3xl:max-w-[2000px]'
              : 'mx-auto w-full max-w-content sm:px-6 2xl:max-w-[1400px] 2xl:px-10 3xl:max-w-[1600px]'
          "
        >
          <RouterView />
        </div>

        <!-- 页脚：备案号（工信部备案系统可查） -->
        <footer class="px-4 pb-5 pt-1 text-center text-micro text-neutral-400 sm:px-10">
          <span>© 2026 钻石世家 素材中心</span>
          <span class="mx-2 text-neutral-300">·</span>
          <a
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
            class="transition-colors hover:text-neutral-600"
          >
            粤ICP备14072589号-4
          </a>
        </footer>
      </main>
    </div>

    <AccountDrawer :open="accountOpen" @close="accountOpen = false" />

    <!-- 这里只负责首次强制改密；主动改密在账号抽屉里 -->
    <ChangePasswordModal :open="mustChangePassword" forced />
  </div>
</template>
