<script lang="ts" module>
  // 16×16 stroke icons (1.5px), drawn for MarkType.
  const PATHS = {
    chevron: 'M6 4l4 4-4 4',
    folder:
      'M2 4.5A1.5 1.5 0 0 1 3.5 3h3l1.5 1.5h4.5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z',
    file: 'M4 2h5l3 3v8.5a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5zM9 2v3h3',
    plus: 'M8 3v10M3 8h10',
    folderPlus:
      'M2 4.5A1.5 1.5 0 0 1 3.5 3h3l1.5 1.5h4.5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5zM8 7v4M6 9h4',
    filePlus: 'M4 2h5l3 3v8.5a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5zM9 2v3h3M8 7.5v4M6 9.5h4',
    refresh: 'M13 8a5 5 0 1 1-1.5-3.5M13 2.5V5h-2.5',
    collapse: 'M5 10l3-3 3 3M5 6.5l3-3 3 3',
    close: 'M4 4l8 8M12 4l-8 8',
    search: 'M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM10.5 10.5L14 14',
    arrowUp: 'M8 13V3M4 7l4-4 4 4',
    arrowDown: 'M8 3v10M4 9l4 4 4-4',
    list: 'M3 4h10M5 8h8M7 12h6',
    replace: 'M3 5h7l-2-2M13 11H6l2 2',
    gear: 'M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4',
  } as const;
  export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
  let { name, size = 16 }: { name: IconName; size?: number } = $props();
</script>

<svg
  class="mt-icon"
  width={size}
  height={size}
  viewBox="0 0 16 16"
  fill="none"
  stroke="currentColor"
  stroke-width="1.5"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d={PATHS[name]} />
</svg>
