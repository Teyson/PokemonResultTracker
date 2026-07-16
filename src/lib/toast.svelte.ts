export const toastState = $state<{
  message: string;
  visible: boolean;
  isError: boolean;
  action: { label: string; onClick: () => void } | null;
}>({ message: '', visible: false, isError: false, action: null });

let timer: ReturnType<typeof setTimeout> | undefined;

export function toast(
  message: string,
  isError = false,
  opts: { action?: { label: string; onClick: () => void }; duration?: number } = {}
) {
  toastState.message = message;
  toastState.isError = isError;
  toastState.action = opts.action ?? null;
  toastState.visible = true;
  clearTimeout(timer);
  timer = setTimeout(() => {
    toastState.visible = false;
    toastState.action = null;
  }, opts.duration ?? 2600);
}
