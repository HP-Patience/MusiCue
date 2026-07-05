const input = document.getElementById('quick-input');
const quickInput = window.electronQuickInput;

function focusInput() {
  if (!input) return;
  input.value = '';
  requestAnimationFrame(() => input.focus());
}

function submitInput() {
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  quickInput?.submit(text);
  input.value = '';
}

input?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault();
    submitInput();
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    quickInput?.close();
  }
});

window.addEventListener('DOMContentLoaded', focusInput);
quickInput?.onFocus?.(focusInput);
