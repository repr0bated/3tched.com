/**
 * CMS Generator page load.
 *
 * Returns the draft from localStorage if it exists (SSR returns empty,
 * client hydrates via onMount). The publish flag is stored client-side
 * so the server never sees it.
 */

export function load() {
    return {};
}
