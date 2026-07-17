import { nextTick, onUnmounted, watch } from 'vue'

// Keyboard behaviour shared by every modal in the app: while one is open, Tab
// must cycle inside it, Escape must close it, and closing must hand focus back
// to whatever opened it. Without the trap a keyboard or screen-reader user can
// tab straight through the dialog into the page behind it, which is still
// rendered and still focusable.
//
// AppModal and ExerciseSelectionModal both use this — the picker is a
// hand-rolled overlay rather than an AppModal because its footer sits outside
// its own scrolling list, so it needs the behaviour without the shell.

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Trap focus inside a dialog while it is open.
 *
 * The container must be focusable itself (`tabindex="-1"`) so focus has
 * somewhere to land when the dialog has no focusable content of its own.
 *
 * @param {import('vue').Ref<boolean>|(() => boolean)} isOpen  open state to follow
 * @param {import('vue').Ref<HTMLElement|null>} containerRef    the dialog element
 * @param {object}   [options]
 * @param {Function} [options.onEscape]      called when Escape is pressed
 * @param {Function} [options.initialFocus]  returns the element to focus on open;
 *                                           falls back to the container itself
 */
export function useFocusTrap(isOpen, containerRef, options = {}) {
  const { onEscape, initialFocus } = options

  // What had focus before the dialog opened. Without restoring it, closing
  // drops focus onto <body> and a keyboard user restarts from the top of the page.
  let lastActiveElement = null

  function focusableItems() {
    if (!containerRef.value) return []
    return Array.from(containerRef.value.querySelectorAll(FOCUSABLE_SELECTOR))
  }

  function onKeydown(e) {
    if (e.key === 'Escape') {
      // Stop the key reaching a parent view that might act on it too.
      e.stopPropagation()
      if (onEscape) onEscape()
      return
    }
    if (e.key !== 'Tab') return

    const items = focusableItems()
    if (items.length === 0) return

    const first = items[0]
    const last = items[items.length - 1]
    const activeIndex = items.indexOf(document.activeElement)

    // On open, focus sits on the container itself, which is tabindex="-1" and so
    // is not in the cycle. Shift+Tab from there would walk backwards out of the
    // dialog, so pull focus to the matching end instead of letting it leave.
    if (activeIndex === -1) {
      e.preventDefault()
      ;(e.shiftKey ? last : first).focus()
      return
    }

    // Tabbing off either end wraps to the other, so focus never leaves the dialog.
    if (e.shiftKey && activeIndex === 0) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && activeIndex === items.length - 1) {
      e.preventDefault()
      first.focus()
    }
  }

  function release() {
    document.removeEventListener('keydown', onKeydown)
  }

  watch(isOpen, (open) => {
    if (open) {
      lastActiveElement = document.activeElement
      document.addEventListener('keydown', onKeydown)
      // Wait for the dialog to render before focusing into it.
      nextTick(() => {
        const target = (initialFocus && initialFocus()) || containerRef.value
        if (target) target.focus()
      })
    } else {
      release()
      if (lastActiveElement && lastActiveElement.focus) {
        lastActiveElement.focus()
      }
      lastActiveElement = null
    }
  })

  // A dialog unmounted while open would otherwise leave its listener behind.
  onUnmounted(release)
}
