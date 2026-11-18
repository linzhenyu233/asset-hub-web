# 素材中心 · 前端（Asset Hub Web）

独立于 `Media-hub` 的新数据中台前端，对接「图片视频素材中台 API」v3.1.0。
只负责页面与接口调用，**不含后端实现**。以总部管理端为主，并提供「员工视角」预览页（`/assets/:id`）。

- 接口规范：`docs/openapi.json`（v3.1.0，来源 `https://dssczt.shininghouse.vip/go/sczt/v1/api-docs`）
- 设计令牌：源自 Ardot 文件 734820516311557 导出的 `tokens.json`，已落到 `tailwind.config.js`（颜色/间距/阴影）与 `src/style.css`（组件类）；`tokens.json` 与设计说明文档不在本仓库

## 当前状态：预览模式（开发环境默认开启）

登录由 `src/mock/accounts.ts` 的本地账号目录校验，会真实区分管理员与非管理员：

| 账号 | 密码 | 身份 | 结果 |
| --- | --- | --- | --- |
| `admin` | `admin123` | 林静怡 · 总部素材组 | 进入管理后台 |
| `ops` | `ops123` | 陈昊 · 总部素材组 | 进入管理后台 |
| `staff` | `staff123` | 陈晓雯 · 门店员工 | **拦截**：该账号没有管理员权限（仅用于验证拦截） |

密码错误会提示「密码不正确」。

- 登录态保存在 `localStorage`（键 `assethub_preview_user`），刷新保持；点退出登录回到登录页
- 管理端用到的接口全部由 `src/mock/` 的内存演示数据驱动（含分页、筛选、上下架、上传/下载模拟）
- 顶栏右上角有「演示数据」标识
- 上传会模拟进度并落库到内存；下载会生成一个占位文本文件，用于验证交互链路

**接口上线后切回真实后端**：`npm run build` 的生产包默认就是真实后端（`VITE_PREVIEW` 只在开发环境默认开启），
避免漏配环境变量把演示后台发上线。想在开发环境也用真实接口，在项目根目录新建 `.env.local`：

```
VITE_PREVIEW=false
```

重启 `npm run dev` 即恢复真实登录与真实接口。

## 技术栈

Vite 8 · Vue 3.5 · TypeScript · Vue Router 4 · Tailwind CSS 3（令牌化主题，无 UI 组件库）

## 快速开始

```cmd
cd /d C:\Users\zssj\PycharmProjects\asset-hub-web
npm install
npm run dev
```

- 开发地址：**http://127.0.0.1:5273**
- 生产构建：`npm run build`（`vue-tsc` 类型检查 + Vite 打包到 `dist/`）
- 预览构建：`npm run preview`（4173）

> 端口固定为 **5273**：本机 5173 常被其他 Vite 项目占用，被占用时 Vite 会静默换端口，
> 导致 `/api` 代理打到别的服务上（表现为接口莫名 404）。

## 后端与代理

开发环境由 Vite 把 `/api` 代理到后端，避免跨域与 Cookie `SameSite` 问题：

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_PROXY_TARGET` | `http://192.168.30.239:20011` | 代理目标，改后端地址时设置 |
| `VITE_API_BASE` | 空（即相对路径 `/api`） | 直连模式可设为 `http://192.168.30.239:20011/api` |

在项目根目录新建 `.env.local` 即可覆盖，例如：

```
VITE_PROXY_TARGET=http://192.168.30.239:20011
```

后端约定（已在 `src/api/client.ts` 统一处理）：

- 鉴权：Cookie `assethub_session`（`credentials: include`），同时兼容 `Authorization: Bearer`
- 错误体：`{ "error": { "code": "...", "message": "..." } }`
- 业务时间为北京时间 `YYYY-MM-DD HH:mm:ss`
- **ID 约定（v3.0.0）**：素材用 `assetId`（`ZSSJ` + 13 位数字），用户/员工/子账号用 `userId`（11 位大写字母+数字，虚拟预览身份为 `REVIEW`）；任务、上传会话、日志等内部对象仍是数字 `id`。请求路径里的 `{id}` 按对象类型分别传上述值
- 文件走 OSS，未配置时文件类接口返回 503

## 页面与接口映射（管理端）

