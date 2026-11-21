import {
  Cartesian2,
  Cartesian3,
  Color,
  CustomDataSource,
  DistanceDisplayCondition,
  Entity,
  HeightReference,
  LabelStyle,
  NearFarScalar,
  VerticalOrigin,
  type Viewer,
} from "cesium";
import type { Network } from "../networks/thermal";
import { FLEET, type FleetHouse } from "../fleet/fleet";

const NETWORK_COLOUR = Color.fromCssColorString("#e5484d");
const SERVER_COLOUR = Color.fromCssColorString("#ffb347");

/** SFOE's thermal networks as red points with their names, clickable. */
export function networkLayer(viewer: Viewer) {
  const source = new CustomDataSource("thermal-networks");
  void viewer.dataSources.add(source);
  const byEntity = new Map<Entity, Network>();
  return {
    show(networks: readonly Network[]): void {
      source.entities.removeAll();
      byEntity.clear();
      for (const n of networks) {
        const entity = source.entities.add({
          position: Cartesian3.fromDegrees(n.lon, n.lat),
          point: {
            pixelSize: 12,
            color: NETWORK_COLOUR,
            outlineColor: Color.WHITE,
            outlineWidth: 2,
            heightReference: HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: n.name,
            font: "13px sans-serif",
            fillColor: Color.WHITE,
            outlineColor: Color.BLACK,
            outlineWidth: 3,
            style: LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: VerticalOrigin.BOTTOM,
            pixelOffset: new Cartesian2(0, -12),
            heightReference: HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            distanceDisplayCondition: new DistanceDisplayCondition(0, 2500),
          },
        });
        byEntity.set(entity, n);
      }
      source.show = true;
    },
    hide(): void {
      source.show = false;
    },
    /** The network behind a picked object, if it is one of ours. */
    networkOf(picked: unknown): Network | null {
      const id = (picked as { id?: unknown } | undefined)?.id;
      return id instanceof Entity ? (byEntity.get(id) ?? null) : null;
    },
  };
}

/**
 * Our idea, not data: the scheduler's synthetic fleet, each house drawn as a warm dot on the real
 * residential building it was placed on (see fleet/fleet.ts). Bigger dots, more servers.
 * The legend labels it as an illustration.
 */
export function homeServerLayer(viewer: Viewer) {
  const source = new CustomDataSource("kachel-home-servers");
  source.show = false;
  void viewer.dataSources.add(source);
  const byEntity = new Map<Entity, FleetHouse>();
  for (const house of FLEET) {
    const entity = source.entities.add({
      position: Cartesian3.fromDegrees(house.lon, house.lat, 18),
      point: {
        pixelSize: 5 + house.servers,
        color: SERVER_COLOUR.withAlpha(0.95),
        outlineColor: SERVER_COLOUR.withAlpha(0.35),
        outlineWidth: 5,
        heightReference: HeightReference.RELATIVE_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new NearFarScalar(500, 1.3, 30_000, 0.4),
      },
    });
    byEntity.set(entity, house);
  }
  return {
    setShown(on: boolean): void {
      source.show = on;
    },
    /** The fleet house behind a picked object, if it is one of ours and the layer is on. */
    houseOf(picked: unknown): FleetHouse | null {
      if (!source.show) return null;
      const id = (picked as { id?: unknown } | undefined)?.id;
      return id instanceof Entity ? (byEntity.get(id) ?? null) : null;
    },
  };
}
