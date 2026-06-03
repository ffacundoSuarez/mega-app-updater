/** IDs de display: 998→98, 999→99 para la UI y exportación. */

export function getDisplayCategoryId(backendId: number): number {
  if (backendId === 998) return 98;
  if (backendId === 999) return 99;
  return backendId;
}

export function getBackendCategoryId(displayId: number): number {
  if (displayId === 98) return 998;
  if (displayId === 99) return 999;
  return displayId;
}