| 页面 / 能力 | 接口 |
| --- | --- |
| 登录页 · 管理员登录 | `POST /api/auth/admin-login` |
| 全局 · 退出登录 | `POST /api/auth/logout` |
| 全局 · 当前身份 | `GET /api/account/me` |
| 分类 · 固定分类 | `GET /api/asset-categories` |
| 活动包内容 · 下载包内素材 | `POST /api/assets/{id}/download` |
| 素材管理 · 全部状态列表 | `GET /api/admin/assets` |
| 素材入库 · 创建素材草稿 | `POST /api/admin/assets` |
| 素材详情（管理） | `GET /api/admin/assets/{id}` |
| 素材管理 · 上架 | `POST /api/admin/assets/{id}/publish` |
| 素材管理 · 下架 | `POST /api/admin/assets/{id}/offline` |
| 素材入库 · 创建/复用上传会话 | `POST /api/admin/upload-sessions` |
| 上传 · 查询阶段 | `GET /api/admin/upload-sessions/{id}` |
| 上传 · 传输文件（二进制） | `PUT /api/admin/upload-sessions/{id}/content` |
| 上传 · 提交校验 | `POST /api/admin/upload-sessions/{id}/complete` |
| 上传 · 断点恢复 | `POST /api/admin/upload-sessions/{id}/retry` |
| 任务管理 · 管理列表 | `GET /api/admin/tasks` |
| 任务管理 · 发布任务+活动包 | `POST /api/admin/tasks` |
| 任务详情（管理） | `GET /api/admin/tasks/{id}` |
| 任务详情 · 领取明细 | `GET /api/admin/tasks/{id}/claims` |
| 文件下载 · 票据代理下载 | `GET /api/files/{ticket}` |
| 数据总览 · 大屏汇总 | `GET /api/admin/dashboard` |
| 下载记录 | `GET /api/admin/download-logs` |
| 操作日志 | `GET /api/admin/operation-logs` |
| 账号 · 修改密码（含首次强制改密） | `PUT /api/account/password` |
| 账号管理 · 子账号列表 / 创建 | `GET /api/admin/accounts`、`POST /api/admin/accounts` |
| 账号管理 · 启用 / 停用 | `PUT /api/admin/accounts/{id}/status` |
| 员工账号 · 列表（分页 / 搜索 / 状态筛选） | `GET /api/admin/employees` |
| 员工账号 · 详情 | `GET /api/admin/employees/{id}` |
| 员工账号 · 启用 / 停用 | `PUT /api/admin/employees/{id}/status` |
| 素材预览 · 单项票据 | `POST /api/admin/assets/{id}/preview` |
| 素材预览 · 列表批量票据 | `POST /api/admin/assets/previews` |
| 素材预览 · 票据内容 | `GET /api/previews/{ticket}`、`HEAD /api/previews/{ticket}` |
| 素材管理 · 删除素材与 OSS 文件 | `DELETE /api/admin/assets/{id}` |
| 素材管理 · 批量删除 | `POST /api/admin/assets/batch-delete` |

## 目录结构

```
src/
  api/
    client.ts        请求封装（Cookie/Bearer、统一错误、二进制上传、票据下载）
    types.ts         对接接口的 TypeScript 类型（对应 v2.11.0 规范）
    index.ts         按模块分组的接口方法
  composables/
    useToast.ts      全局轻提示
    useUpload.ts     上传编排：建会话 → 传文件 → 校验
    useAssetPreview.ts / useBatchPreviews.ts  预览票据申请
  stores/session.ts  登录态与角色
  router/index.ts    路由与登录守卫
  components/
    layout/AppShell.vue   顶栏 64 + 侧栏 240 骨架
    ui/                   图标、徽章、分页、空状态、弹窗、抽屉、Toast
  views/
    LoginView.vue
    admin/            数据总览、素材管理、素材详情、素材入库、任务管理、任务详情、下载记录、操作日志、员工账号、账号管理
  utils/format.ts
scripts/
  contract-check.mjs  前后端契约静态检查（读 docs/openapi.json 对账）
```

## 交互与约定

- **上传**：创建会话 → 以二进制流 PUT（XHR 进度条）→ 查询阶段 → 提交校验 → 创建素材草稿 / 发布任务
- **下载**：先申请短时票据，再跳转 `/api/files/{ticket}` 由浏览器保存；每次申请都会记录
- **幂等**：上传会话、发布任务、下载申请都使用 `requestId` 去重
- **状态**：素材 `DRAFT / PUBLISHED / OFFLINE`；任务包固定为 `CAMPAIGN + ARCHIVE`
- **压缩包（v3.1.0）**：ZIP / RAR / 7Z / TAR / GZ（`.tar.gz`、`.tgz`、单文件 `.gz`）；上传前按文件头识别真实类型，浏览器给的 `application/x-rar-compressed` 等别名会归一成规范 MIME
- **四态**：所有数据页均覆盖 Loading（骨架）/ Empty / Error（可重试）/ 权限受限
- **契约检查**：`node scripts/contract-check.mjs`，对账 `docs/openapi.json` 与前端调用点（路径/方法、query 参数、请求体字段、页面枚举值），发现问题退出码为 1
