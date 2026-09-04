export const IMAGE_INVENTORY_STATUSES = [
  'complete',
  'missing-main',
  'missing-thumbnail',
  'missing-both',
] as const;

export type ImageInventoryStatus = (typeof IMAGE_INVENTORY_STATUSES)[number];

export type ImageInventoryCounts = Record<ImageInventoryStatus, number>;

export type ImageInventoryItem = {
  mainImage: unknown;
  thumbImage: unknown;
};

export function imageInventoryStatus(
  item: ImageInventoryItem
): ImageInventoryStatus {
  if (item.mainImage && item.thumbImage) return 'complete';
  if (!item.mainImage && !item.thumbImage) return 'missing-both';
  return item.mainImage ? 'missing-thumbnail' : 'missing-main';
}

export function emptyImageInventoryCounts(): ImageInventoryCounts {
  return {
    complete: 0,
    'missing-main': 0,
    'missing-thumbnail': 0,
    'missing-both': 0,
  };
}

export function countImageInventory(
  items: readonly ImageInventoryItem[]
): ImageInventoryCounts {
  const counts = emptyImageInventoryCounts();
  for (const item of items) counts[imageInventoryStatus(item)] += 1;
  return counts;
}
