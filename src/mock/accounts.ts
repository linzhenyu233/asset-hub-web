// 预览模式的本地账号目录：用于在登录接口上线前模拟「身份识别」。
// 正式接入后端后，此文件不参与运行时（PREVIEW=false 时不引用）。
import type { User } from '../api/types'

export interface MockAccount {
  username: string
  password: string
  user: User
}



function makeUser(input: {
  id: string
  displayName: string
  role: 'ADMIN' | 'EMPLOYEE'
  storeId: string | null
  storeName: string
  username: string | null
  phone: string | null
}): User {
  return { ...input }
}

/** 管理员账号（其中 staff 为「有账号但不是管理员」，用于验证拦截）。 */
export const mockAccounts: MockAccount[] = [
  {
    username: 'admin',
    password: 'admin123',
    user: makeUser({
      id: '1',
      displayName: '林静怡',
      role: 'ADMIN',
      storeId: null,
      storeName: '总部素材组',
      username: 'admin',
      phone: '13800000001',
    }),
  },
  {
    username: 'ops',
    password: 'ops123',
    user: makeUser({
      id: '2',
      displayName: '陈昊',
      role: 'ADMIN',
      storeId: null,
      storeName: '总部素材组',
      username: 'ops',
      phone: '13800000002',
    }),
  },
  {
    username: 'staff',
    password: 'staff123',
    user: makeUser({
      id: '3',
      displayName: '陈晓雯',
      role: 'EMPLOYEE',
      storeId: '11',
      storeName: '上海静安嘉里中心店',
      username: 'staff',
      phone: '13800138000',
    }),
  },
]

export const mockAdminUser: User = mockAccounts[0].user

/**
 * 预览模式里扮演「门店员工」的演示数据（下载记录、任务领取记录的操作人）。
 * 本项目没有员工端，这里只用来让演示数据看起来完整。
 */
export const mockEmployeeUser: User = makeUser({
  id: '3',
  displayName: '陈晓雯',
  role: 'EMPLOYEE',
  storeId: '11',
  storeName: '上海静安嘉里中心店',
  username: 'staff',
  phone: '13800138000',
})

export function findMockAccount(username: string): MockAccount | undefined {
  const value = username.trim().toLowerCase()
  return mockAccounts.find((item) => item.username.toLowerCase() === value)
}
