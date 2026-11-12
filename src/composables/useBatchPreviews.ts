import { ref } from 'vue'
import { adminAssetApi } from '../api'
import { resolveFileUrl } from '../api/client'

export interface ThumbAsset {
  id: string
  assetType: string
  /** 活动包已带上子素材时直接用，省一次详情请求；未返回该字段才回查详情 */
  children?: Array<{ id: string; assetType: string }>
  /** v2.10.1 起的活动包封面（包内第一个可见图片/视频），优先使用 */
  cover?: { id: string; assetType: string }
}

/** 缩略图来源类型：图片直接用 img，视频取首帧用 video */
export type ThumbKind = 'IMAGE' | 'VIDEO'

/** 活动包封面：优先包内第一张图片，没有图片再取第一个视频 */
function pickCover(
  children: Array<{ id: string; assetType: string }> | undefined,
): { id: string; assetType: string } | undefined {
  if (!children || children.length === 0) return undefined
  return (
    children.find((child) => child.assetType === 'IMAGE') ??
    children.find((child) => child.assetType === 'VIDEO')
  )
}

/** 活动包封面：包内第一个图片/视频子素材 */
interface PackageCover {
  archiveId: string
  assetId: string
  kind: ThumbKind
}

/** 活动包封面定位结果（null 表示包内确实没有图片/视频，避免重复回查） */
type CoverHit = { assetId: string; kind: ThumbKind } | null

/** 逐个取活动包详情定位封面子素材；详情失败或未解包时跳过该包 */
async function loadCovers(archiveIds: string[], cache: Map<string, CoverHit>): Promise<PackageCover[]> {
  const covers: PackageCover[] = []
  const queue: string[] = []

  // 同一页面内翻页复用：命中缓存就不再打详情接口
  for (const id of archiveIds) {
    if (!cache.has(id)) {
      queue.push(id)
      continue
    }
    const hit = cache.get(id)
    if (hit) covers.push({ archiveId: id, ...hit })
  }

  // 控制并发，避免一页十几个活动包同时打详情接口
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length > 0) {
      const archiveId = queue.shift()
      if (!archiveId) return
      try {
        const detail = await adminAssetApi.detail(archiveId)
        const cover = detail.cover ?? pickCover(detail.children)
        if (!cover) {
          cache.set(archiveId, null)
          continue
        }
        const hit = { assetId: cover.id, kind: (cover.assetType === 'VIDEO' ? 'VIDEO' : 'IMAGE') as ThumbKind }
        cache.set(archiveId, hit)
        covers.push({ archiveId, ...hit })
      } catch {
        // 单个活动包取详情失败只影响它自己的封面，其他照常（失败不进缓存，下次重试）
      }
    }
  })
  await Promise.all(workers)
  return covers
}

/**
 * 列表页批量缩略图：一次预览请求拿整页素材的短时票据（后端上限 100 条）。
 * 活动包本身不支持预览，改为取「包内第一张图片/视频」作为封面；
 * 未解包或取详情失败时退化为文件夹图标。失败项保留错误说明由页面兜底展示。
 */
