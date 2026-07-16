import * as Sentry from '@sentry/vue';

/**
 * Error monitoring (ROADMAP 6.3).
 *
 * Sentry stays completely disabled unless VITE_SENTRY_DSN is set, so local dev
 * and any build made before the Sentry project exists simply report nothing.
 *
 * Privacy stance: only the numeric user ID is ever attached (see setSentryUser).
 * The dataCollection options below turn off every category that could carry
 * something more sensitive — the SDK's defaults are not conservative enough for
 * this app, see the comments on each.
 */
export function initSentry(app) {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn) {
    return;
  }

  Sentry.init({
    app,
    dsn,
    // 'production' / 'development' — keeps local noise out of the prod issue feed.
    environment: import.meta.env.MODE,
    // `integrations` is deliberately not passed: the defaults cover uncaught
    // errors and breadcrumbs, while performance tracing and session replay stay
    // off (they are opt-in). Errors only keeps the bundle small and stays well
    // inside Sentry's free-tier quota.
    dataCollection: {
      // The SDK would populate user.* from instrumentation; we attach the ID
      // ourselves in setSentryUser instead. (Already the default — pinned so a
      // future SDK default can't silently widen what we send.)
      userInfo: false,
      // Defaults to collecting every HTTP body. The login, register and
      // change-password requests carry plaintext passwords, so bodies are off.
      httpBodies: [],
      // Defaults to true. The password-reset link is
      // /reset-password/{token}?email=… — its query string is both a credential
      // and PII, and must never reach a third party.
      queryParams: false,
      // Auth is a localStorage bearer token; there are no cookies worth sending.
      cookies: false,
    },
  });
}

/**
 * Tag subsequent error reports with the signed-in user's ID.
 *
 * Only the ID — enough to tell "one user" from "everyone" and to line a browser
 * error up with the matching API error, without sending a name or email.
 * No-ops when Sentry was never initialised.
 */
export function setSentryUser(user) {
  if (!user?.id) {
    return;
  }

  Sentry.setUser({ id: user.id });
}

/** Drop the user tag on logout so later errors aren't misattributed. */
export function clearSentryUser() {
  Sentry.setUser(null);
}
