// 预览模式演示数据：登录接口未部署期间，用内存数据驱动全部 29 个接口。
// 关闭方式：.env.local 里设置 VITE_PREVIEW=false，即切回真实后端。
import type {
  AdminAccount,
  AdminAccountStatus,
  AdminAsset,
  Asset,
  AssetResult,
  Category,
  Claim,
  Dashboard,
  DownloadLog,
  DownloadResult,
  EmployeeAccount,
  Login,
  Operation,
  OperationPage,
  PreviewResult,
  Session,
  Task,
  TaskDetail,
  TaskResult,
  User,
} from '../api/types'
import { mockAdminUser, mockEmployeeUser } from './accounts'

export interface MockRequestOptions {
  method?: string
  query?: Record<string, unknown>
  body?: unknown
}

const NOW = '2026-10-21 10:00:00'

function loginPayload(user: User): Login {
  return { mode: 'FORMAL', expiresAt: '2026-10-28 10:00:00', user }
}

/* ---------------- 基础数据 ---------------- */

const categories: Category[] = [
  // v2.11.0：图片 / 视频分类也允许上传 ZIP 素材包（图片包只含图片、视频包只含视频）
  { id: '1', code: 'IMAGE', name: '图片素材', allowedAssetTypes: ['IMAGE', 'ARCHIVE'] },
  { id: '2', code: 'VIDEO', name: '视频素材', allowedAssetTypes: ['VIDEO', 'ARCHIVE'] },
  { id: '3', code: 'COMPANY', name: '公司素材', allowedAssetTypes: ['IMAGE', 'VIDEO', 'ARCHIVE'] },
  { id: '4', code: 'CAMPAIGN', name: '活动素材', allowedAssetTypes: ['IMAGE', 'VIDEO', 'ARCHIVE'] },
]

const MIME: Record<string, string> = {
  IMAGE: 'image/jpeg',
  VIDEO: 'video/mp4',
  ARCHIVE: 'application/zip',
}

const EXT: Record<string, string> = {
  IMAGE: 'jpg',
  VIDEO: 'mp4',
  ARCHIVE: 'zip',
}

type SeedStatus = 'DRAFT' | 'PUBLISHED' | 'OFFLINE'

interface AssetSeed {
  name: string
  type: 'IMAGE' | 'VIDEO' | 'ARCHIVE'
  category: string
  size: number
  status: SeedStatus
  publishedAt: string | null
}

const assetSeeds: AssetSeed[] = [
  { name: '2026 情人节主视觉 A', type: 'ARCHIVE', category: 'CAMPAIGN', size: 3_240_000, status: 'PUBLISHED', publishedAt: '2026-10-18 09:12:00' },
  { name: '星耀系列戒指 白底图', type: 'IMAGE', category: 'IMAGE', size: 1_820_000, status: 'PUBLISHED', publishedAt: '2026-10-17 14:20:00' },
  { name: '玫瑰金系列 短视频 15s', type: 'VIDEO', category: 'VIDEO', size: 48_500_000, status: 'PUBLISHED', publishedAt: '2026-10-16 11:05:00' },
  { name: '品牌标识规范 2026', type: 'ARCHIVE', category: 'COMPANY', size: 12_400_000, status: 'PUBLISHED', publishedAt: '2026-10-15 16:40:00' },
  { name: '中秋活动通栏长图', type: 'ARCHIVE', category: 'CAMPAIGN', size: 5_600_000, status: 'PUBLISHED', publishedAt: '2026-10-12 10:00:00' },
  { name: '经典对戒 场景图 01', type: 'IMAGE', category: 'IMAGE', size: 2_950_000, status: 'PUBLISHED', publishedAt: '2026-10-11 13:30:00' },
  { name: '门店开业物料包', type: 'ARCHIVE', category: 'CAMPAIGN', size: 84_200_000, status: 'PUBLISHED', publishedAt: '2026-10-10 09:00:00' },
  { name: '珍珠系列 产品视频', type: 'VIDEO', category: 'VIDEO', size: 63_100_000, status: 'PUBLISHED', publishedAt: '2026-10-09 17:15:00' },
  { name: '公司简介 2026 版', type: 'IMAGE', category: 'COMPANY', size: 980_000, status: 'PUBLISHED', publishedAt: '2026-10-08 08:45:00' },
  { name: '国庆活动主视觉', type: 'IMAGE', category: 'CAMPAIGN', size: 4_100_000, status: 'OFFLINE', publishedAt: '2026-09-28 10:00:00' },
  { name: '七夕限定海报', type: 'IMAGE', category: 'CAMPAIGN', size: 3_300_000, status: 'DRAFT', publishedAt: null },
  { name: '项链系列 细节图集', type: 'IMAGE', category: 'IMAGE', size: 7_800_000, status: 'PUBLISHED', publishedAt: '2026-10-06 15:20:00' },
  { name: '导购培训视频 第 3 讲', type: 'VIDEO', category: 'COMPANY', size: 120_000_000, status: 'PUBLISHED', publishedAt: '2026-10-05 09:30:00' },
  { name: '圣诞预热素材包', type: 'ARCHIVE', category: 'CAMPAIGN', size: 56_700_000, status: 'DRAFT', publishedAt: null },
  { name: '星耀系列培训包', type: 'ARCHIVE', category: 'CAMPAIGN', size: 22_000_000, status: 'PUBLISHED', publishedAt: '2026-10-12 15:00:00' },
]

