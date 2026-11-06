<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError } from '../../api/client'
import { useSession } from '../../stores/session'
import { useToast } from '../../composables/useToast'
import BaseIcon from './BaseIcon.vue'
import BaseModal from './BaseModal.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    /** 首次强制改密：不可关闭，说明文案不同 */
    forced?: boolean
  }>(),
  { forced: false },
)

const emit = defineEmits<{ (e: 'close'): void; (e: 'success'): void }>()

const router = useRouter()
const { changePassword, logout } = useSession()
const { success } = useToast()

const form = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })
const show = reactive({ old: false, next: false, confirm: false })
const submitting = ref(false)
const errorMessage = ref('')

const title = computed(() => (props.forced ? '首次登录需修改密码' : '修改密码'))
const description = computed(() =>
  props.forced
    ? '当前密码为工号重复两次（例如工号 300465 的初始密码是 300465300465）。改密后才能正常使用业务功能。'
    : '修改成功后当前登录凭证会失效，需要用新密码重新登录其他设备。',
)

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

function validate(): string {
  if (!form.oldPassword) return '请输入当前密码'
  const size = byteLength(form.newPassword)
  if (size < 10) return '新密码至少 10 个字节'
  if (size > 72) return '新密码最多 72 个字节'
  if (!/[A-Za-z]/.test(form.newPassword) || !/\d/.test(form.newPassword)) {
    return '新密码需同时包含字母和数字'
  }
  if (form.newPassword === form.oldPassword) return '新密码不能与当前密码相同'
  if (form.confirmPassword !== form.newPassword) return '两次输入的新密码不一致'
  return ''
}

function reset() {
  form.oldPassword = ''
  form.newPassword = ''
  form.confirmPassword = ''
  show.old = false
  show.next = false
  show.confirm = false
  submitting.value = false
  errorMessage.value = ''
}

watch(
  () => props.open,
  (open) => {
    if (open) reset()
  },
)

function close() {
  if (props.forced || submitting.value) return
  emit('close')
}

/** 强制改密时允许退出登录，避免卡在弹窗里 */
async function signOut() {
  if (submitting.value) return
  await logout()
  router.replace('/login')
}

async function submit() {
  if (submitting.value) return
  errorMessage.value = validate()
  if (errorMessage.value) return

  submitting.value = true
  try {
    await changePassword(form.oldPassword, form.newPassword)
    success(props.forced ? '密码已更新，可以开始使用' : '密码已更新')
    reset()
    emit('success')
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      errorMessage.value = '当前密码不正确，请重新输入'
    } else {
      errorMessage.value = error instanceof Error ? error.message : '修改密码失败，请重试'
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <BaseModal
    :open="open"
    :title="title"
    :description="description"
    :width="440"
    :close-on-backdrop="!forced"
    :closable="!forced"
    @close="close"
  >
    <form id="change-password-form" novalidate @submit.prevent="submit">
      <div
        v-if="errorMessage"
        role="alert"
        class="mb-4 flex items-start gap-2 rounded-control bg-feedback-danger-bg px-3.5 py-3 text-[13px] leading-[19px] text-feedback-on-danger"
      >
        <BaseIcon name="alert" :size="18" class="mt-px shrink-0" />
        <span>{{ errorMessage }}</span>
      </div>

      <div class="space-y-4">
        <div>
          <label class="label" for="old-password">当前密码</label>
          <div class="relative">
            <input
              id="old-password"
              v-model="form.oldPassword"
              class="input pr-11"
              :type="show.old ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="请输入当前密码"
            />
            <button
              type="button"
              class="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-neutral-400 hover:text-neutral-600"
              :aria-label="show.old ? '隐藏密码' : '显示密码'"
              @click="show.old = !show.old"
            >
              <BaseIcon :name="show.old ? 'eye-off' : 'eye'" :size="16" />
            </button>
          </div>
        </div>

        <div>
          <label class="label" for="new-password">新密码</label>
          <div class="relative">
            <input
              id="new-password"
              v-model="form.newPassword"
              class="input pr-11"
              :type="show.next ? 'text' : 'password'"
              autocomplete="new-password"
              placeholder="10-72 个字节，含字母和数字"
            />
            <button
              type="button"
              class="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-neutral-400 hover:text-neutral-600"
              :aria-label="show.next ? '隐藏密码' : '显示密码'"
              @click="show.next = !show.next"
            >
              <BaseIcon :name="show.next ? 'eye-off' : 'eye'" :size="16" />
            </button>
          </div>
          <p class="help-text">10-72 个字节，需同时包含字母和数字，且不能与当前密码相同</p>
        </div>

        <div>
          <label class="label" for="confirm-password">确认新密码</label>
          <div class="relative">
            <input
              id="confirm-password"
              v-model="form.confirmPassword"
              class="input pr-11"
              :type="show.confirm ? 'text' : 'password'"
              autocomplete="new-password"
              placeholder="再次输入新密码"
            />
            <button
              type="button"
              class="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-neutral-400 hover:text-neutral-600"
              :aria-label="show.confirm ? '隐藏密码' : '显示密码'"
              @click="show.confirm = !show.confirm"
            >
              <BaseIcon :name="show.confirm ? 'eye-off' : 'eye'" :size="16" />
            </button>
          </div>
        </div>
      </div>
    </form>

    <template #footer>
      <button v-if="forced" type="button" class="btn btn-secondary btn-sm" :disabled="submitting" @click="signOut">
        退出登录
      </button>
      <button v-else type="button" class="btn btn-secondary btn-sm" :disabled="submitting" @click="close">
        取消
      </button>
      <button type="submit" form="change-password-form" class="btn btn-primary btn-sm" :disabled="submitting">
        {{ submitting ? '提交中…' : forced ? '保存并继续' : '确认修改' }}
      </button>
    </template>
  </BaseModal>
</template>
