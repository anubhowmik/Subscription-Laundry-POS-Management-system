// There is exactly ONE product: the laundry management system. A company does not pick a tier -
// it picks how it wants to PAY for that one product: monthly, annually, or once for lifetime.
//
// The Plan table is kept (rather than hard-coding prices) so pricing can be changed without a
// code deploy, and so tiers remain possible later without a schema migration. Today it holds a
// single row.
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
  /** null = unlimited. The single plan has no branch/user caps. */
  maxBranches: number | null;
  maxUsers: number | null;
}

export const STANDARD_PLAN_CODE = "standard";

export const PLAN_DEFS: PlanDef[] = [
  {
    code: STANDARD_PLAN_CODE,
    nameEn: "Laundry Management System",
    nameAr: "نظام إدارة المغسلة",
    priceMonthly: 299,
    priceAnnual: 2990,
    priceLifetime: 5990,
    maxBranches: null,
    maxUsers: null,
  },
];

/** The plan a brand-new organization is put on for its free trial. */
export const TRIAL_PLAN_CODE = STANDARD_PLAN_CODE;
export const TRIAL_DAYS = 14;