let assetSeq = 100

function buildAsset(seed: AssetSeed): AdminAsset {
  const id = String(++assetSeq)
  const filename = `${seed.name}.${EXT[seed.type]}`
  return {
    id,
    name: seed.name,
    assetType: seed.type,
    categoryCode: seed.category,
    mimeType: MIME[seed.type],
    fileSize: seed.size,
    status: seed.status,
    originalFilename: filename,
    publishedAt: seed.publishedAt,
    // 任务素材都由任务发布流程产生，关联任务；普通素材无任务
    taskId: seed.type === 'ARCHIVE' ? '1' : '',
    storageProvider: 'OSS',
    fileLocator: {
      bucket: 'shining-house-assets',
      corpId: 'ding-corp-7f2a',
      fileId: `oss-${id}-${seed.type.toLowerCase()}`,
      spaceId: 'space-brand-01',
      objectKey: `assets/${seed.category.toLowerCase()}/${id}/${filename}`,
    },
  }
}

const assets: AdminAsset[] = assetSeeds.map(buildAsset)

/* ---------------- 素材包（文件夹型任务素材）的子素材 ---------------- */
// 演示模式模拟子素材；真实模式由后端返回 asset.children。
const packageChildren = new Map<string, Asset>()

function attachPackageChildren(pkg: AdminAsset) {
  const seeds: Array<{ suffix: string; type: 'IMAGE' | 'VIDEO'; size: number }> = [
    { suffix: '-主视觉 01.jpg', type: 'IMAGE', size: 2_400_000 },
    { suffix: '-主视觉 02.jpg', type: 'IMAGE', size: 1_820_000 },
    { suffix: '-朋友圈九宫格 1.jpg', type: 'IMAGE', size: 960_000 },
    { suffix: '-朋友圈九宫格 2.jpg', type: 'IMAGE', size: 910_000 },
    { suffix: '-门店短视频 15s.mp4', type: 'VIDEO', size: 12_600_000 },
  ]

  pkg.children = seeds.map((seed, index) => {
    const filename = `${pkg.name}${seed.suffix}`
    const child: Asset = {
      id: `${pkg.id}-${index + 1}`,
      name: filename,
      assetType: seed.type,
      categoryCode: pkg.categoryCode,
      mimeType: MIME[seed.type],
      fileSize: seed.size,
      status: 'PUBLISHED',
      originalFilename: filename,
      publishedAt: pkg.publishedAt,
      taskId: '',
      parentId: pkg.id,
    }
    packageChildren.set(child.id, child)
    return child
  })

  // v2.10.1：任务素材按 ZIP 顺序带封面（第一项可见图片，没有图片再取视频）
  pkg.cover =
    pkg.children.find((child) => child.assetType === 'IMAGE') ??
    pkg.children.find((child) => child.assetType === 'VIDEO')
}

for (const asset of assets) {
  if (asset.assetType === 'ARCHIVE') attachPackageChildren(asset)
}

/* ---------------- 任务 ---------------- */

interface TaskSeed {
  title: string
  content: string
  claimCount: number
  claimed: boolean
  claimedAt: string | null
  publishedAt: string
  assetIndex: number
}

