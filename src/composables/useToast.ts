import { reactive } from 'vue'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastItem {
  id: number
  type: ToastType
  message: string
}

export const toastState = reactive<{ items: ToastItem[] }>({ items: [] })

let seq = 0

export function toast(type: ToastType, message: string, duration = 3200): void {
  const id = ++seq
  toastState.items.push({ id, type, message })
  window.setTimeout(() => dismissToast(id), duration)
}

export function dismissToast(id: number): void {
  const index = toastState.items.findIndex((item) => item.id === id)
  if (index >= 0) toastState.items.splice(index, 1)
}

export function useToast() {
  return {
    toast,
    success: (message: string) => toast('success', message),
    error: (message: string) => toast('error', message),
    info: (message: string) => toast('info', message),
  }
}
