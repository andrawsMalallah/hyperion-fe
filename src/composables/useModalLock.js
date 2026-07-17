import { onUnmounted, watch } from 'vue'

// Scroll-locking shared by every modal in the app: while one is open, the page
// behind it must not scroll (`modal-open` in style.css sets overflow: hidden on
// <html> and <body>).
//
// ⚠️ The lock is COUNTED, and that is the whole point of the composable. The
// class is a single flag on two shared elements, so add/remove per modal breaks
// the moment two are open at once: the first to close removes the class and the
// page starts scrolling behind the one still open. That is reachable today —
// ProgramBuilder's unsaved-changes AppModal opens over the exercise picker when
// the user navigates away with the picker still up. Counting holders means the
// lock lifts only when the LAST modal closes.
let holders = 0

function acquire() {
  holders += 1
  if (holders === 1) {
    document.documentElement.classList.add('modal-open')
    document.body.classList.add('modal-open')
  }
}

function release() {
  holders = Math.max(0, holders - 1)
  if (holders === 0) {
    document.documentElement.classList.remove('modal-open')
    document.body.classList.remove('modal-open')
  }
}

/**
 * Hold the page-scroll lock while a modal is open.
 *
 * @param {import('vue').Ref<boolean>|(() => boolean)} isOpen  open state to follow
 */
export function useModalLock(isOpen) {
  // Whether THIS modal currently counts as a holder, so a repeated open never
  // double-counts and a release can't run twice (which would drop someone
  // else's hold).
  let held = false

  function lock() {
    if (held) return
    held = true
    acquire()
  }

  function unlock() {
    if (!held) return
    held = false
    release()
  }

  watch(isOpen, (open) => (open ? lock() : unlock()))

  // A modal unmounted while open must give its hold back, or the page stays
  // locked forever.
  onUnmounted(unlock)
}
