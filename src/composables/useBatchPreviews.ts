import { ref } from 'vue'
import { adminAssetApi } from '../api'
import { resolveFileUrl } from '../api/client'

export interface ThumbAsset {
  id: string
  assetType: string
  /** 任务素材已带上子素材时直接用，省一次详情请求；未返回该字段才回查详情 */
  children?: Array<{ id: string; assetType: string }>
  /** v2.10.1 起的任务素材封面（包内第一个可见图片/视频），优先使用 */
  cover?: { id: string; assetType: string }
  /** 文件大小：超过阈值的大文件不自动拉缩略图，改为悬停时按需请求 */
  fileSize?: number
}

export interface LoadThumbsOptions {
  /**
   * 超过该字节数不自动加载。后端预览返回的是原图，5MB 视频为了 40px 缩略图
   * 传输要好几秒，这类素材改为鼠标悬停时再单独请求。
   */
  maxAutoBytes?: number
  /** 视频默认不自动取首帧（视频文件通常最大），同样改为悬停按需加载 */
  skipVideo?: boolean
}

/** 缩略图来源类型：图片直接用 img，视频取首帧用 video */
export type ThumbKind = 'IMAGE' | 'VIDEO'

/** 按票据返回的 mimeType 判断缩略图渲染方式（无法判断时返回 null） */
function kindByMime(mime: string | undefined): ThumbKind | null {
  if (!mime) return null
  if (mime.startsWith('video/')) return 'VIDEO'
  if (mime.startsWith('image/')) return 'IMAGE'
  return null
}

/** 只保留 ID 仍在当前列表里的条目，翻页/筛选后顺手清掉旧缩略图 */
function pickRecord<T>(source: Record<string, T>, keep: Set<string>): Record<string, T> {
  const next: Record<string, T> = {}
  for (const [id, value] of Object.entries(source)) {
    if (keep.has(id)) next[id] = value
  }
  return next
}

/** 任务素材封面：优先包内第一张图片，没有图片再取第一个视频 */
function pickCover(
  children: Array<{ id: string; assetType: string }> | undefined,
): { id: string; assetType: string } | undefined {
  if (!children || children.length === 0) return undefined
  return (
    children.find((child) => child.assetType === 'IMAGE') ??
    children.find((child) => child.assetType === 'VIDEO')
  )
}

/** 任务素材封面：包内第一个图片/视频子素材 */
interface PackageCover {
  archiveId: string
  assetId: string
  kind: ThumbKind
}

/** 任务素材封面定位结果（null 表示包内确实没有图片/视频，避免重复回查） */
type CoverHit = { assetId: string; kind: ThumbKind } | null

/** 逐个取任务素材详情定位封面子素材；详情失败或未解包时跳过该包 */
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

  // 控制并发，避免一页十几个任务素材同时打详情接口
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
        // 单个任务素材取详情失败只影响它自己的封面，其他照常（失败不进缓存，下次重试）
      }
    }
  })
  await Promise.all(workers)
  return covers
}

/**
 * 列表页批量缩略图：一次预览请求拿整页素材的短时票据（后端上限 100 条）。
 * 任务素材本身不支持预览，改为取「包内第一张图片/视频」作为封面；
 * 未解包或取详情失败时退化为文件夹图标。失败项保留错误说明由页面兜底展示。
 */
