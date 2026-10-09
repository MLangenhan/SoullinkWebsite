import type { AreaData } from '@/lib/areas'

/** Ausschnitt aus public/areas/heartgold-soulsilver.json */
export const HGSS: AreaData = {
  versionGroup: 'heartgold-soulsilver',
  regions: [
    ['Johto', 'Johto'],
    ['Kanto', 'Kanto'],
  ],
  areas: [
    [0, 'Route 29', 'Route 29', 'w', 29],
    [0, 'Steineichenwald', 'Ilex Forest', 'w', 0],
    [0, 'Knofensa-Turm', 'Sprout Tower', 'w', 0],
    [0, 'Viola City', 'Violet City', 'ws', 0],
    [0, 'Dukatia City', 'Goldenrod City', 's', 0],
    [1, 'Route 1', 'Route 1', 'w', 1],
  ],
}
