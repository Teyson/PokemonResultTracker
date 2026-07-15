// Both routes are static with no dynamic params, so the whole site can be
// prerendered to real HTML files (build/index.html, build/admin/index.html).
// All auth/data fetching still happens client-side after hydration.
export const prerender = true;