export function useBatchPreviews() {
  const thumbs = ref<Record<string, string>>({})
  /** 缩略图来源类型（视频缩略需要渲染 video 取首帧） */
  const kinds = ref<Record<string, ThumbKind>>({})
  const failures = ref<Record<string, string>>({})
  /** 视频缩略是否已绘制出画面（未绘制时保持图标占位，避免黑块） */
  const frames = ref<Record<string, boolean>>({})
  /**
   * 图片缩略是否已解码完成：解码前保持渐变占位，解码后再淡入，
   * 避免「占位底色 → 图片」那一瞬间的硬切白闪。
   */
  const loaded = ref<Record<string, boolean>>({})
  /** 任务素材封面定位缓存（同一页面翻页时复用，票据仍每次新申请） */
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

  /** 清理已不在当前列表里的缩略图，避免翻页后无限增长 */
  function prune(keep: Set<string>): void {
    thumbs.value = pickRecord(thumbs.value, keep)
    kinds.value = pickRecord(kinds.value, keep)
    failures.value = pickRecord(failures.value, keep)
    frames.value = pickRecord(frames.value, keep)
    loaded.value = pickRecord(loaded.value, keep)
  }

  async function load(assets: ThumbAsset[], options: LoadThumbsOptions = {}): Promise<void> {
    const current = ++seq
    const maxBytes = options.maxAutoBytes ?? Number.POSITIVE_INFINITY
    const skipVideo = options.skipVideo ?? false
    /** 本次列表里还存在的 ID，用来清理翻页/筛选前的旧缩略图 */
    const keep = new Set(assets.map((asset) => asset.id))
    /**
     * 已经有缩略图的不再重复申请：票据地址每次都会重新签发，
     * 同一个素材换一个 src 会让浏览器重新拉取并先清空画面，表现就是刷新时闪一下。
     */
    const needThumb = (id: string) => !thumbs.value[id]

    // 大文件与视频不参与批量请求：一张 5MB 的图只为 40px 缩略图不值得
    const direct = assets.filter((asset) => {
      if (asset.assetType === 'ARCHIVE') return false
      if (skipVideo && asset.assetType === 'VIDEO') return false
      if (typeof asset.fileSize === 'number' && asset.fileSize > maxBytes) return false
      return needThumb(asset.id)
    })
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
    const covers = [...inlineCovers, ...detailCovers].filter((cover) => needThumb(cover.archiveId))

    const targets: ThumbAsset[] = [
      ...direct,
      ...covers.map((cover) => ({ id: cover.assetId, assetType: cover.kind })),
    ]
    if (targets.length === 0) {
      // 整页都命中已有缩略图（例如手动刷新列表）：保持原样，只清理已不在列表里的条目
      prune(keep)
      return
    }

    try {
      const requestIds = Array.from(new Set(targets.map((asset) => asset.id)))
      const res = await adminAssetApi.previews(requestIds)
      if (current !== seq) return

      const urlOf: Record<string, string> = {}
      const thumbOf: Record<string, string> = {}
      const mimeOf: Record<string, string> = {}
      const errorOf: Record<string, string> = {}
      for (const item of res.items) {
        if ('url' in item) {
          urlOf[item.assetId] = resolveFileUrl(item.url)
          // v2.11.0：240px 缩略图（图片缩略图 / 视频首帧），几 KB，优先用它
          thumbOf[item.assetId] = item.thumbnailUrl ? resolveFileUrl(item.thumbnailUrl) : ''
          mimeOf[item.assetId] = item.mimeType
        } else {
          errorOf[item.assetId] = item.error.message
        }
      }

      // 以当前已渲染的缩略图为底，只覆盖这次真正申请过的素材：
      // 未变化的条目保持原对象与原 src，避免无谓的重新加载
      const nextThumbs = pickRecord(thumbs.value, keep)
      const nextKinds = pickRecord(kinds.value, keep)
      const nextFailures = pickRecord(failures.value, keep)
      const nextFrames = pickRecord(frames.value, keep)
      const nextLoaded = pickRecord(loaded.value, keep)

      const applyThumb = (key: string, assetId: string, fallbackKind: ThumbKind) => {
        if (urlOf[assetId]) {
          nextThumbs[key] = thumbOf[assetId] || urlOf[assetId]
          // 缩略图统一是 JPEG，按图片渲染；没有缩略图时再按 mimeType 判断 img / video
          nextKinds[key] = thumbOf[assetId] ? 'IMAGE' : (kindByMime(mimeOf[assetId]) ?? fallbackKind)
          // 换了新地址：重新走一次「占位 → 淡入」
          delete nextLoaded[key]
          delete nextFrames[key]
          delete nextFailures[key]
        } else if (errorOf[assetId]) {
          nextFailures[key] = errorOf[assetId]
        }
      }

      for (const asset of direct) {
        applyThumb(asset.id, asset.id, asset.assetType === 'VIDEO' ? 'VIDEO' : 'IMAGE')
      }
      // 任务素材用它封面子素材的票据，键仍是任务素材 ID（列表行按任务素材 ID 查缩略图）
      for (const cover of covers) {
        applyThumb(cover.archiveId, cover.assetId, cover.kind)
      }

      thumbs.value = nextThumbs
      kinds.value = nextKinds
      failures.value = nextFailures
      frames.value = nextFrames
      loaded.value = nextLoaded
    } catch {
      if (current !== seq) return
      // 批量预览失败不影响列表本身：已有缩略图保留，新素材退回图标占位
      prune(keep)
    }
  }

  /** 正在加载的单条缩略图，避免悬停反复触发请求 */
  const inflight = new Set<string>()

  /** 单条按需加载：大文件与视频在鼠标悬停时才请求，不拖慢整页 */
  async function loadOne(asset: ThumbAsset): Promise<void> {
    if (thumbs.value[asset.id] || inflight.has(asset.id)) return
    inflight.add(asset.id)
    try {
      const res = await adminAssetApi.preview(asset.id)
      thumbs.value = {
        ...thumbs.value,
        [asset.id]: resolveFileUrl(res.thumbnailUrl || res.url),
      }
      kinds.value = {
        ...kinds.value,
        [asset.id]: res.thumbnailUrl
          ? 'IMAGE'
          : (kindByMime(res.mimeType) ?? (asset.assetType === 'VIDEO' ? 'VIDEO' : 'IMAGE')),
      }
    } catch {
      failures.value = { ...failures.value, [asset.id]: '缩略图加载失败' }
    } finally {
      inflight.delete(asset.id)
    }
  }

  /** 缩略文件加载失败（如票据过期、图片解码失败）时退回图标占位 */
  function markBroken(id: string): void {
    if (!thumbs.value[id]) return
    const nextThumbs = { ...thumbs.value }
    const nextKinds = { ...kinds.value }
    const nextFrames = { ...frames.value }
    const nextLoaded = { ...loaded.value }
    delete nextThumbs[id]
    delete nextKinds[id]
    delete nextFrames[id]
    delete nextLoaded[id]
    thumbs.value = nextThumbs
    kinds.value = nextKinds
    frames.value = nextFrames
    loaded.value = nextLoaded
    failures.value = { ...failures.value, [id]: '缩略图加载失败' }
  }

  /** 取某素材缩略图的渲染方式，缺省按素材类型推断 */
  function kindOf(asset: ThumbAsset): ThumbKind {
    return kinds.value[asset.id] ?? (asset.assetType === 'VIDEO' ? 'VIDEO' : 'IMAGE')
  }

  /** 图片缩略解码完成：由模板的 @load 调用，触发淡入 */
  function markLoaded(id: string): void {
    if (loaded.value[id]) return
    // 等两帧再置位：图片命中缓存时 load 与首帧绘制可能落在同一帧，
    // 两次样式变更被合并后淡入动画会被直接跳过，看起来就是「啪」地跳出来
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (loaded.value[id]) return
        loaded.value = { ...loaded.value, [id]: true }
      })
    })
  }

  function isLoaded(id: string): boolean {
    return loaded.value[id] === true
  }

  /**
   * 是否还需要显示占位图标。
   * 图片：始终垫在图片下面即可——图片自带白底且不透明，解码完成后会自然把它盖住，
   * 淡入的 200ms 正好呈现「图标 → 图片」的交叉过渡，不会出现空白帧；
   * 视频：首帧绘制出来之前必须保留，否则会露出黑块。
   */
  function showPlaceholder(id: string, kind: ThumbKind): boolean {
    return kind === 'VIDEO' ? frames.value[id] !== true : true
  }

  function reset(): void {
    seq += 1
    coverCache.clear()
    inflight.clear()
    thumbs.value = {}
    kinds.value = {}
    failures.value = {}
    frames.value = {}
    loaded.value = {}
  }

  return {
    thumbs,
    kinds,
    failures,
    frames,
    load,
    loadOne,
    reset,
    markBroken,
    kindOf,
    revealFrame,
    markLoaded,
    isLoaded,
    showPlaceholder,
  }
}
