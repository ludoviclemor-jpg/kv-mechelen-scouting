"use client";

import { useEffect } from "react";

/**
 * Warns before losing unsaved work — a real browser `beforeunload` prompt
 * (covers reload/close-tab/typed-URL navigation) plus a click-capture
 * guard on internal same-origin links (covers clicking a `<Link>`
 * elsewhere in the app, which `beforeunload` alone never sees since
 * Next.js App Router intercepts it client-side without a full
 * navigation). Known limitation: this can't intercept a programmatic
 * `router.push()` triggered from outside the guarded component itself —
 * there's no stable App Router "before route change" hook to attach to
 * for that case.
 */
export function useUnsavedChangesGuard(hasUnsavedChanges: boolean, message = "You have unsaved changes. Leave this page?") {
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }

    function handleClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      const anchor = (e.target as HTMLElement)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.origin);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return; // let external links behave normally
      if (url.pathname === window.location.pathname && url.search === window.location.search) return; // same page (e.g. an anchor link)
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClick, true);
    };
  }, [hasUnsavedChanges, message]);
}
