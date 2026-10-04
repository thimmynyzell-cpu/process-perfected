export type PlanId = "free" | "team" | "business";

export type PlanConfig = {
  id: PlanId;
  maxTemplates: number | null;
  maxSeats: number | null;
  pricePerSeat: number;
  features: string[];
};

export const PLANS: Record<PlanId, PlanConfig> = {
  free: {
    id: "free",
    maxTemplates: 3,
    maxSeats: 1,
    pricePerSeat: 0,
    features: ["templates", "runs", "history"],
  },
  team: {
    id: "team",
    maxTemplates: null,
    maxSeats: null,
    pricePerSeat: 99,
    features: ["templates", "runs", "history", "export"],
  },
  business: {
    id: "business",
    maxTemplates: null,
    maxSeats: null,
    pricePerSeat: 179,
    features: ["templates", "runs", "history", "export", "audit", "sso", "api"],
  },
};

export function planHas(plan: PlanId, feature: string) {
  return PLANS[plan].features.includes(feature);
}

export function seatLimit(plan: PlanId, seats: number) {
  const max = PLANS[plan].maxSeats;
  return max === null ? seats : Math.min(max, Math.max(seats, max));
}