const taskSeeds: TaskSeed[] = [
  {
    title: '情人节活动素材领取',
    content:
      '请各门店在活动开始前下载主视觉与朋友圈素材，按指引统一更换门头海报。\n领取后请在小程序内上传门店落地照片，便于总部复盘。',
    claimCount: 12,
    claimed: false,
    claimedAt: null,
    publishedAt: '2026-10-18 09:30:00',
    assetIndex: 0,
  },
  {
    title: '中秋门店氛围布置素材',
    content: '包含门头贴、柜台立牌与朋友圈九宫格，打印前请确认尺寸与出血位。',
    claimCount: 8,
    claimed: true,
    claimedAt: '2026-10-16 14:10:00',
    publishedAt: '2026-10-15 10:00:00',
    assetIndex: 4,
  },
  {
    title: '新品「星耀」系列培训包',
    content: '含产品视频、卖点手册与话术，请组织店员在 3 日内完成学习并反馈。',
    claimCount: 5,
    claimed: false,
    claimedAt: null,
    publishedAt: '2026-10-12 16:00:00',
    assetIndex: 14,
  },
  {
    title: '门店开业物料包（华东区）',
    content: '华东区新开门店专用，含易拉宝、地贴与手提袋设计稿，请按门店实际尺寸取用。',
    claimCount: 3,
    claimed: false,
    claimedAt: null,
    publishedAt: '2026-10-10 11:20:00',
    assetIndex: 6,
  },
]

let taskSeq = 0

const tasks: Task[] = taskSeeds.map((seed, index) => ({
  id: String(++taskSeq),
  title: seed.title,
  content: seed.content,
  publishedAt: seed.publishedAt,
  claimCount: seed.claimCount,
  claimed: seed.claimed,
  claimedAt: seed.claimedAt,
  // 演示一个已截止任务，便于查看列表徽章与详情状态
  deadlineAt: index === 1 ? '2026-10-20 23:59:59' : null,
  expired: index === 1,
}))

const taskAssets: Asset[] = taskSeeds.map((seed) => assets[seed.assetIndex])

function toDetail(index: number): TaskDetail {
  const task = tasks[index]
  const asset = taskAssets[index]
  return { ...task, activityAsset: { ...asset, available: asset.status === 'PUBLISHED' } }
}

/* ---------------- 领取记录 ---------------- */

const claimPeople = [
  { name: '陈晓雯', phone: '13711112222', store: '上海静安嘉里中心店' },
  { name: '李梦瑶', phone: '13711113333', store: '北京国贸店' },
  { name: '王思远', phone: '13711114444', store: '广州天河城店' },
  { name: '赵雨桐', phone: '13711115555', store: '深圳万象城店' },
  { name: '周子墨', phone: '13711116666', store: '杭州湖滨银泰店' },
  { name: '孙嘉怡', phone: '13711117777', store: '成都春熙路店' },
]

const claims: Claim[] = claimPeople.map((person, index) => ({
  taskId: '1',
  userId: String(200 + index),
  displayName: person.name,
  phone: person.phone,
  storeName: person.store,
  claimedAt: `2026-10-18 ${String(10 + index).padStart(2, '0')}:24:00`,
}))

/* ---------------- 下载 / 操作日志 ---------------- */

let downloadSeq = 20

const downloadLogs: DownloadLog[] = claimPeople.map((person, index) => {
  const asset = assets[index % 8]
  return {
    id: String(++downloadSeq),
    assetId: asset.id,
    assetName: asset.name,
    createdAt: `2026-10-19 ${String(9 + index).padStart(2, '0')}:15:00`,
    displayName: person.name,
    requestId: `download:demo-${1000 + index}`,
    storageProvider: 'OSS',
    storeName: person.store,
    userId: String(200 + index),
  }
})

let operationSeq = 40

const operations: Operation[] = assets.slice(0, 8).map((asset, index) => {
  const action = index % 3 === 0 ? 'UPLOAD' : index % 3 === 1 ? 'PUBLISH' : 'OFFLINE'
  return {
    id: String(++operationSeq),
    action,
    afterState: action === 'UPLOAD' ? 'DRAFT' : action === 'PUBLISH' ? 'PUBLISHED' : 'OFFLINE',
    beforeState: action === 'UPLOAD' ? '' : 'PUBLISHED',
    fileLocatorSnapshot: asset.fileLocator,
    operatedAt: `2026-10-${String(10 + index).padStart(2, '0')} 15:30:00`,
    operatorId: '1',
    operatorSnapshot: '预览管理员',
    requestId: `op:demo-${2000 + index}`,
    result: index === 7 ? 'FAILED' : 'SUCCESS',
    storageProvider: 'OSS',
    targetId: asset.id,
    targetNameSnapshot: asset.name,
    targetType: 'ASSET',
    ...(index === 7 ? { errorCode: 'OSS_TIMEOUT', errorMessage: '存储服务响应超时，请稍后重试' } : {}),
  } satisfies Operation
})

