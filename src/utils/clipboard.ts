/**
 * 复制文本到剪贴板。
 * navigator.clipboard 只在安全上下文（https / localhost）可用——内网用 http://192.168.x.x:5273
 * 打开时它是 undefined，所以必须保留 execCommand 兜底，否则按钮会静默失败。
 */
export async function copyText(text: string): Promise<void> {
  if (window.isSecureContext && navigator.clipboard) {
    await navigator.clipboard.writeText(text)
    return
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.top = '-1000px'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  const ok = document.execCommand('copy')
  area.remove()
  if (!ok) throw new Error('复制失败')
}
