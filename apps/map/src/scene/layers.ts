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
import { ORIGIN } from "../places";

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

/** A small, fixed pseudo-random scatter: the same picture every time. */
function scatter(count: number, radiusDeg: number): Array<[number, number]> {
  let seed = 7;
  const next = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: count }, () => {
    const r = radiusDeg * Math.sqrt(next());
    const a = 2 * Math.PI * next();
    return [
      ORIGIN.lon + (r * Math.cos(a)) / Math.cos((ORIGIN.lat * Math.PI) / 180),
      ORIGIN.lat + r * Math.sin(a),
    ];
  });
}

/**
 * Our idea, not data: Kachel servers in many homes, each a small heat source, drawn as warm
 * dots scattered over Basel. The legend labels it as an illustration.
 */
export function homeServerLayer(viewer: Viewer) {
  const source = new CustomDataSource("kachel-home-servers");
  source.show = false;
  void viewer.dataSources.add(source);
  for (const [lon, lat] of scatter(160, 0.03)) {
    source.entities.add({
      position: Cartesian3.fromDegrees(lon, lat),
      point: {
        pixelSize: 7,
        color: SERVER_COLOUR.withAlpha(0.9),
        outlineColor: SERVER_COLOUR.withAlpha(0.35),
        outlineWidth: 5,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new NearFarScalar(500, 1.4, 20_000, 0.5),
      },
    });
  }
  return {
    setShown(on: boolean): void {
      source.show = on;
    },
  };
}
