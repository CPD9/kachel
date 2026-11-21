# Models

## plantroom.glb

The basement plant room from the pitch film: server rack, pump, plate heat exchanger, tank and
backup heater. Exported by `scripts/video/export_glb.py` from `scripts/video/assets/plantroom.blend`,
Draco-compressed (2.9 MB). The map's **Inside** view shows it with three.js.

## fhnw-campus.glb

FHNW Campus Dreispitz, Dornacherstrasse 394, Basel (EGID 243058419), as our own block model,
123 KB. The map shows it because the building opened in August 2026, after swisstopo's 3D survey.

- **Ours, not surveyed.** Made by `scripts/video/export_campus_glb.py` from a copy of the film's
  campus scene (`dreispitz_campus.blend`): its storey levels, parapet, roof panels and colours.
  Nothing else from that scene: no basement, interior, ground or surrounding city.
- **From the GWR:** 6 storeys, 3,735 m² footprint, built 2026.
- **Assumed:** the shape (one plain block), its size and its orientation. The film's block is
  72 × 46 m and does not fit the building site on the map, so this one is 134.2 × 27.83 m
  (3,735 m²), with its middle and long side on the outline mapped in OpenStreetMap
  (way 1536280767, © OpenStreetMap contributors, ODbL), which matches the building site on
  SWISSIMAGE. Storeys 3.9 m, roof at 23.4 m, parapet 24.5 m.
- **Windows:** a regular bay pattern; the emissive texture lights 55% of them. An illustration.
- Metres, +Y up (glTF), origin in the middle of the footprint at ground level; +X along the long
  side (east before the map turns it 7.6° north), the roof panels facing south.
  A plinth reaches 3 m below ground so sloping ground shows no gap.
