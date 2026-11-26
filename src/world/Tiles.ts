export const Tile = {
  ROAD: 0,
  SIDEWALK: 1,
  BUILDING: 2,
  GRASS: 3,
  SAND: 4,
  WATER: 5,
  GRAVEL: 6,
  MUD: 7,
  PARKING: 8,
  PLAZA: 9,
  ALLEY: 10,
  BOARDWALK: 11,
} as const;

export interface Surface {
  name: string;
  grip: number; // lateral grip multiplier
  accel: number; // engine force multiplier
  maxSpeed: number; // top-speed multiplier
  drag: number; // extra drag per second
  offroad: boolean;
  dust: number; // particle tint, 0 = none
  paved: boolean; // affected by wet roads
}

const S = (
  name: string,
  grip: number,
  accel: number,
  maxSpeed: number,
  drag: number,
  offroad: boolean,
  dust: number,
  paved: boolean,
): Surface => ({ name, grip, accel, maxSpeed, drag, offroad, dust, paved });

export const SURFACES: Surface[] = [];
SURFACES[Tile.ROAD] = S('asphalt', 1, 1, 1, 0, false, 0, true);
SURFACES[Tile.SIDEWALK] = S('concrete', 0.95, 0.95, 0.85, 0.1, false, 0, true);
SURFACES[Tile.BUILDING] = S('wall', 1, 1, 1, 0, false, 0, true);
SURFACES[Tile.GRASS] = S('grass', 0.55, 0.6, 0.6, 0.6, true, 0x3d5a2a, false);
SURFACES[Tile.SAND] = S('sand', 0.5, 0.45, 0.5, 1.0, true, 0xb59a68, false);
SURFACES[Tile.WATER] = S('water', 1, 1, 1, 0, false, 0, false);
SURFACES[Tile.GRAVEL] = S('gravel', 0.65, 0.8, 0.78, 0.35, true, 0x8a8478, false);
SURFACES[Tile.MUD] = S('mud', 0.42, 0.42, 0.45, 1.1, true, 0x5a4330, false);
SURFACES[Tile.PARKING] = S('asphalt', 1, 1, 0.9, 0, false, 0, true);
SURFACES[Tile.PLAZA] = S('tiles', 0.9, 0.95, 0.85, 0.1, false, 0, true);
SURFACES[Tile.ALLEY] = S('asphalt', 0.95, 1, 0.9, 0.05, false, 0, true);
SURFACES[Tile.BOARDWALK] = S('planks', 0.85, 0.9, 0.8, 0.15, false, 0, true);

export const isSolidTile = (t: number) => t === Tile.BUILDING || t === Tile.WATER;
