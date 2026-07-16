export const toastState = $state({ message: '', visible: false, isError: false });

let timer: ReturnType<typeof setTimeout> | undefined;

export function toast(message: string, isError = false) {
  toastState.message = message;
  toastState.isError = isError;
  toastState.visible = true;
  clearTimeout(timer);
  timer = setTimeout(() => {
    toastState.visible = false;
  }, 2600);
}
