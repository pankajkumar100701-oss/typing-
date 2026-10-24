import type { Metadata } from "next";
import RaceApp from "@/components/RaceApp";

export const metadata: Metadata = {
  title: "Car Race — TypeFast",
  description: "Race your friends in a typing car race. Make a link, share it and type the same paragraph together.",
};

export default function RacePage() {
  return <RaceApp />;
}
