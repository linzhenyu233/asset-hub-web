import type { Asset } from '../api/types'

/**
 * 只有「未关联任务的活动包」必须走任务发布流程上架；ZIP 素材包与普通素材一样可独立上架，
 * 子素材随父包状态生效。列表页的批量上架与详情页的按钮共用这一条规则。
 */
export function canPublish(
  asset: Pick<Asset, 'status' | 'assetType' | 'categoryCode' | 'taskId'>,
): boolean {
  if (asset.status === 'PUBLISHED') return false
  return !(asset.assetType === 'ARCHIVE' && asset.categoryCode === 'CAMPAIGN' && !asset.taskId)
}

/**
 * 超过该体积的图片不为 40px 缩略图去拉原图（预览接口返回的是原图），改为鼠标悬停时按需请求；
 * 视频同理，始终按需加载。
 */
export const THUMB_AUTO_MAX_BYTES = 3_000_000
