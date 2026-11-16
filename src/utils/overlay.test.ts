import assert from 'node:assert/strict'
import test from 'node:test'
import { closeOverlay, isTopOverlay, nextOverlayId, openOverlay } from './overlay.ts'

test('弹层叠加时只有最上层响应 Esc', () => {
  const drawer = nextOverlayId()
  const modal = nextOverlayId()
  const secondModal = nextOverlayId()
  openOverlay(drawer)
  openOverlay(modal)

  assert.equal(isTopOverlay(modal), true)
  assert.equal(isTopOverlay(drawer), false)

  // 关掉上层后，下层重新变成最上层
  closeOverlay(modal)
  assert.equal(isTopOverlay(drawer), true)

  // 打开顺序决定层级，重复 open 不会把同一层挤到最上面
  openOverlay(drawer)
  openOverlay(secondModal)
  assert.equal(isTopOverlay(secondModal), true)
  assert.equal(isTopOverlay(drawer), false)
})
