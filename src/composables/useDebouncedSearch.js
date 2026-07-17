import { onUnmounted } from 'vue'

// Shared behaviour for the app's search bars (Discover's programs, the exercise
// picker's catalog): wait for a pause in typing before spending a request, and
// don't fire at all on a single character — a one-letter query matches most of
// the list, so it costs a full page to show the user something they're still
// narrowing down.
//
// `readQuery` is a getter rather than a ref because both call sites proxy their
// query through a store-backed computed.
export function useDebouncedSearch(readQuery, onSearch, { delay = 350, minLength = 2 } = {}) {
  let timeout = null

  function cancel() {
    clearTimeout(timeout)
    timeout = null
  }

  function onSearchInput() {
    // Supersede any pending search: only the latest keystroke should fetch.
    cancel()
    const query = readQuery().trim()
    // An empty query IS a real search (it resets the list to page 1); anything
    // shorter than minLength is not. Note this leaves the pending search
    // cancelled — typing down to one character stops the request it queued.
    if (query.length > 0 && query.length < minLength) return
    timeout = setTimeout(() => {
      timeout = null
      onSearch()
    }, delay)
  }

  // A timer outliving its component would fetch into a store the view no longer
  // renders — and in the picker's case, re-populate a catalog it just reset.
  onUnmounted(cancel)

  return { onSearchInput, cancel }
}
