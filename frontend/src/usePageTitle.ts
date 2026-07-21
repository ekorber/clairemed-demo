import { useEffect } from "react";

const BRAND = "Alice";

/** Sets the browser tab title to "Alice · <page>". The pattern lives here so every page
 *  stays consistent and brand-first, and it is easy to change in one place. */
export function usePageTitle(page: string): void {
  useEffect(() => {
    document.title = `${BRAND} · ${page}`;
  }, [page]);
}
