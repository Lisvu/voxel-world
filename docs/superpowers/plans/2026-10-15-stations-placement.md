# Natural Placement and Stations Implementation Plan

> Execute directly under the user's standing authorization; preserve existing TypeScript/React/Three/Rapier stack and push verified changes to main.

**Goal:** Fix trackpad placement friction and replace the workbench shortcut with real crafting and furnace inventories.
**Architecture:** Shared pure station rules; per-coordinate optional station snapshots; standalone DOM station dialog; existing engine handles input, world changes, clock and persistence. No new database tables.
**Decisions:** Workbench has a persistent 3×3 material grid and shaped recipe preview, recipe-fill convenience and explicit craft action. Furnace has input/fuel/output, 8-second recipes, coal 64s / wood or planks 16s fuel. Furnace advances while its dialog is open or game is active, but not in other pause menus, hidden tabs or offline. Furnace #23 and glass #24; cooked fish #208. Metal ores now drop ore blocks for smelting; existing ingots remain usable. At most 128 occupied station states; empty stations are created lazily. Contents drop on break atomically with block. Creative fill is free; survival transfers are atomic and respect capacity.

## Review focus
- Insufficient ingredients/full inventory must never destroy or duplicate items.
- Input changes reset furnace progress; output blockage must not consume new fuel.
- Close/reenter restores grids, timers, output; orphan or invalid station keys rejected by API.
- Breaking a full station at drop limit must leave it intact.
- Held placement ends on release, blur, menu opening; interaction opens once, no accidental build-through.

## Task 1: Shared station mechanics
Files shared/stations.ts, tests/stations.test.mjs. Write failing tests for grid recipe match/craft/fill/return and furnace fuel/progress/output bounds. Implement types/functions described below and run tests. Transfer mutations must be all-or-nothing. Domain owns slots and recipes, not rendering.
Interface: Stack={id:number,count:number}; Station={kind:'workbench'|'furnace',slots:(Stack|null)[],progress:number,burn:number}; createStation(kind), stationRecipes array {id,name,pattern:(number|null)[],output:Stack}; matchRecipe(slots), fillRecipe(station,recipeId,inventory,creative), craftStation(station,inventory,creative), transferTo(station,index,id,count,inventory,creative), transferBack(station,index,inventory), advanceFurnace(station,dt), stationContents(station). Functions return boolean where applicable; furnace mutates bounded state.

## Task 2: Station UI
Files src/game/StationPanel.ts and station-panel.css. createStationPanel({name,inventory,creative,changed,close}) => {open(key,station),refresh(),dispose()}. Module creates #station-panel dialog, close button, input transfer controls, 3×3 grid/recipe selector/result or furnace three slots/progress/fuel status. open populates but does not showModal; engine opens modal. Inventory callbacks return current mutable inventory. Recipe helpers perform mutation; changed calls engine update/save. Do not steal gameplay keys while open. Test real DOM interactions in browser after integration.

## Task 3: World and input integration
Files shared/items.ts, contracts.ts, engine.ts, features.ts, GameView.tsx. First add reproduction for held placement and workbench dialog absence. Add schemas/defaults/fingerprint and furnace/glass/cooked fish ids. Validate station kind against block changes, keys, slots, timers and 128 cap. Engine updates timers, opens dialogs, performs station-content drop transaction and saves/reloads. Separate held-placement input from drag-look; placement geometry from current ray hit and cardinal face. Retain free-look on trackpad, hold R/right pointer/place button at 180ms repeat, clear on blur/pause. Preserve single click place and F mine.

## Task 4: Verification and delivery
Run typechecks, all Node tests, focused browser placement/stations, prior survival/equipment/flight regression, real API persistence. Inspect UI screenshots. Update README with recipes, controls, timer behavior and compatibility. Independent read-only review; fix evidenced issues then submit through GitHub with expected main SHA lease. No unrelated files or user worlds modified.
