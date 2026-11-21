import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef } from "react";

/** One full turn every this many seconds. */
const SECONDS_PER_REVOLUTION = 120;
/** Above this zoom the globe stops spinning. */
const MAX_SPIN_ZOOM = 5;
/** Between this zoom and MAX_SPIN_ZOOM the spin slows down. */
const SLOW_SPIN_ZOOM = 3;

/** A dark Mapbox globe that slowly spins, pausing while the user drags it. */
export function Globe({ token }: { token: string }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (container.current === null) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: container.current,
      style: "mapbox://styles/mapbox/dark-v11",
      projection: "globe",
      zoom: 1.8,
      center: [8, 25],
    });

    let userInteracting = false;

    const spin = () => {
      const zoom = map.getZoom();
      if (userInteracting || zoom >= MAX_SPIN_ZOOM) return;
      let degreesPerSecond = 360 / SECONDS_PER_REVOLUTION;
      if (zoom > SLOW_SPIN_ZOOM) {
        degreesPerSecond *= (MAX_SPIN_ZOOM - zoom) / (MAX_SPIN_ZOOM - SLOW_SPIN_ZOOM);
      }
      const center = map.getCenter();
      center.lng -= degreesPerSecond;
      map.easeTo({ center, duration: 1000, easing: (n) => n });
    };

    const pause = () => {
      userInteracting = true;
    };
    const resume = () => {
      userInteracting = false;
      spin();
    };

    map.on("style.load", () => {
      map.setFog({
        color: "rgb(10, 20, 30)",
        "high-color": "rgb(20, 30, 50)",
        "horizon-blend": 0.1,
        "space-color": "rgb(5, 5, 12)",
        "star-intensity": 0.4,
      });
    });
    map.on("mousedown", pause);
    map.on("dragstart", pause);
    map.on("touchstart", pause);
    map.on("mouseup", resume);
    map.on("dragend", resume);
    map.on("touchend", resume);
    map.on("moveend", spin);
    map.on("load", spin);

    return () => map.remove();
  }, [token]);

  return <div ref={container} className="h-full w-full" />;
}
