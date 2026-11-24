export type VehicleClass = 'RALLY' | 'OFF-ROAD' | 'STREET' | 'MUSCLE' | 'GT' | 'SUPERCAR';
export type CarKind = 'coupe' | 'sedan' | 'hatch' | 'taxi' | 'van' | 'pickup' | 'muscle' | 'rally' | 'gt' | 'super' | 'truck4x4' | 'buggy';

export interface CarLook {
  kind: CarKind;
  len: number;
  wid: number;
  body: string;
  accent: string;
  stripe?: boolean;
  number?: number;
}

export interface VehicleStats {
  maxSpeed: number; // px/s
  accel: number; // px/s²
  brake: number;
  reverse: number;
  turn: number; // rad/s at full lock
  grip: number; // lateral slip decay per second
  driftGrip: number; // with handbrake
  drag: number;
  offroadPenalty: number; // 1 = full surface penalty, 0.4 = shrugs off dirt
  mass: number;
}

export interface VehicleDef {
  id: string;
  name: string;
  cls: VehicleClass;
  stats: VehicleStats;
  look: CarLook;
}

const st = (maxSpeed: number, accel: number, turn: number, grip: number, offroadPenalty: number, mass: number, driftGrip = 1.4): VehicleStats => ({
  maxSpeed, accel, brake: 720, reverse: 130, turn, grip, driftGrip, drag: 0.22, offroadPenalty, mass,
});

/** Two vehicles per class. All are used: the player drives the Vandal S2, AI rivals are drawn from the full roster. */
export const VEHICLES: VehicleDef[] = [
  { id: 'kestrel', name: 'Dune Kestrel', cls: 'RALLY', stats: st(410, 380, 3.3, 6.5, 0.45, 1.0, 1.6), look: { kind: 'rally', len: 29, wid: 17, body: '#ff7a1a', accent: '#1a1f3a', number: 7 } },
  { id: 'sirocco', name: 'Sirocco R4', cls: 'RALLY', stats: st(400, 395, 3.4, 6.2, 0.4, 0.95, 1.5), look: { kind: 'rally', len: 28, wid: 17, body: '#2a6fb8', accent: '#ffffff', number: 22 } },
  { id: 'mule', name: 'Badland Mule', cls: 'OFF-ROAD', stats: st(360, 330, 2.9, 6.0, 0.25, 1.4), look: { kind: 'truck4x4', len: 35, wid: 21, body: '#4f7d32', accent: '#e8e2c0' } },
  { id: 'scarab', name: 'Scarab Buggy', cls: 'OFF-ROAD', stats: st(380, 420, 3.5, 5.6, 0.2, 0.8), look: { kind: 'buggy', len: 26, wid: 19, body: '#e8c21a', accent: '#202020' } },
  { id: 'vandal', name: 'Vandal S2', cls: 'STREET', stats: st(430, 370, 3.2, 7.5, 0.9, 1.0), look: { kind: 'coupe', len: 32, wid: 16, body: '#c62f2a', accent: '#f2f2f2', stripe: true } },
  { id: 'kitsune', name: 'Kitsune RS', cls: 'STREET', stats: st(425, 380, 3.25, 7.2, 0.9, 0.95), look: { kind: 'hatch', len: 27, wid: 16, body: '#f2f2f5', accent: '#ff3b5c', stripe: true } },
  { id: 'brute', name: 'Brute 69', cls: 'MUSCLE', stats: st(455, 410, 2.8, 6.0, 0.95, 1.35, 1.2), look: { kind: 'muscle', len: 36, wid: 19, body: '#15151c', accent: '#ff2a2a', stripe: true } },
  { id: 'stallion', name: 'Iron Stallion', cls: 'MUSCLE', stats: st(445, 400, 2.85, 6.2, 0.95, 1.3, 1.2), look: { kind: 'muscle', len: 36, wid: 19, body: '#2a4bd8', accent: '#ffffff', stripe: true } },
  { id: 'halcyon', name: 'Halcyon GT', cls: 'GT', stats: st(470, 390, 3.0, 8.2, 1.0, 1.1), look: { kind: 'gt', len: 33, wid: 18, body: '#e9eef5', accent: '#1f6bff', stripe: true } },
  { id: 'apex', name: 'Apex GT3', cls: 'GT', stats: st(475, 385, 3.05, 8.4, 1.0, 1.1), look: { kind: 'gt', len: 33, wid: 18, body: '#20c46a', accent: '#101010' } },
  { id: 'vortex', name: 'Vortex Zero', cls: 'SUPERCAR', stats: st(500, 430, 3.0, 8.0, 1.0, 1.05), look: { kind: 'super', len: 33, wid: 18, body: '#ffcc00', accent: '#111111' } },
  { id: 'phantom', name: 'Phantom V12', cls: 'SUPERCAR', stats: st(505, 420, 2.95, 7.8, 1.0, 1.1), look: { kind: 'super', len: 34, wid: 18, body: '#2e3036', accent: '#c8ccd2' } },
];

export const vehicleById = (id: string) => VEHICLES.find((v) => v.id === id)!;

/** Civilian traffic looks. */
const TRAFFIC_COLORS = ['#8a93a6', '#b33a3a', '#2f5e9e', '#d8d8d8', '#3d6e4f', '#6e4a8a', '#c2a35a', '#26282f', '#9e5a2f'];
export const TRAFFIC_LOOKS: CarLook[] = [
  ...TRAFFIC_COLORS.map((body, i): CarLook => ({ kind: i % 2 ? 'sedan' : 'hatch', len: i % 2 ? 31 : 26, wid: 16, body, accent: '#000' })),
  { kind: 'taxi', len: 30, wid: 16, body: '#f2c21b', accent: '#111' },
  { kind: 'taxi', len: 30, wid: 16, body: '#f2c21b', accent: '#111' },
  { kind: 'van', len: 36, wid: 18, body: '#e5e5e5', accent: '#2b6fd8' },
  { kind: 'van', len: 36, wid: 18, body: '#4a5a6a', accent: '#ffb000' },
  { kind: 'pickup', len: 34, wid: 18, body: '#7a2a2a', accent: '#000' },
  { kind: 'pickup', len: 34, wid: 18, body: '#3a4a5a', accent: '#000' },
];
