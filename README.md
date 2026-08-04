# Phonedry

A lightweight, canvas-free character sheet client for [Foundry VTT](https://foundryvtt.com) on phones and tablets.

When a player connects from a mobile device, Phonedry skips the tabletop client entirely and loads a single full-screen D&D 5e character sheet. You can roll, cast, manage inventory and track resources — you just can't see the battle map, which is the point.

## Why it works this way

Existing mobile modules keep the full Foundry client and layer a touch-friendly UI on top. That means PIXI, the scene canvas, and every texture in the active scene still load, and iOS caps memory per browser tab. Heavy worlds reload constantly on iPhones and iPads because the tab runs out of memory before the UI is even usable.

Phonedry takes the other path. It forces Foundry's built-in `noCanvas` mode for mobile clients, so the canvas never initialises: no PIXI, no scene textures, no tile or token sprites. What remains is the document layer — actors, items, spells, chat, dice — which is all a character sheet actually needs.

The trade-off is real and deliberate. **Phonedry is not a way to play on the map from your phone.** It is a way to play *your character* from your phone while the map lives on the table's main screen. If you want the map, use a laptop.

## Requirements

- Foundry VTT v13 or v14
- The `dnd5e` system, version 5.0.0 or later

Supported on iPhone and iPad (Safari), and on Android phones and tablets
(Chrome and Samsung Internet). Phonedry decides whether to load from the
device's input capabilities rather than its user-agent string, so it does not
need a list of device names to keep up to date.

## Status

Early development. Not yet released.

## Licence

MIT — see [LICENSE](LICENSE).

Phonedry is an independent module and is not affiliated with or endorsed by Foundry Gaming LLC or Wizards of the Coast.
