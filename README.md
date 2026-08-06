# Space Company — Modernization Fork

This is **Rodrigo's modernization fork** of *Space Company*, a science-fiction
incremental browser game. The goal of the fork is to modernize the tooling,
architecture and visual design **without changing gameplay, balance, or save
compatibility**.

> **Attribution & licence.** The original game was created by **sparticle999**
> (https://github.com/sparticle999/SpaceCompany). It is distributed under the
> licence in [`LICENCE.txt`](LICENCE.txt): the MIT licence text **plus an
> additional condition** — "Sparticle999 is made aware that the Software has been
> used somewhere else." Because of that extra clause it is **not** unmodified,
> standard MIT, so `package.json` declares `"SEE LICENSE IN LICENCE.txt"` rather
> than `"MIT"`. This fork **preserves `LICENCE.txt` and the original copyright
> notice byte-for-byte**, including the notification condition — meaning
> **sparticle999 should be made aware that this fork reuses the Software.** All
> original gameplay design credit belongs to sparticle999 and the Space Company
> community. The original project README (overview and full changelog) is
> preserved below.

- **Upstream:** https://github.com/sparticle999/SpaceCompany
- **This fork:** https://github.com/rodriar000/SpaceCompany

## Status: Milestone M5a — Performance Foundation

**M0** established a reproducible dev environment, characterization tests and
documentation. **M1** layered a premium, dark, cinematic command-center
interface over the legacy game and removed inherited Google Analytics and the
Kongregate script. **M2** replaced the fixed-width, four-column resource table
with a responsive **resource-card dashboard**. **M3 (this branch)** replaces the
flat research table with a **technology map**. **M5a (this branch)** removes the game's dominant per-tick cost — a memoised
number formatter cuts combined modern UI work from 4.9 ms to 0.9 ms (p95) and
`Game.fastUpdate` from 12.9 ms to 1.6 ms — and drops the last third-party
runtime request (Google Fonts). **M4** replaced the
solar-system navigation column with a **celestial operations command center**:
a deterministic orbital map, an interstellar network gated by the canonical
telescope reach, a destination inspector, frontier focus, and a vertical mission
route on phones — plus a fix for 79 inherited duplicate DOM IDs. M3 delivered: stage columns flowing left to
right, themed lane bands, SVG connectors with direction arrows, seven clearly
distinguished states, a progression header, a frontier focus control and a
selected-technology inspector — plus a distinct vertical progression pathway on
phones.

Every milestone so far is **non-destructive**: no gameplay, balance, progression
or save-format change. Both new views are read-only *projections* of the legacy
DOM and data. The resource dashboard reads the legacy rows' lock and selection
state and activates a resource by dispatching a real click on the row. The
technology map derives its edges only from canonical `newTechs`, reads
`unlocked` / `current` from `Game.tech`, and researches by dispatching a real
click on the legacy `purchaseTech` button — so neither view can disagree with
the game, and neither can spend a resource itself.

See [`docs/`](docs/) for the full analysis:

- [`docs/LEGACY_ARCHITECTURE.md`](docs/LEGACY_ARCHITECTURE.md) — how the legacy game is wired.
- [`docs/SAVE_COMPATIBILITY.md`](docs/SAVE_COMPATIBILITY.md) — storage keys, save schema, invariants.
- [`docs/UI_DOM_CONTRACT.md`](docs/UI_DOM_CONTRACT.md) — DOM IDs/classes the legacy code depends on (M1–M3 preserve these).
- [`docs/MODERNIZATION_ROADMAP.md`](docs/MODERNIZATION_ROADMAP.md) — milestones M0–M8.
- [`docs/VISUAL_DIRECTION.md`](docs/VISUAL_DIRECTION.md) — the premium sci-fi visual language + implemented tokens and cards.
- [`docs/M1_VISUAL_ACCEPTANCE.md`](docs/M1_VISUAL_ACCEPTANCE.md) — M1 verification, screenshots, deferrals.
- [`docs/M2_RESOURCE_DASHBOARD.md`](docs/M2_RESOURCE_DASHBOARD.md) — M2 verification, parity evidence, screenshots.
- [`docs/M3_TECHNOLOGY_CONTRACT.md`](docs/M3_TECHNOLOGY_CONTRACT.md) — the canonical research boundary, the purchase path, legacy inconsistencies found.
- [`docs/M3_TECHNOLOGY_GRAPH.md`](docs/M3_TECHNOLOGY_GRAPH.md) — graph derivation, visibility policy, layout algorithm, performance, accessibility.
- [`docs/M3_VISUAL_ACCEPTANCE.md`](docs/M3_VISUAL_ACCEPTANCE.md) — M3 verification, purchase parity, screenshots, critical assessment.
- [`docs/M4_CELESTIAL_OPERATIONS.md`](docs/M4_CELESTIAL_OPERATIONS.md) — M4 celestial model, action delegation, duplicate-ID audit, performance, screenshots.
- [`docs/M5A_PERFORMANCE_FOUNDATION.md`](docs/M5A_PERFORMANCE_FOUNDATION.md) — the formatter bottleneck, cache design and dependency proof, parity corpus, measured results.
- [`docs/PERFORMANCE_BUDGETS.md`](docs/PERFORMANCE_BUDGETS.md) — the budgets the modern UI is held to, and how they are measured.
- [`docs/PRIVACY.md`](docs/PRIVACY.md) — tracking removed and remaining network calls.
- [`docs/RISK_REGISTER.md`](docs/RISK_REGISTER.md) — risks identified during forensics.

### UI modes

- **Default (modern):** the command-center shell with the resource dashboard and
  the technology map — open the game normally.
- **Legacy resource list:** append `?resources=legacy` to keep the modern shell
  but restore the original resource table.
- **Legacy research table:** append `?research=legacy` to keep the modern shell
  but restore the original `#techTable` research interface.
- **Legacy celestial panes:** append `?space=legacy` to keep the modern shell but
  restore the inherited solar-system navigation column.
- **Legacy fallback:** append `?ui=legacy` to render the original Bootstrap
  presentation wholesale (this also restores both legacy tables).

All four switches are diagnostic escape hatches: they are read from the URL
each load and are **never** written to your save. The only preference the modern
UI stores are presentation preferences under the `sc.ui.*` namespace
(`resourceDensity`, `motion`, `announcements`, `audioEnabled`, `audioVolume`),
none of which is written until you change it, and all of which can be removed
without touching your save. The technology map and celestial command center
store nothing at all.

## Requirements

- **Node.js ≥ 18** (developed and verified on Node 22). See [`.nvmrc`](.nvmrc).
- No third-party runtime or build dependencies — the toolchain uses only the
  Node standard library, so `npm install` installs nothing but a lockfile.

## Install

```bash
npm install
```

## Run the game locally

The game is a static site that must be served over HTTP (so relative asset
paths and `localStorage` behave like production):

```bash
npm start            # serves http://localhost:8080/
PORT=8123 npm start  # choose a different port
```

Then open the printed URL in a browser.

## Build the bundle

The legacy Grunt pipeline was broken and unused (see the roadmap/architecture
docs). `npm run build` reproduces its *intent* deterministically — it derives
the application-script order directly from `index.html` and concatenates the
files into `SpaceCompany.min.js`:

```bash
npm run build
```

The output is byte-for-byte reproducible (the build prints a `sha256`). The
bundle is a **generated artifact**: it is git-ignored and is intentionally
**not** wired into `index.html` in M0 (the game still loads individual scripts).

## Test & lint

```bash
npm test     # Node's built-in test runner: characterization + save-safety tests
npm run lint # static syntax check (node --check) over every first-party script
npm run verify   # lint + build + test in one go
```

The characterization tests (in [`test/`](test/)) lock down the observable legacy
behaviour — number formatting, initial state, cost/affordability, the tick
engine, offline-gain boundaries, reset guards, and the full save/serialize/load
and import/export round-trip — so future refactors can't silently change them.

## Branch strategy

| Branch | Purpose |
| --- | --- |
| `gh-pages` | The currently **deployable legacy branch** (GitHub Pages). Left untouched. |
| `dev` | Inherited integration branch. |
| `feature/m0-modernization-foundation` | M0 — tooling, characterization tests, docs. |
| `feature/m1-premium-command-center-shell` | M1 — design system and command-center shell. |
| `feature/m2-resource-operations-dashboard` | This milestone's work branch. |

Modernization work happens on `feature/*` branches and is **not** merged into
`dev` or `gh-pages` without review. `gh-pages` remains the source of truth for
the live legacy game until a later milestone explicitly migrates deployment.

---

# Overview:
Space Company is a science-fiction incremental game where you start from humble beginnings on Earth, working your way up to travelling between star systems and building Dyson Spheres and pretty much colonising the entire galaxy(ies?)

Development has stopped, however, several projects have been created based on this you may wish to try.

# Derived projects from members in the community
- https://play.google.com/store/apps/details?id=com.freddecgames.ngsc Mobile Port by Freddec
- https://ngspacecompany.freddecgames.com/ V1 Web uptaken by Freddec
- https://ngsc.freddecgames.com/ V2 Web Freddec
- https://github.com/migue1s/SpaceCompanyNative Mobile Port by migue1s
- https://github.com/SpiderGamin/SpaceCompany-Desktop Desktop Application by SpiderGamin
- 
# Former Plans for the Future
- Check https://www.reddit.com/r/SpaceCompany/wiki/futureplans
- When loading game, the tab you left on is the tab you now start on
- Random Events
- [Change UI from bootstrap to my own]


# RoadMap

v1.0 The Overlord Update
https://www.reddit.com/r/SpaceCompany/wiki/futureplans#wiki_v0.6

- Adding Lore onto every Building and an introduction to your Space Company
- Rebalance all costs to not use as much Lunarite/Gems
- Loading screen flavour text changes as you progress
- Machine Overview Tab

v0.5.1 in progress

- (Mass to Energy Conversion)
- Buy X buttons
- Buy Max/Custom Buttons
- Change Letter Formatting To Start At 100K
- Rebalance Science
- Change Icons (white circle with icon inside)

# Changelog:

### v0.5.1 (includes all V0.5.0.X)
##### Features

- Storage Upgrade Discounts
- T5 batteries
- Fixed Huge Memory Leak
- Multiple Spheres
- Auto Emc
- Redid Rebirth
- Respec
- Meteorite Tier 3 and 4
- Live counter showing how much DM you will get from each section
- Fixed Energy Efficiency 25/50 max bug
- Heavily Expanded Interstellar Star List

##### Small Changes

- Made Alpha Centauri distance clear
- You cannot rebirth without a sphere
- Fixed higher antimatter storages not saving
- Reduced framerate from 100fps to 10fps
- Build 250 Segments and Dyson Sphere Button
- Balanced Ice T5 to have cost just below storage level rather than above it
- AutoEmc keeps a 10K bank of plasma to avoid meteorite production depletion due to 0 plasma stored
- Buffed Capital Ship\' power and defense
- Reduced Oil T3 energy cost
- Made Science and Resource Efficiency multiplicative with dark matter boost
- Forces Swarms to use ShortName formatting for accuracy with DM scaling
- Renamed some generic stars (thanks /u/Misacek01)
- Inverted the loading screen colours

##### Bug Fixed

- Fixed Comms wonder not showing interstellar tab
- Fixed TARDIS production being incorrect
- Fixed Storage Discount not working
- Fixed Storage Upgrade overwriting old storages if greater than 6400
- Fixed Tier 1 Rocket not showing red costs when inadequate
- Fixed Subsequent Rebirths
- Fixed Plasma not showing Gain 20
- Fixed Wonders showing up as activated after rebirth
- Fixed Solar System Showing planets before exploring requirements
- Fixed AutoEmc using energy for meteorite
- Fixed Fusion Reactor not using enough Hydrogen
- Fixed Invasion Chance being NaN when reputation is above 60
- Fixed Absorb not working
- Fixed Antimatter not being affected by DM Boost
- Fixed several UI issues after rebirth with the interstellar tab
- Fixed Interstellar notifications of lost ships without actual losses

### v0.5.0 The Interstellar Update
##### Features

- Offline Production
- Screen Notifications Graphics Option
- Kongregate Leaderboard
- 7 New Themes
- Random Loading Messages (100)
- Communication Wonder
- Rocket Wonder
- Antimatter Wonder
- Portal Room
- Stargate
- Plasma Storage Units
- Buying Multiple Dyson Parts
- Option to Hide Gain Buttons
- Achievements for Rings and Swarms
- Time Until Storage Full Display
- Max Emc Conversion Button
- Tier 3 Batteries
- Tier 4 Labs
- Tier 4 Batteries
- Custom Company Name
- Copy Export to Clipboard
- Update Log On Page Load
- Battery Efficiency Research
- Coloured Destroy Button Option
- Hydrazine Catalyst - T3 Rocket Fuel
- Interstellar Radar Scanner
- Achievement Ranks
- Renamed Space Metal as Lunarite
- The Wonder Tab hides itself when completed (makes space for more tabs)
- Rebuilt Achievement Tooltips
- Dark Matter
- Hide Completed Tabs Button
- Added Astronomical Breakthrough
- Seperate Option for Autosave Notifications

##### Small Changes

- Individual buttons to turn off Plasma and Meteorite Machines
- Turn-off switch for all energy producers/consumers
- Alternative scientific formatting
- Made it clear that Dyson Sections Costs reset when used
- 'Off' Option For Autosaving
- Science Forced 1 Decimal Until 100
- Cleared Up Misconceptions With 'NB:' Notes
- Uranium + Plasma Achievements
- Changed Some Descriptions
- Made Red Bold Costs Also Underlined
- Allow decreasing EMC amount with right click
- Changed Version Number System to include 4th digit
- Made EMC Max By Default
- Import Checks For Empty Field To Refuse Load
- Fixed Typos
- Fixed Interstellar Backwards Compatibility
- Changed Dyson Parts Buying To Buy Parts And Build Dyson
- Destroy Alcubierre Drive Button
- Nerfed Energy Efficiency to be 1000x cheaper, but only go up to 25%
- Changed Multibuy researches to show current level instead of next level
- Buffed Battery Efficiency to 200 levels instead of 50
- Nerfed Rocket Fuel Research Costs
- Buffed Hydrazine Production
- Achievement Number Formatting
- Rocket Fuel Machine Achievements
- Refactored EMC (behind the scenes)
- Optimised Saving and Loading
- Time until storage full now shows until empty if negative gain
- Reset achievements
- Standardised gainResource() function
- Achievement Stars are worth their position

##### Bug Fixes

- Fixed Bug With Solar System Sidebar
- Fixed Unlocked Tabs Statistic Bug
- Fixed Rocket Launching Costs Not Being Red
- Fixed Antimatter Tab Highlighting Sticking
- Fixed Typos
- Fixed Rocket Wonder Not Working
- Fixed Solar Panel Showing Incorrect Output
- Fixed Interstellar Tab Not Loading Values
- Fixed Collapse Outer Solar System SideBarTab Visual Bug
- Fixed Portal Room Helium Bug
- Fixed Whitespace Bug on Plasma Tab
- Fixed Infinite Meteorite Bug
- Fixed Stargate Not Deducting Resources
- Fixed Dyson Sections Cost Bug
- Fixed Plasma EMC Display Bug
- Fixed Stargate Red Costs Bug
- Fixed T3 Battery Lunarite Cost Not Saving
- Fixed UI Bug With Certain Themes
- Fixed Rocket Building Not Saving
- Fixed Antimatter Decimals Not Being Uniform
- Fixed Batteries Not Unlocking Without Refresh
- Fixed Interstellar Backwards Compatibility
- Fixed Browser Compatibility Problem
- Fixed Antimatter Not Turning Green On Full Storage
- Fixed Hydrazine Research Cost Not Turning Red
- Fixed Antimatter Going Above 100k
- Fixed Buying Multiple Solar System Rockets
- Fixed T4 Science unlocking only after refresh
- Fixed Hydrazine Not Getting Resource Efficiency
- Fixed Exponential Notation UI
- Fixed Typos
- Fixed Stargaze not showing up until refresh
- Fixed Silicon Achievement not existing
- Fixed Logo not animating

### v0.4.4
##### Features
- Dyson Ring
- Infinite Research
- Overhauled Behind The Scenes Stuff - Made everything data driven
- Notifications
- Game Now Works in an Inactive Tab
- Tier 2 Batteries
- Tier 2 Rocket Fuel
- Sidebar Nav Compression
- Options For Number Format

##### Small Changes
- Reworked EMC UI
- Energy Conversion Changes
- Reworded Chemical Plant Description
- Reprogrammed Charcoal Production
- Changed Laboratory Names and Descriptions
- Destruction of Rocket Fuel Machines
- Changed Order of Achievements
- Prevented Building Multiple Dyson Spheres
- Made All Numbers >1000 4 Digits Long
- Changed Ice T4 to use Wood
- Days on Time Stats
- Changed Links in FAQ to open in new tab
- Notifications for Achievements and Autosaving and for when Storage is full
- Reduced Info Overload on Getting Started Tab
- Added LICENCE.txt

##### Bug Fixes
- Fixed Oil Rig Costs
- Fixed Helium T4 Red Costs
- Fixed Dyson Section Reset Costs
- Fixed Cyborg UI Bug
- Fixed Dyson Costs Resetting
- Fixed Exploring Wonder Showing '!' on Resources Tab
- Fixed Importing Without Data Wiping Saves
- Fixed Highlighting Bugs
- Fixed Charcoal Burners Not Using Wood
- Fixed Oxidisation UI Bug
- Fixed Session Time Not Resetting
- Fixed Meteorite Filling Storage Bug
- Fixed Typos

### v0.4.3
- Completed Achievements
- Changed Achievements System
- 100,000x Conversion Option

##### Bug Fixes
- Fixed Destruction of Machines Research Red Cost Bug
- Fixed Meteorite Wonder Cost Bug
- Fixed Titanium T4 Energy Costs
- Fixed Dyson Costs Jumping to 3rd from 1st
- Fixed Metal Icon not being transparent

v0.4.2
- Option for bold text on red costs
- Nerfed Battery Costs

v0.4.1
- Bug Fix with Sphere to Swarm Conversion

v0.4.0 The Hot and Cold Update
- Achievements
- Research from Sol Center
- Meteorite
- Meteorite Tier of resource machines (4th Tier)
- Dyson Sections
- Dyson Swarm
- Dyson Sphere
- Per Second Display on Science
- Ability to Destroy Machines
- Increased Width of Resources List to reduce vertical scrolling
- Tiered Laboratories
- Batteries
- Changed Silicon from an inner planet resource to an earth resource
- Altered Cyborg Theme
- Stats for Time Keeping
- Merged "More" and "Settings" Tabs
- Tier 2 for Plasma and Meteorite

v0.3.5
- Number Formatting for large numbers
- Made Selected Tab Blue

v0.3.4
- New Solar Theme
- New United Theme

v0.3.3
- Collapsibility for the Solar System Tab
- Notifications on tabs when there is something new in them

v0.3.2
- Made per second text red when negative
- Dark Cyborg Theme

v0.3.1
- Rebalanced Fusion Reactor and Magmatic Dynamo
- Rebalanced Tier 3 Machines For Some Resources

v0.3.0 The Tech Update [Pushed to Beta]
- Sol Scientific Center
- Computerized Tier of resource machines
- Exploration of the outer planets
- Energy-Mass Conversion
- Hydrogen and Helium
- Ice
- Plasma
- Tech Wonder
- Fusion Reactor
- More Statistics
- Loading Screen
- Fixed Typos
- Fixed Wood/Charcoal Bugs

v0.2.2
- If you do not have enough resources for something, the number will be red
- You can collapse resources into earth and space categories
- Buffed Charcoal Engines and Solar Panels to stop people falling into a 'negative energy hole'
- Nuclear & Magmatic Power
- Nerfed Methane Station

v0.2.1
- Fixed Bugs

v0.2.0 The Wondrous Update [Released To The Public]
- Wonder Tab
- two different wonders - Precious Wonder & Energetic Wonder
- ability to upgrade Wonders
- Uranium & Lava
- Widened resources navigation so that storage could be displayed on one line
- Solar Panel and Charcoal Engine Upgrades
- Statistics
- Settings
- Import and Export

v0.1.2
- Auto-saving
- Finished Beginner's Guide

v0.1.1
- Fixed bugs from the 0.1.0 update

v0.1.0 The Space Update
- Space travel to The Moon, Venus, Mars and the Asteroid Belt
- New resources: Lunarite, Methane Gas, Titanium, Silver, Gold and Silicon
- Methane-based power
- Commas to all numbers more than 1000
- Fixed negative energy
- Saving
- Donations through paypal
- Updated Beginner's Guide

v0.0.7
- Resource Technology Upgrade to double resource machines output
- Nerfed Science
- Changed the per second display to be zero if the storage is full

v0.0.6
- Icons for the rest of the resources
- Help / FAQ Tab
- Beginner Guide, FAQ and Credits
- Made resource numbers scroll up instead of jumping to the current value

v0.0.5
- Space Tab
- Chemical plants that produce rocket fuel
- Rocket that uses rocket fuel to launch into space

v0.0.4 
- Balanced Game More (to not take 2 minutes to complete)
- Fixed Wood/sec bug
- Made all resource gatherers increase in cost as you buy them
- Fixed Resource Machines not using energy
- Changed storage upgrades to cost metal as well

v0.0.3
- Removed cap on energy
- Solar Panels
- Resource Gathering Machine were added that use a constant supply of energy
- Oil was made a component in building machines
- Fixed storage costs bug

v0.0.2
- Merged Crafting and Resources tabs
- Reworked Science Techs
- Balanced Science Tab
- Removed the ability for science to be clicked - it can only be gained slowly
- Energy and Charcoal engines
- Charcoal
- Removed Gas

v0.0.1
- Basic mechanics and basic Bootstrap theme implemented
- Initial release
