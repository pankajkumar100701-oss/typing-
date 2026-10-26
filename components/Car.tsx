import { useEffect, useSyncExternalStore } from "react";
import { CarLook, carSrc, paintCar, paintedSrc, subscribePaint } from "@/lib/cars";

/** A car photo facing the finish, in the chosen paint. All share one 480×180 frame, tyres on the bottom edge. */
export default function Car({ look, className = "" }: { look: CarLook; className?: string }) {
  const src = useSyncExternalStore(
    subscribePaint,
    () => paintedSrc(look),
    () => carSrc(look.m),
  );
  const { m, c } = look;
  useEffect(() => {
    void paintCar({ m, c });
  }, [m, c]);
  // eslint-disable-next-line @next/next/no-img-element -- painted cars are blob: URLs made in the browser
  return <img className={`car ${className}`} src={src} alt="" draggable={false} width={480} height={180} />;
}
