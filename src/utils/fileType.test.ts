import assert from 'node:assert/strict'
import test from 'node:test'
import { inspectFile, sniffMimeType } from './fileType.ts'

const bytes = (...values: number[]): Uint8Array => new Uint8Array(values)

/** ISO BMFF（mp4 / mov / heic）：偏移 4 处是 ftyp，品牌在第 8 字节起 */
function ftyp(brand: string): Uint8Array {
  return bytes(0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, ...[...brand].map((char) => char.charCodeAt(0)))
}

test('sniffMimeType 按文件头识别类型（猜错就会被后端拒绝）', () => {
  assert.equal(sniffMimeType(bytes(0xff, 0xd8, 0xff, 0xe0)), 'image/jpeg')
  assert.equal(sniffMimeType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00)), 'image/png')
  assert.equal(sniffMimeType(bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0x00)), 'application/zip')
  assert.equal(sniffMimeType(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50)), 'image/webp')
  assert.equal(sniffMimeType(ftyp('isom')), 'video/mp4')
  assert.equal(sniffMimeType(ftyp('qt  ')), 'video/quicktime')
  assert.equal(sniffMimeType(ftyp('heic')), 'image/heic')
  assert.equal(sniffMimeType(bytes(1, 2, 3, 4)), null)
})

test('识别不出时退回浏览器声明，声明也没有才用兜底类型', async () => {
  const unknown = new File([bytes(1, 2, 3, 4)], 'x.bin', { type: 'application/zip' })
  const declared = await inspectFile(unknown, 'image/jpeg')
  assert.equal(declared.actual, null)
  assert.equal(declared.mimeType, 'application/zip')
  assert.equal(declared.unsupported, false)

  // 浏览器给不出类型（拖目录、少见扩展名）时不能返回空串，否则上传声明是空的
  const bare = new File([bytes(1, 2, 3, 4)], 'x.bin', { type: '' })
  assert.equal((await inspectFile(bare, 'application/zip')).mimeType, 'application/zip')
})

test('真实类型与声明不符时标记 mismatched，仅提示不拦上传', async () => {
  const png = new File([bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)], 'a.jpg', {
    type: 'image/jpeg',
  })
  const result = await inspectFile(png, 'image/jpeg')
  assert.equal(result.actual, 'image/png')
  assert.equal(result.mimeType, 'image/png')
  assert.equal(result.mismatched, true)
  assert.equal(result.unsupported, false)
})
