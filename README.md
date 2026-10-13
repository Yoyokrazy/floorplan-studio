# Floorplan Studio

Draw house floor plans in the browser and export them as **PNG, JPEG, or PDF**. It's a static site with no build step and no dependencies, and it runs on GitHub Pages.

**Live app:** https://yoyokrazy.github.io/floorplan-studio/

## Features

- **Walls**: Click to add corners, or type an exact length while drawing (`12'6"`, `12.5'`, `150"`, `3.5m`) and press Enter. Angles snap to 15°; hold Shift to draw at any angle.
- **Rooms**: Drag a rectangle, or type a size such as `12x14` and press Enter.
- **Doors**: Single swing, double, sliding/patio, pocket, bi-fold, cased opening, and garage. Doors snap to walls, and you can flip the hinge or swing side.
- **Windows**: Standard/double-hung, sliding, casement, and fixed.
- **Stairs**: Treads, an UP/DN travel arrow, and an optional break line at the cut plane.
- **Fixtures and furniture**: Toilet, sinks, tub, shower, range, refrigerator, dishwasher, counters, washer/dryer, water heater, bed, sofa, table, desk, and fireplace.
- **Labels and dimensions**: Room labels, architectural dimension lines with tick marks, and automatic wall-length labels.
- **Units**: Feet and inches (to 1/8") or metric.
- **Export**: PNG and JPEG at several resolutions. PDF supports Letter, Legal, Tabloid, A4, and A3 pages at true scale (1/4" = 1'-0", 1/8" = 1'-0", 1:50, 1:100) or scaled to fit. Exports can include a title, scale bar, and north arrow.
- **Saving**: Your plan autosaves to the browser. You can also save and open plans as `.json` files. Undo/redo is available.

## Drawing conventions

The symbols follow common residential plan conventions:

- Walls are drawn as solid poché (or outlined). Exterior walls default to 6" and interior walls to 4½".
- Door swings show the leaf open at 90° with a quarter-circle arc.
- Windows show the wall faces plus the glazing lines inside the opening.
- Stairs show their treads, with an arrow from the starting dot pointing in the direction of travel.
- Dimensions use extension lines and 45° tick marks.

## Shortcuts

| Key | Action |
| --- | --- |
| V W R D N S F T M | Select, Wall, Room, Door, Window, Stairs, Fixture, Label, Dimension |
| Esc / Enter / right-click | Finish a wall chain or cancel |
| Shift | Free angle, no snapping |
| Q / E | Rotate 90°, or flip a door's hinge or swing |
| Delete | Delete selection |
| Arrow keys | Nudge |
| ⌘/Ctrl + Z, ⇧⌘/Ctrl + Z | Undo, redo |
| ⌘/Ctrl + D | Duplicate |
| Space + drag, wheel/pinch, 0 | Pan, zoom, fit |

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```
