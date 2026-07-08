// Turn a stored token name (the User-Agent captured at login) into a short,
// human-friendly device label like "Chrome on Windows". Tokens created before
// device tracking are named "auth_token"; anything unrecognizable falls back to
// "Unknown device".

function browserFrom(ua) {
  // Order matters: Edge/Opera masquerade as Chrome, Chrome contains "Safari".
  if (/\bEdg(e|A|iOS)?\//.test(ua)) return 'Edge'
  if (/\bOPR\/|\bOpera\b/.test(ua)) return 'Opera'
  if (/\bFirefox\//.test(ua)) return 'Firefox'
  if (/\bChrome\//.test(ua)) return 'Chrome'
  if (/\bSafari\//.test(ua)) return 'Safari'
  return null
}

function osFrom(ua) {
  if (/\bWindows\b/.test(ua)) return 'Windows'
  if (/\biPhone\b/.test(ua)) return 'iPhone'
  if (/\biPad\b/.test(ua)) return 'iPad'
  if (/\bAndroid\b/.test(ua)) return 'Android'
  if (/\bMac OS X\b|\bMacintosh\b/.test(ua)) return 'macOS'
  if (/\bLinux\b/.test(ua)) return 'Linux'
  return null
}

export function deviceLabel(tokenName) {
  const ua = (tokenName || '').trim()
  if (!ua || ua === 'auth_token') return 'Unknown device'

  const browser = browserFrom(ua)
  const os = osFrom(ua)

  if (browser && os) return `${browser} on ${os}`
  if (browser) return browser
  if (os) return os
  return 'Unknown device'
}