// 补两条非素材对象记录，便于演示「对象类型」筛选（任务、子账号）
operations.push(
  {
    id: String(++operationSeq),
    action: 'TASK_PUBLISH',
    afterState: 'PUBLISHED',
    beforeState: '',
    fileLocatorSnapshot: {},
    operatedAt: '2026-10-25 10:12:00',
    operatorId: '1',
    operatorSnapshot: '预览管理员',
    requestId: 'op:demo-3001',
    result: 'SUCCESS',
    storageProvider: 'OSS',
    targetId: '4',
    targetNameSnapshot: '门店开业物料包（华东区）',
    targetType: 'TASK',
  } satisfies Operation,
  {
    id: String(++operationSeq),
    action: 'ACCOUNT_CREATE',
    afterState: 'ACTIVE',
    beforeState: '',
    fileLocatorSnapshot: {},
    operatedAt: '2026-10-26 09:40:00',
    operatorId: '1',
    operatorSnapshot: '预览管理员',
    requestId: 'op:demo-3002',
    result: 'SUCCESS',
    storageProvider: 'OSS',
    targetId: '2',
    targetNameSnapshot: 'lindongmei',
    targetType: 'ADMIN_ACCOUNT',
  } satisfies Operation,
)

/* ---------------- 上传会话 ---------------- */

let sessionSeq = 0
const sessions = new Map<string, Session>()

/* ---------------- 管理子账号 ---------------- */

let accountSeq = 2
const mockAccounts: AdminAccount[] = [
  {
    id: '2',
    username: 'ops',
    displayName: '陈昊',
    status: 'ACTIVE',
    createdAt: '2026-10-01 09:30:00',
  },
]

/* ---------------- 员工账号 ---------------- */

/** 已建档员工演示数据：故意包含未登记姓名/工号/手机号、从未登录、待改密等边界情况 */
const mockEmployees: EmployeeAccount[] = [
  {
    id: '1',
    employeeId: '300465',
    displayName: '陈晓雯',
    phone: '13711112222',
    status: 'ACTIVE',
    mustChangePassword: false,
    lastLoginAt: '2026-10-19 09:20:00',
  },
  {
    id: '2',
    employeeId: '300512',
    displayName: '李文静',
    phone: '13800138000',
    status: 'ACTIVE',
    mustChangePassword: true,
    lastLoginAt: '2026-10-18 15:05:00',
  },
  {
    id: '3',
    employeeId: '300778',
    displayName: '王海涛',
    phone: '13566668888',
    status: 'DISABLED',
    mustChangePassword: false,
    lastLoginAt: '2026-09-30 11:40:00',
  },
  {
    id: '4',
    employeeId: null,
    displayName: '张敏',
    phone: null,
    status: 'ACTIVE',
    mustChangePassword: true,
    lastLoginAt: null,
  },
]

/* ---------------- 工具 ---------------- */

function paginate<T>(list: T[], page: number, pageSize: number) {
  const total = list.length
  const start = (page - 1) * pageSize
  return { items: list.slice(start, start + pageSize), page, pageSize, total }
}

/** 预览模式没有真实文件，用内联 SVG 占位 */
function previewPayload(asset: Asset): PreviewResult {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#2b2226"/><text x="400" y="286" fill="#ffffff" font-size="26" font-family="sans-serif" text-anchor="middle">预览模式占位图</text><text x="400" y="330" fill="#c9bcc2" font-size="18" font-family="sans-serif" text-anchor="middle">${asset.name}</text><text x="400" y="366" fill="#8d7f85" font-size="15" font-family="sans-serif" text-anchor="middle">关闭 VITE_PREVIEW 后显示真实文件</text></svg>`
  const url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
  return {
    url,
    // v2.11.0 的 thumbnailUrl：真实环境是 240px JPEG，演示模式复用同一张占位图
    thumbnailUrl: url,
    expiresAt: '2026-10-21 10:05:00',
    filename: asset.originalFilename,
    mimeType: 'image/svg+xml',
    fileSize: asset.fileSize,
  }
}

function str(value: unknown): string {
  return value === undefined || value === null ? '' : String(value)
}

