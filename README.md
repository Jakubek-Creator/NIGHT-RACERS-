NEON BAY MATHS MISSIONS

MASTER VISUAL & TECHNICAL IMPLEMENTATION SPECIFICATION

FINAL DESIGN DECISIONS

Game: Neon Bay Maths Missions
Genre: Open-world arcade racing and educational game.
Camera: Classic GTA 2-style follow camera.
Graphics: Detailed modern pixel art.
World: Seamless connected open world.
Platform: HTML/browser, mobile-first.
Gameplay: 2D top-down only.

1. VISUAL IDENTITY

Create a detailed, modern pixel-art world.

Visual inspiration:

- GTA 2 top-down perspective.
- Classic arcade racing games.
- Modern detailed pixel-art environments.
- Forza Horizon festival atmosphere.

Use:

- Detailed vehicle sprites.
- Distinctive buildings.
- Animated traffic lights.
- Road markings.
- Neon signs.
- Environmental animations.
- Vehicle shadows.
- Headlights and brake lights.
- Wet road reflections.
- Dynamic weather.

Maintain a consistent pixel scale and crisp rendering. Avoid blurry sprites and inconsistent artwork.

2. CAMERA

Implement a classic follow camera.

Requirements:

- Player vehicle stays near screen centre.
- Smooth camera interpolation.
- Stable world orientation.
- No automatic camera rotation.
- Optional look-ahead in driving direction.
- Camera shake during impacts.
- Adjustable zoom.
- Proper world boundaries.

3. SEAMLESS WORLD

Create five connected districts:

NEON CITY:
Urban streets, traffic, shops, garages and street racing.

INDUSTRIAL ZONE:
Warehouses, shipping containers, industrial roads and drag racing.

WILDLANDS:
Forests, dirt tracks, mud, mountains and rally routes.

RACING PARK:
Professional racing circuits and championships.

COASTAL HIGHWAY:
Seaside roads, long straights and sprint races.

Use chunk-based world streaming.

Requirements:

- Continuous world coordinates.
- Load nearby chunks.
- Preload neighbouring chunks.
- Unload distant visual assets.
- No visible loading transitions.
- Persistent race and mission locations.
- Optimised traffic and AI simulation.

4. VEHICLE SYSTEM

Create six classes:

RALLY
OFF-ROAD
STREET
MUSCLE
GT / RACE
SUPERCAR

Start with two vehicles per class.

Each vehicle needs:

- Individual performance statistics.
- Unique sprite.
- Collision geometry.
- Engine audio.
- Lighting.
- Shadow.
- Damage states.
- Upgrade compatibility.

Use reusable physics components.

5. ARCADE PHYSICS

Implement:

- Acceleration.
- Braking.
- Steering.
- Grip.
- Drifting.
- Momentum.
- Collision response.
- Terrain interaction.
- Jump behaviour.

Terrain surfaces:

- Asphalt.
- Gravel.
- Mud.
- Grass.
- Sand.

Vehicle handling must dynamically change based on surface and vehicle class.

6. RACING SYSTEM

Support:

- Rally stages.
- Street races.
- Circuit races.
- Drag races.
- Desert raids.
- Highway sprints.
- Time attacks.

Use modular track components.

Implement:

- Start and finish.
- Checkpoints.
- Lap counting.
- Race positions.
- AI competitors.
- Shortcuts.
- Track surfaces.
- Rewards.
- Results screen.

Support mixed-class competitions.

7. OPEN-WORLD AI

Implement:

- Civilian traffic.
- Parked vehicles.
- Racing opponents.
- Rival drivers.
- Event-specific AI.

Create different AI personalities.

Use simplified AI simulation for distant vehicles and more detailed behaviour near the player.

8. FESTIVAL AND ECONOMY

Create Neon Bay Festival as the central hub.

Include:

- Vehicle dealership.
- Garage.
- Upgrades.
- Championship events.
- Rival challenges.
- Reputation.
- Leaderboards.
- Vehicle collection.

Separate reputation for:
Street, Rally, Circuit, Off-road and Drag.

9. NOVA AND MATHS

Preserve the existing Nova character and educational system.

Integrate maths challenges into:

- Missions.
- Rewards.
- Unlocks.
- Vehicle upgrades.
- Championships.
- District progression.

Maintain adaptive difficulty.

Never interrupt normal free-roaming unnecessarily.

10. MOBILE HUD

Create:

- Mini-map.
- Speedometer.
- Race position.
- Money and reputation.
- Virtual steering.
- Accelerator.
- Brake.
- Contextual interaction button.
- Pause menu.

Allow control resizing and positioning.

Make sure the interface does not cover important gameplay.

11. TECHNICAL ARCHITECTURE

Preferred architecture if compatible with the existing project:

- Phaser 3.
- TypeScript.
- Tiled map editor.
- IndexedDB for persistent saves.
- Web Audio API.

Use reusable modules and separate gameplay systems.

Do not introduce unnecessary dependencies.

12. PERFORMANCE

Target 60 FPS.

Use:

- Texture atlases.
- Sprite batching where possible.
- Chunk streaming.
- Object pooling.
- Collision optimisation.
- Efficient AI updates.
- Asset preloading.
- Mobile performance testing.

Maintain crisp pixel rendering.

13. IMPLEMENTATION RULES

IMPORTANT:

Before changing code, inspect the complete existing project.

Do not rebuild the project from scratch unless absolutely necessary.

Do not remove working maths functionality.

Do not create placeholder systems that look finished but do not work.

Implement incrementally.

After each milestone:

- Test gameplay.
- Test mobile controls.
- Check console errors.
- Check frame rate.
- Verify existing functionality.
- Document changed files.

FIRST DEVELOPMENT TASK

Build the first playable Neon City prototype.

It must contain:

1. One detailed pixel-art city environment.
2. One controllable car.
3. Smooth GTA 2-style follow camera.
4. Arcade vehicle physics.
5. Working collisions.
6. Basic civilian traffic.
7. Mobile driving controls.
8. A mini-map.
9. One accessible race event.

Do not build all five districts yet.

The first goal is a polished, genuinely playable open-world driving experience.

Once this works, expand the architecture and features incrementally.





# NIGHT-RACERS-
best racing game ever existed NIGHT-RECERS PROLOGUE 
