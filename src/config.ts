/** Global world constants. 1 tile = 32 px = 4 m. */
export const TILE = 32;
export const BLOCK = 16; // tiles per city grid cell (road + block)
export const ROAD_W = 4; // road width in tiles (one lane each direction)
export const GRID = 8; // intersections per axis
export const MAP_W = GRID * BLOCK; // 128 tiles
export const MAP_H = GRID * BLOCK;
export const WORLD_W = MAP_W * TILE; // 4096 px
export const WORLD_H = MAP_H * TILE;
export const CHUNK_TILES = 16;
export const CHUNK_PX = CHUNK_TILES * TILE;
export const CHUNKS_X = MAP_W / CHUNK_TILES;
export const CHUNKS_Y = MAP_H / CHUNK_TILES;
export const COAST_X = 116; // tiles with x >= this are boardwalk / beach / bay
export const PX_PER_M = 8;

export const toKmh = (pxPerSec: number) => Math.round((Math.abs(pxPerSec) / PX_PER_M) * 3.6);

/** World-space centre of grid intersection i (same formula for x and y). */
export const nodePos = (i: number) => (i * BLOCK + ROAD_W / 2) * TILE;

export const DEPTH = {
  ground: 0,
  wet: 1,
  skid: 2,
  marker: 3,
  shadow: 4,
  underglow: 4.5,
  car: 5,
  light: 6,
  sign: 7,
  beam: 8,
} as const;

/** Direction vectors: 0=E 1=S 2=W 3=N (y grows downward). */
export const DIRS = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
] as const;