export function useBatchPreviews() {
  const thumbs = ref<Record<string, string>>({})
  /** 缩略图来源类型（视频缩略需要渲染 video 取首帧） */
  const kinds = ref<Record<string, ThumbKind>>({})
  const failures = ref<Record<string, string>>({})
  /** 视频缩略是否已绘制出画面（未绘制时保持图标占位，避免黑块） */
  const frames = ref<Record<string, boolean>>({})
  /** 活动包封面定位缓存（同一页面翻页时复用，票据仍每次新申请） */
  const coverCache = new Map<string, CoverHit>()
  let seq = 0

  /** 视频元数据就绪后跳到首帧，浏览器才会真正绘制画面 */
  function revealFrame(id: string, event: Event) {
    const video = event.target as HTMLVideoElement
    frames.value = { ...frames.value, [id]: true }
    if (video.dataset.seeked) return
    video.dataset.seeked = '1'
    try {
      // 票据地址不一定支持 Range，seek 失败也不影响已经解码出来的首帧
      video.currentTime = Math.min(0.2, (video.duration || 0) / 10)
    } catch {
      /* 忽略 */
    }
  }

  async function load(assets: ThumbAsset[]): Promise<void> {
    const current = ++seq
    const direct = assets.filter((asset) => asset.assetType !== 'ARCHIVE')
    const archives = assets.filter((asset) => asset.assetType === 'ARCHIVE')

    // 封面优先级：列表自带的 cover（v2.10.1）→ 列表自带的 children → 回查详情
    const inlineCovers: PackageCover[] = []
    const needDetail: string[] = []
    for (const archive of archives) {
      const cover = archive.cover ?? pickCover(archive.children)
      if (cover) {
        const kind: ThumbKind = cover.assetType === 'VIDEO' ? 'VIDEO' : 'IMAGE'
        coverCache.set(archive.id, { assetId: cover.id, kind })
        inlineCovers.push({ archiveId: archive.id, assetId: cover.id, kind })
        continue
      }
      // 列表返回了 children 但里面没有图片/视频：确定没有封面，不必回查
      if (archive.children) {
        coverCache.set(archive.id, null)
        continue
      }
      needDetail.push(archive.id)
    }

    const detailCovers = needDetail.length ? await loadCovers(needDetail, coverCache) : []
    if (current !== seq) return
    const covers = [...inlineCovers, ...detailCovers]

    const targets: ThumbAsset[] = [
      ...direct,
      ...covers.map((cover) => ({ id: cover.assetId, assetType: cover.kind })),
    ]
    if (targets.length === 0) {
      thumbs.value = {}
      kinds.value = {}
      failures.value = {}
      return
    }

    try {
      const res = await adminAssetApi.previews(targets.map((asset) => asset.id))
      if (current !== seq) return

      const urlOf: Record<string, string> = {}
      const errorOf: Record<string, string> = {}
      for (const item of res.items) {
        if ('url' in item) urlOf[item.assetId] = resolveFileUrl(item.url)
        else errorOf[item.assetId] = item.error.message
      }

      const nextThumbs: Record<string, string> = {}
      const nextKinds: Record<string, ThumbKind> = {}
      const nextFailures: Record<string, string> = {}

      for (const asset of direct) {
        if (urlOf[asset.id]) {
          nextThumbs[asset.id] = urlOf[asset.id]
          nextKinds[asset.id] = asset.assetType === 'VIDEO' ? 'VIDEO' : 'IMAGE'
        } else if (errorOf[asset.id]) {
          nextFailures[asset.id] = errorOf[asset.id]
        }
      }
      // 活动包用它封面子素材的票据，键仍是活动包 ID（列表行按活动包 ID 查缩略图）
      for (const cover of covers) {
        if (urlOf[cover.assetId]) {
          nextThumbs[cover.archiveId] = urlOf[cover.assetId]
          nextKinds[cover.archiveId] = cover.kind
        } else if (errorOf[cover.assetId]) {
          nextFailures[cover.archiveId] = errorOf[cover.assetId]
        }
      }

      thumbs.value = nextThumbs
      kinds.value = nextKinds
      failures.value = nextFailures
      frames.value = {}
    } catch {
      if (current !== seq) return
      // 批量预览失败不影响列表本身，退回图标占位
      thumbs.value = {}
      kinds.value = {}
      failures.value = {}
      frames.value = {}
    }
  }

  /** 缩略文件加载失败（如票据过期、图片解码失败）时退回图标占位 */
  function markBroken(id: string): void {
    if (!thumbs.value[id]) return
    const nextThumbs = { ...thumbs.value }
    const nextKinds = { ...kinds.value }
    const nextFrames = { ...frames.value }
    delete nextThumbs[id]
    delete nextKinds[id]
    delete nextFrames[id]
    thumbs.value = nextThumbs
    kinds.value = nextKinds
    frames.value = nextFrames
    failures.value = { ...failures.value, [id]: '缩略图加载失败' }
  }

  /** 取某素材缩略图的渲染方式，缺省按素材类型推断 */
  function kindOf(asset: ThumbAsset): ThumbKind {
    return kinds.value[asset.id] ?? (asset.assetType === 'VIDEO' ? 'VIDEO' : 'IMAGE')
  }

  function reset(): void {
    seq += 1
    coverCache.clear()
    thumbs.value = {}
    kinds.value = {}
    failures.value = {}
    frames.value = {}
  }

  return { thumbs, kinds, failures, frames, load, reset, markBroken, kindOf, revealFrame }
}
