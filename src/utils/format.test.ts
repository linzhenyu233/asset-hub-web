import assert from 'node:assert/strict'
import test from 'node:test'
import { formatBytes, nextDayStart, toApiDateTime, toInputDateTime } from './format.ts'

test('nextDayStart 传次日零点：后端 to 是开区间，传当天 23:59:59 会漏最后一秒', () => {
  assert.equal(nextDayStart('2026-10-13'), '2026-10-14 00:00:00')
  assert.equal(nextDayStart('2026-12-31'), '2027-01-01 00:00:00')
  assert.equal(nextDayStart('2026-02-28'), '2026-03-01 00:00:00')
  assert.equal(nextDayStart('2028-02-28'), '2028-02-29 00:00:00')
  // 认不出的日期返回空串（调用方会跳过该参数），不能把畸形值发给后端
  assert.equal(nextDayStart(''), '')
  assert.equal(nextDayStart('abc'), '')
})

test('datetime-local 与后端北京时间字符串互转', () => {
  assert.equal(toApiDateTime('2026-10-13T09:30'), '2026-10-13 09:30:00')
  assert.equal(toApiDateTime('2026-10-13 09:30:00'), '2026-10-13 09:30:00')
  assert.equal(toApiDateTime(''), '')
  assert.equal(toInputDateTime('2026-10-13 09:30:00'), '2026-10-13T09:30')
  assert.equal(toInputDateTime(null), '')
})

test('formatBytes 处理 0、空值与进位', () => {
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(undefined), '—')
  assert.equal(formatBytes(1024), '1.00 KB')
  assert.equal(formatBytes(1024 ** 3 * 2.5), '2.50 GB')
})
