# Map layers for the pitch film

Federal open geodata from api3.geo.admin.ch (`identify`, LV95, EPSG:2056), fetched on
21 Nov 2026. Only the geometry and the numeric fields the shots draw are kept here; names,
operators and contacts are left out. Credits on screen: "© swisstopo" and "Source: SFOE".

| File                                 | Layer                                                                                                                             | Credit                          |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `switzerland_border_lv95.geojson`    | `ch.swisstopo.swissboundaries3d-land-flaeche.fill`, Switzerland                                                                   | © swisstopo                     |
| `bern_municipality_lv95.geojson`     | `ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill`, Bern, 2026                                                                | © swisstopo                     |
| `thermische-netze_bern_lv95.geojson` | `ch.bfe.thermische-netze`, envelope 2595000,1194000,2606000,1205000, one point per network                                        | Source: SFOE                    |
| `heat-demand-ha_bern_lv95.geojson`   | `ch.bfe.fernwaerme-nachfrage_wohn_dienstleistungsgebaeude`, 1 km tiles over the same envelope                                     | Source: SFOE (data status 2013) |
| `power-lines_bern_lv95.geojson`      | `ch.bfe.elektrische-anlagen_ueber_36`, lines above 36 kV, same envelope; 202 features, may be cut short at the 200-per-call limit | Source: SFOE                    |

The Basel layers are read from the heat-atlas project (`~/Projects/heat-atlas/research/data`),
read-only.
