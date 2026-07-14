import flights from "../../data/flights.json";

export type Flight = (typeof flights)[number];

export interface FlightQuery {
  flightNo?: string;
  city?: string;
  type?: "departure" | "arrival";
}

// Stands in for a real FIDS API. Same interface a live integration would expose.
export function searchFlights({ flightNo, city, type }: FlightQuery): Flight[] {
  let results = flights as Flight[];

  if (flightNo) {
    const q = flightNo.replace(/\s+/g, "").toUpperCase();
    results = results.filter((f) => f.flightNo.toUpperCase() === q);
  }
  if (city) {
    const q = city.toLowerCase();
    results = results.filter((f) => f.city.toLowerCase().includes(q));
  }
  if (type) {
    results = results.filter((f) => f.type === type);
  }

  return results.slice(0, 5);
}
