// Single base plan, replacing the old Starter/Pro/Enterprise tiers (see
// scripts/collapseToBasePlan.ts, which performed that one-off migration). The org's own base
// seat is a recurring subscription ($10/mo or the annual price below); every additional user
// beyond that is a separate one-time $10 purchase tracked on Organization.purchasedUserSeats,
// completely independent of this plan - see SEAT_PRICE_SAR and billing.service.ts
// createSeatCheckout(). Branch-count limiting is intentionally left unlimited on this plan (was
// previously used to differentiate tiers; with only one tier there's nothing to gate on) - see
// businessLocation.service.ts, which is otherwise untouched by this change.
//
// PRICES BELOW ARE PLACEHOLDERS - replace them with real figures before taking real money.

export interface PlanDef {
  code: string;
  nameEn: string;
  nameAr: string;
  priceMonthly: number;
  priceAnnual: number;
  /** null = not offered as a one-time lifetime purchase. */
  priceLifetime: number | null;
  /** null = unlimited. */
  maxBranches: number | null;
  maxUsers: number | null;
}

export const BASE_PLAN_CODE = "base";

export const PLAN_DEFS: PlanDef[] = [
  {
    code: BASE_PLAN_CODE,
    nameEn: "Standard",
    nameAr: "قياسي",
    priceMonthly: 10,
    priceAnnual: 100,
    priceLifetime: null,
    maxBranches: null,
    maxUsers: null, // seat counting no longer flows through Plan.maxUsers - see Organization.purchasedUserSeats
  },
];

/** Price of one additional one-time user seat license, in SAR. */
export const SEAT_PRICE_SAR = 10;

/** The plan a brand-new organization's Subscription is linked to once its email is verified
 * (see auth.service.ts verifyEmailCode(), which is what actually creates the Subscription row -
 * registration itself no longer does). */
export const TRIAL_PLAN_CODE = BASE_PLAN_CODE;
export const TRIAL_DAYS = 7;
