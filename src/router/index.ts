import { createRouter, createWebHistory } from 'vue-router'
import { useSession } from '../stores/session'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { public: true, title: '登录' },
    },
    {
      path: '/',
      component: () => import('../components/layout/AppShell.vue'),
      children: [
        {
          path: '',
          redirect: () => {
            const { state, isAdmin } = useSession()
            if (!state.user || !isAdmin.value) return '/login'
            return '/portal'
          },
        },
        {
          path: 'portal',
          name: 'admin-dashboard',
          component: () => import('../views/admin/DashboardView.vue'),
          meta: { title: '数据总览', role: 'ADMIN', wide: true },
        },
        {
          path: 'portal/assets',
          name: 'admin-assets',
          component: () => import('../views/admin/AdminAssetsView.vue'),
          meta: { title: '素材管理', role: 'ADMIN', wide: true },
        },
        {
          path: 'portal/assets/:id',
          name: 'admin-asset-detail',
          component: () => import('../views/admin/AdminAssetDetailView.vue'),
          meta: { title: '素材详情', role: 'ADMIN', wide: true },
        },
        {
          path: 'portal/upload',
          name: 'admin-upload',
          component: () => import('../views/admin/UploadView.vue'),
          meta: { title: '素材入库', role: 'ADMIN', wide: true },
        },
        {
          path: 'portal/tasks',
          name: 'admin-tasks',
          component: () => import('../views/admin/AdminTasksView.vue'),
          meta: { title: '任务管理', role: 'ADMIN', wide: true },
        },
        {
          path: 'portal/tasks/:id',
          name: 'admin-task-detail',
          component: () => import('../views/admin/AdminTaskDetailView.vue'),
          meta: { title: '任务详情', role: 'ADMIN', wide: true },
        },
        {
          path: 'portal/download-logs',
          name: 'admin-download-logs',
          component: () => import('../views/admin/DownloadLogsView.vue'),
          meta: { title: '下载记录', role: 'ADMIN', wide: true },
        },
        {
          path: 'portal/operation-logs',
          name: 'admin-operation-logs',
          component: () => import('../views/admin/OperationLogsView.vue'),
          meta: { title: '操作日志', role: 'ADMIN', wide: true },
        },
        {
          path: 'portal/employees',
          name: 'admin-employees',
          component: () => import('../views/admin/AdminEmployeesView.vue'),
          meta: { title: '员工账号', role: 'ADMIN', wide: true },
        },
        {
          path: 'portal/accounts',
          name: 'admin-accounts',
          component: () => import('../views/admin/AdminAccountsView.vue'),
          meta: { title: '账号管理', role: 'ADMIN', superAdmin: true, wide: true },
        },
      ],
    },
    {
      // 员工视角（管理端只读预览）：独立布局，不带管理端侧栏
      path: '/assets/:id',
      name: 'employee-asset-detail',
      component: () => import('../views/employee/AssetDetailView.vue'),
      meta: { title: '员工视角', role: 'ADMIN' },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('../views/NotFoundView.vue'),
      meta: { public: true, title: '页面不存在' },
    },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach((to) => {
  const { state, isAdmin, isSuperAdmin } = useSession()

  if (to.meta.public) {
    if (state.user && isAdmin.value) return '/portal'
    return true
  }

  // 本项目只提供总部管理端，非管理员一律回登录页
  if (!state.user || !isAdmin.value) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  // 管理子账号只有唯一超级管理员能查看
  if (to.meta.superAdmin && !isSuperAdmin.value) {
    return '/portal'
  }

  return true
})

router.afterEach((to) => {
  const title = (to.meta.title as string | undefined) || '素材中心'
  document.title = `${title} · 素材中心`
})

export default router
