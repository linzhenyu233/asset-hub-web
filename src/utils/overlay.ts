/**
 * 弹层共用的焦点与键盘处理。
 * 多个弹层叠在一起时（例如账号抽屉里再开改密弹窗），只有最后打开的那层响应 Esc，
 * 否则一次按键会把两层一起关掉。
 */

let seq = 0
const stack: number[] = []

export function nextOverlayId(): number {
  seq += 1
  return seq
}

export function openOverlay(id: number): void {
  if (!stack.includes(id)) stack.push(id)
}

export function closeOverlay(id: number): void {
  const index = stack.indexOf(id)
  if (index >= 0) stack.splice(index, 1)
}

export function isTopOverlay(id: number): boolean {
  return stack[stack.length - 1] === id
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/** 把 Tab 键锁在弹层内部，避免焦点跑到遮罩后面的页面上 */
export function trapTab(event: KeyboardEvent, container: HTMLElement | null): void {
  if (event.key !== 'Tab' || !container) return
  const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => element.offsetParent !== null,
  )
  if (items.length === 0) return
  const first = items[0]
  const last = items[items.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
