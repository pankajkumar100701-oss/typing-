import { useEffect, useState, useSyncExternalStore } from "react";
import { CarLook, carSrc, paintCar, readySrc, subscribePaint } from "@/lib/cars";

/** A car photo facing the finish, in the chosen paint. All share one 480×180 frame, tyres on the bottom edge. */
export default function Car({ look, className = "" }: { look: CarLook; className?: string }) {
  const ready = useSyncExternalStore(
    subscribePaint,
    () => readySrc(look),
    () => carSrc(look.id),
  );
  // While a new colour is being painted, keep showing the last picture of this car instead of
  // flashing the photo's own colour.
  const [shown, setShown] = useState<{ id: string; src: string } | null>(null);
  if (ready && (shown?.src !== ready || shown.id !== look.id)) setShown({ id: look.id, src: ready });
  const src = ready ?? (shown?.id === look.id ? shown.src : carSrc(look.id));

  const { id, p } = look;
  useEffect(() => {
    void paintCar({ id, p });
  }, [id, p]);
  // eslint-disable-next-line @next/next/no-img-element -- painted cars are blob: URLs made in the browser
  return <img className={`car ${className}`} src={src} alt="" draggable={false} width={480} height={180} />;
}