function num(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function includesKeyword(text: string, keyword: string): boolean {
  return keyword === '' || text.toLowerCase().includes(keyword.toLowerCase())
}

/* ---------------- 路由分发 ---------------- */

export function mockRequest<T>(path: string, options: MockRequestOptions = {}): T {
  const method = (options.method || 'GET').toUpperCase()
  const query = options.query ?? {}
  const body = (options.body ?? {}) as Record<string, unknown>
  const segments = path.split('/').filter(Boolean)
  const page = num(query.page, 1)
  const pageSize = Math.min(num(query.pageSize, 20), 100)
  const keyword = str(query.keyword).trim()

  /* 认证 */
  if (path === '/account/me') return mockAdminUser as unknown as T
  if (path === '/auth/admin-login') return loginPayload(mockAdminUser) as unknown as T
  if (path === '/auth/logout') return undefined as unknown as T
  if (path === '/account/password' && method === 'PUT') {
    // 预览模式直接认为改密成功
    return loginPayload({ ...mockAdminUser, mustChangePassword: false }) as unknown as T
  }

  /* 分类 */
  if (segments[0] === 'asset-categories') return { items: categories } as unknown as T

  /* ---------- /api/assets：管理端目前只用到 {id}/download（任务素材内素材下载） ---------- */
  if (segments[0] === 'assets') {
    if (segments.length === 2 && segments[1] === 'previews' && method === 'POST') {
      const ids = Array.isArray(body.assetIds) ? (body.assetIds as unknown[]).map((value) => str(value)) : []
      const items = ids.map((id) => {
        const asset = assets.find((item) => item.id === id && item.status === 'PUBLISHED')
        if (!asset) {
          return { assetId: id, error: { code: 'ASSET_NOT_AVAILABLE', message: '素材不存在或已下架' } }
        }
        if (asset.assetType === 'ARCHIVE') {
          return { assetId: id, error: { code: 'PREVIEW_UNSUPPORTED', message: '该文件类型不支持在线预览' } }
        }
        return { ...previewPayload(asset), assetId: id }
      })
      return { items } as unknown as T
    }

    if (segments.length === 1 && method === 'GET') {
      let list = assets.filter((item) => item.status === 'PUBLISHED')
      const category = str(query.categoryCode)
      const assetType = str(query.assetType)
      if (category) list = list.filter((item) => item.categoryCode === category)
      if (assetType) list = list.filter((item) => item.assetType === assetType)
      if (keyword) list = list.filter((item) => includesKeyword(item.name, keyword) || includesKeyword(item.originalFilename, keyword))
      return paginate(list, page, pageSize) as unknown as T
    }

    const id = segments[1]
    if (segments.length === 2 && method === 'GET') {
      const asset =
        assets.find((item) => item.id === id && item.status === 'PUBLISHED') ?? packageChildren.get(id)
      if (!asset) throw new Error('素材不存在或已下架')
      return asset as unknown as T
    }

    if (segments.length === 3 && segments[2] === 'download' && method === 'POST') {
      const asset =
        assets.find((item) => item.id === id && item.status === 'PUBLISHED') ?? packageChildren.get(id)
      if (!asset) throw new Error('素材不存在或已下架')
      const log: DownloadLog = {
        id: String(++downloadSeq),
        assetId: asset.id,
        assetName: asset.name,
        createdAt: NOW,
        displayName: mockEmployeeUser.displayName,
        requestId: str(body.requestId) || `download:${Date.now()}`,
        storageProvider: (asset as Partial<AdminAsset>).storageProvider ?? 'OSS',
        storeName: mockEmployeeUser.storeName,
        userId: mockEmployeeUser.id,
      }
      downloadLogs.unshift(log)
      const result: DownloadResult = {
        downloadMode: 'PROXY',
        url: `/api/files/demo-${asset.id}`,
        expiresAt: '2026-10-21 10:05:00',
        fileSize: asset.fileSize,
        filename: asset.originalFilename,
        mimeType: asset.mimeType,
      }
      return result as unknown as T
    }

    if (segments.length === 3 && segments[2] === 'preview' && method === 'POST') {
      const asset =
        assets.find((item) => item.id === id && item.status === 'PUBLISHED') ?? packageChildren.get(id)
      if (!asset) throw new Error('素材不存在或已下架')
      if (asset.assetType === 'ARCHIVE') throw new Error('该文件类型不支持在线预览')
      return previewPayload(asset) as unknown as T
    }
  }

  /* ---------- 管理员 ---------- */
  if (segments[0] === 'admin') {
    const section = segments[1]

    if (section === 'dashboard') {
      const counts = new Map<string, { categoryCode: string; status: string; count: number }>()
      for (const asset of assets) {
        const key = `${asset.categoryCode}|${asset.status}`
        const current = counts.get(key) ?? { categoryCode: asset.categoryCode, status: asset.status, count: 0 }
        current.count += 1
        counts.set(key, current)
      }
      const dashboard: Dashboard = {
        asOf: NOW,
        assetCounts: [...counts.values()],
        taskCount: tasks.length,
        participantCount: new Set(claims.map((item) => item.userId)).size,
        claimCount: claims.length,
        downloadRequestCount: downloadLogs.length,
        employeeCount: 12,
      }
      return dashboard as unknown as T
    }

    if (section === 'assets') {
      if (segments.length === 2 && method === 'GET') {
        let list = [...assets]
        const category = str(query.categoryCode)
        const assetType = str(query.assetType)
        const status = str(query.status)
        const provider = str(query.storageProvider)
        if (category) list = list.filter((item) => item.categoryCode === category)
        if (assetType) list = list.filter((item) => item.assetType === assetType)
        if (status) list = list.filter((item) => item.status === status)
        if (provider) list = list.filter((item) => item.storageProvider === provider)
        if (keyword) list = list.filter((item) => includesKeyword(item.name, keyword) || includesKeyword(item.originalFilename, keyword))
        return paginate(list, page, pageSize) as unknown as T
      }

      if (segments.length === 2 && method === 'POST') {
        const name = str(body.name) || '未命名素材'
        const id = String(++assetSeq)
        // 素材类型 / 分类 / MIME 沿用上传会话，ZIP 素材包才能正确落成 ARCHIVE
        const session = sessions.get(str(body.uploadSessionId))
        const assetType = (session?.assetType ?? 'IMAGE') as AdminAsset['assetType']
        const categoryCode = session?.categoryCode ?? 'IMAGE'
        const mimeType = session?.mimeType || MIME[assetType] || 'image/jpeg'
        const ext = mimeType === 'application/zip' ? '.zip' : mimeType.startsWith('video/') ? '.mp4' : '.jpg'
        const created: AdminAsset = {
          id,
          name,
          assetType,
          categoryCode,
          mimeType,
          fileSize: session?.fileSize || 1_200_000,
          status: 'DRAFT',
          originalFilename: `${name}${ext}`,
          publishedAt: null,
          taskId: '',
          storageProvider: 'OSS',
          fileLocator: {
            bucket: 'shining-house-assets',
            corpId: 'ding-corp-7f2a',
            fileId: `oss-${id}`,
            spaceId: 'space-brand-01',
            objectKey: `assets/${assetType.toLowerCase()}/${id}/${name}${ext}`,
          },
        }
        assets.unshift(created)
        // v2.11.0：ZIP 素材包入库时后端自动解压出包内图片、视频
        if (created.assetType === 'ARCHIVE') attachPackageChildren(created)
        const result: AssetResult = { assetId: id, status: 'DRAFT' }
        return result as unknown as T
      }

      if (segments.length === 3 && segments[2] === 'previews' && method === 'POST') {
        const ids = Array.isArray(body.assetIds) ? (body.assetIds as unknown[]).map((value) => str(value)) : []
        const items = ids.map((id) => {
          // 任务素材内的子素材也可预览（列表页用它做任务素材封面）
          const asset = assets.find((item) => item.id === id) ?? packageChildren.get(id)
          if (!asset) return { assetId: id, error: { code: 'NOT_FOUND', message: '素材不存在' } }
          if (asset.assetType === 'ARCHIVE') {
            return { assetId: id, error: { code: 'PREVIEW_UNSUPPORTED', message: '该文件类型不支持在线预览' } }
          }
          return { ...previewPayload(asset), assetId: id }
        })
        return { items } as unknown as T
      }

      if (segments.length === 3 && segments[2] === 'batch-delete' && method === 'POST') {
        const ids = Array.isArray(body.assetIds) ? (body.assetIds as unknown[]).map((value) => str(value)) : []
        const unique = [...new Set(ids)]
        const items = unique.map((id) => {
          const index = assets.findIndex((item) => item.id === id)
          if (index < 0) return { assetId: id, error: { code: 'NOT_FOUND', message: '素材不存在' } }
          if (assets[index].taskId) {
            return {
              assetId: id,
              error: { code: 'ASSET_IN_USE', message: '素材已关联任务，请先保留任务素材并使用下架操作' },
            }
          }
          assets.splice(index, 1)
          return { assetId: id, status: 'DELETED' }
        })
        const successCount = items.filter((item) => 'status' in item).length
        return {
          items,
          total: unique.length,
          successCount,
          failedCount: unique.length - successCount,
        } as unknown as T
      }

      const id = segments[2]
      if (segments.length === 3 && method === 'GET') {
        const asset = assets.find((item) => item.id === id) ?? packageChildren.get(id)
        if (!asset) throw new Error('素材不存在')
        return asset as unknown as T
      }

      if (segments.length === 3 && method === 'DELETE') {
        const index = assets.findIndex((item) => item.id === id)
        if (index < 0) throw new Error('素材不存在')
        if (assets[index].taskId) throw new Error('素材已关联任务，请先保留任务素材并使用下架操作')
        assets.splice(index, 1)
        return { assetId: id, status: 'DELETED' } as unknown as T
      }

      if (segments.length === 4 && method === 'POST') {
        const asset = assets.find((item) => item.id === id) ?? packageChildren.get(id)
        if (!asset) throw new Error('素材不存在')
        const action = segments[3]
        if (action === 'publish') {
          asset.status = 'PUBLISHED'
          asset.publishedAt = NOW
          return { assetId: id, status: 'PUBLISHED' } as unknown as T
        }
        if (action === 'offline') {
          asset.status = 'OFFLINE'
          return { assetId: id, status: 'OFFLINE' } as unknown as T
        }
        if (action === 'preview') {
          // asset 已包含任务素材子素材，点缩略图放大也能拿到票据
          if (asset.assetType === 'ARCHIVE') throw new Error('该文件类型不支持在线预览')
          return previewPayload(asset) as unknown as T
        }
        if (action === 'unpack') {
          // 解包只针对顶层任务素材，子素材不会出现在 assets 里
          const pkg = assets.find((item) => item.id === id)
          if (!pkg || pkg.assetType !== 'ARCHIVE') throw new Error('仅任务素材支持解包')
          if ((pkg.children?.length ?? 0) === 0) attachPackageChildren(pkg)
          return pkg as unknown as T
        }
      }
    }

    if (section === 'accounts') {
      if (segments.length === 2 && method === 'GET') {
        return { items: mockAccounts } as unknown as T
      }

      if (segments.length === 2 && method === 'POST') {
        const username = str(body.username).trim()
        if (!username) throw new Error('请输入登录账号')
        if (mockAccounts.some((item) => item.username === username)) {
          throw new Error('该登录账号已存在，请更换账号')
        }
        const created: AdminAccount = {
          id: String(++accountSeq),
          username,
          displayName: str(body.displayName) || username,
          status: 'ACTIVE',
          createdAt: NOW,
        }
        mockAccounts.push(created)
        return created as unknown as T
      }

      if (segments.length === 4 && segments[3] === 'status' && method === 'PUT') {
        const account = mockAccounts.find((item) => item.id === segments[2])
        if (!account) throw new Error('账号不存在')
        account.status = str(body.status) === 'DISABLED' ? 'DISABLED' : ('ACTIVE' as AdminAccountStatus)
        return account as unknown as T
      }
    }

    if (section === 'employees') {
      if (segments.length === 2 && method === 'GET') {
        // 真实后端 keyword 还能匹配门店，演示数据没有门店字段，只按工号/姓名/手机号匹配
        const status = str(query.status)
        let list = [...mockEmployees]
        if (keyword) {
          list = list.filter((item) =>
            [item.displayName, item.employeeId, item.phone].some(
              (value) => Boolean(value) && includesKeyword(value as string, keyword),
            ),
          )
        }
        if (status) list = list.filter((item) => item.status === status)
        return paginate(list, page, pageSize) as unknown as T
      }

      if (segments.length === 3 && method === 'GET') {
        const employee = mockEmployees.find((item) => item.id === segments[2])
        if (!employee) throw new Error('员工不存在')
        return employee as unknown as T
      }

      if (segments.length === 4 && segments[3] === 'status' && method === 'PUT') {
        const employee = mockEmployees.find((item) => item.id === segments[2])
        if (!employee) throw new Error('员工不存在')
        employee.status = str(body.status) === 'DISABLED' ? 'DISABLED' : 'ACTIVE'
        return employee as unknown as T
      }
    }

    if (section === 'upload-sessions') {
      if (segments.length === 2 && method === 'POST') {
        const id = String(++sessionSeq)
        const record: Session = {
          id,
          assetType: str(body.assetType),
          categoryCode: str(body.categoryCode),
          expiresAt: null,
          fileSize: Number(body.fileSize) || 0,
          filename: str(body.filename),
          mimeType: str(body.mimeType),
          purpose: str(body.purpose),
          requestId: str(body.requestId),
          status: 'INIT',
          storageProvider: 'OSS',
          transfer: { url: `/api/admin/upload-sessions/${id}/content`, method: 'PUT' },
          uploadMode: 'PROXY',
        }
        sessions.set(id, record)
        return record as unknown as T
      }

      const id = segments[2]
      const record = id ? sessions.get(id) : undefined
      if (record && segments.length >= 3) {
        if (segments.length === 3 && method === 'GET') {
          record.status = 'FILE_READY'
          return record as unknown as T
        }
        if (segments[3] === 'content' && method === 'PUT') {
          record.status = 'FILE_READY'
          return record as unknown as T
        }
        if (segments[3] === 'complete' || segments[3] === 'retry') {
          record.status = 'COMMITTED'
          return record as unknown as T
        }
      }
      throw new Error('上传会话不存在')
    }

    if (section === 'tasks') {
      if (segments.length === 2 && method === 'GET') {
        let list = [...tasks]
        if (keyword) list = list.filter((item) => includesKeyword(item.title, keyword))
        return paginate(list, page, pageSize) as unknown as T
      }

      if (segments.length === 2 && method === 'POST') {
        const id = String(++taskSeq)
        const deadlineAt = str(body.deadlineAt) || null
        const created: Task = {
          id,
          title: str(body.title) || '未命名任务',
          content: str(body.content),
          publishedAt: NOW,
          claimCount: 0,
          claimed: false,
          claimedAt: null,
          deadlineAt,
          expired: false,
        }
        tasks.unshift(created)
        taskAssets.unshift(assets[0])
        const result: TaskResult = {
          taskId: id,
          activityAssetId: assets[0].id,
          publishedAt: NOW,
          deadlineAt,
          expired: false,
        }
        return result as unknown as T
      }

      const index = tasks.findIndex((item) => item.id === segments[2])
      if (index < 0) throw new Error('任务不存在')

      if (segments.length === 3 && method === 'GET') {
        return toDetail(index) as unknown as T
      }

      // v2.11.0：设置或取消领取截止时间
      if (segments.length === 4 && segments[3] === 'deadline' && method === 'PUT') {
        const raw = body.deadlineAt
        const deadlineAt = raw === null || raw === undefined || raw === '' ? null : String(raw)
        tasks[index] = {
          ...tasks[index],
          deadlineAt,
          expired: deadlineAt ? deadlineAt < NOW : false,
        }
        return tasks[index] as unknown as T
      }

      if (segments.length === 4 && segments[3] === 'claims' && method === 'GET') {
        let list = claims.filter((item) => item.taskId === tasks[index].id)
        if (keyword) list = list.filter((item) => includesKeyword(item.displayName ?? '', keyword) || includesKeyword(item.storeName ?? '', keyword))
        return paginate(list, page, pageSize) as unknown as T
      }
    }

    if (section === 'download-logs') {
      let list = [...downloadLogs]
      const userId = str(query.userId)
      const assetId = str(query.assetId)
      const provider = str(query.storageProvider)
      if (userId) list = list.filter((item) => item.userId === userId)
      if (assetId) list = list.filter((item) => item.assetId === assetId)
      if (provider) list = list.filter((item) => item.storageProvider === provider)
      return paginate(list, page, pageSize) as unknown as T
    }

    if (section === 'operation-logs') {
      let list = [...operations]
      const action = str(query.action)
      const result = str(query.result)
      const operatorId = str(query.operatorId)
      const targetType = str(query.targetType)
      if (action) list = list.filter((item) => item.action === action)
      if (result) list = list.filter((item) => item.result === result)
      if (operatorId) list = list.filter((item) => item.operatorId === operatorId)
      if (targetType) list = list.filter((item) => item.targetType === targetType)
      const pageResult: OperationPage = paginate(list, page, pageSize)
      return pageResult as unknown as T
    }
  }

  // 员工端接口（领取任务等）不在本项目范围内，已删除
  throw new Error(`预览模式未实现该接口：${method} ${path}`)
}
