<script setup>
// A pending-action button label whose trailing dots cycle . -> .. -> ... so the
// button reads as alive without an in-button spinner (user's call, S38).
//
// The dots are CSS-animated rather than driven by a JS interval: there is no
// timer to leak if the button unmounts mid-request (these labels live on forms
// that navigate away on success), and it costs no reactivity.
defineProps({
  // The static part of the label, e.g. "Saving" — pass it WITHOUT trailing dots.
  text: {
    type: String,
    required: true
  }
})
</script>

<template>
  <!--
    Screen readers get the plain word once, from the visually-hidden copy.
    The animated dots are aria-hidden: a live-updating "Saving." -> "Saving.."
    would otherwise be re-announced on every tick.
  -->
  <span class="pending-label">
    <span class="visually-hidden">{{ text }}</span>
    <span aria-hidden="true" class="pending-label-text">{{ text }}</span><span
      aria-hidden="true"
      class="pending-dots"
    ><span class="pending-dot">.</span><span class="pending-dot">.</span><span class="pending-dot">.</span></span>
  </span>
</template>

<style scoped>
.pending-label {
  display: inline-flex;
  align-items: baseline;
  white-space: nowrap;
}

/*
  The dots are always PRESENT and only change opacity — never added or removed
  from the layout. Animating the character count would re-measure the button on
  every tick, so the button (and the row of buttons beside it) would visibly
  jump three times a second. Reserving the width is what keeps it steady.
*/
.pending-dots {
  display: inline-flex;
}

/* Timing only — each dot's animation-name (and so its keyframes) is set below. */
.pending-dot {
  opacity: 0;
  animation-duration: 1.2s;
  animation-iteration-count: infinite;
  animation-timing-function: steps(1, end);
}

/*
  All three dots share one 1.2s clock (no per-dot delay) and each simply turns
  on at its own third: dot 1 at 0%, dot 2 at 33%, dot 3 at 66%. So the label
  accumulates . -> .. -> ... and resets.
  ⚠️ Do NOT reach for animation-delay here — the obvious version (one keyframe,
  staggered delays) does NOT accumulate. Each dot's visible window would slide
  along with its delay instead of nesting inside the previous dot's, and the
  dots appear to travel rightwards ('.', '..', ' ..'). Verified by sampling
  computed opacity frame by frame.
*/
.pending-dot:nth-child(1) {
  animation-name: pending-dot-1;
}

.pending-dot:nth-child(2) {
  animation-name: pending-dot-2;
}

.pending-dot:nth-child(3) {
  animation-name: pending-dot-3;
}

@keyframes pending-dot-1 {
  0%,
  100% {
    opacity: 1;
  }
}

@keyframes pending-dot-2 {
  0% {
    opacity: 0;
  }
  33.33%,
  100% {
    opacity: 1;
  }
}

@keyframes pending-dot-3 {
  0% {
    opacity: 0;
  }
  66.66%,
  100% {
    opacity: 1;
  }
}

/*
  Reduced motion: show all three dots statically. The label still reads as a
  pending state ("Saving...") — it just doesn't animate.
*/
@media (prefers-reduced-motion: reduce) {
  .pending-dot {
    animation: none;
    opacity: 1;
  }
}
</style>
