// 应用内确认框与轻提示（Electron 不支持 window.confirm/alert，必须自绘）
import { reactive } from 'vue'

export const confirmState = reactive({
  open: false,
  message: '',
  resolve: null,
})

export function appConfirm(message) {
  return new Promise((resolve) => {
    confirmState.message = message
    confirmState.open = true
    confirmState.resolve = resolve
  })
}

export function answerConfirm(ok) {
  confirmState.open = false
  const r = confirmState.resolve
  confirmState.resolve = null
  if (r) r(ok)
}

export const toastState = reactive({ message: '', visible: false, kind: 'ok' })
let toastTimer = null

export function notify(message, kind = 'ok') {
  toastState.message = message
  toastState.kind = kind
  toastState.visible = true
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastState.visible = false
  }, 3000)
}
