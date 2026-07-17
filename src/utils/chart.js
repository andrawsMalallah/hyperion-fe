// Shared by the Progress charts (TrendChart, VolumeChart) and the view that
// hosts them. Lives here rather than in either component because both need it —
// duplicating the padding would silently misalign the two charts' axes.

// Chart data color — validated against the dark surface (#1E1E1E) with the
// dataviz palette validator; the brand accent #CCFF00 is out of the dark
// lightness band, #7A9900 is the nearest passing step of the same hue.
export const DATA_COLOR = '#7A9900'

// Plot padding. `left` carries the y-axis labels, `bottom` the x-axis ones.
export const PAD = { top: 16, right: 16, bottom: 30, left: 44 }

/** Short axis/tooltip date, e.g. "Mar 4". */
export const dateFmt = d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
