import assert from 'node:assert/strict'
import test from 'node:test'
import { canPublish } from './asset.ts'

test('只有「未关联任务的活动包」必须走任务发布流程', () => {
  const campaignPack = {
    status: 'DRAFT' as const,
    assetType: 'ARCHIVE' as const,
    categoryCode: 'CAMPAIGN',
    taskId: '',
  }
  // 活动包且没有关联任务：不能单独上架
  assert.equal(canPublish(campaignPack), false)
  // 关联了任务的活动包（发布任务时生成）可以上下架
  assert.equal(canPublish({ ...campaignPack, taskId: '9' }), true)
  // ZIP 素材包 / 普通素材与活动包无关
  assert.equal(canPublish({ ...campaignPack, categoryCode: 'IMAGE' }), true)
  assert.equal(canPublish({ ...campaignPack, assetType: 'IMAGE' }), true)
  // 已上架的一律不再上架
  assert.equal(canPublish({ ...campaignPack, status: 'PUBLISHED', taskId: '9' }), false)
  assert.equal(
    canPublish({ status: 'OFFLINE', assetType: 'IMAGE', categoryCode: 'VIDEO', taskId: '' }),
    true,
  )
})
