import { createContext, useContext } from "react";

import type { BillingInfo } from "@anlg/supabase";

export type BillingAccess = BillingInfo & {
  isReady: boolean;
  canStartTrial: { data: boolean; isPending: boolean };
  upgradeToPro: () => void;
  isUpgradingToPro: boolean;
};

export const BillingContext = createContext<BillingAccess | null>(null);

export function useBillingAccess() {
  const context = useContext(BillingContext);

  if (!context) {
    throw new Error("useBillingAccess must be used within BillingProvider");
  }

  // Local fork: unlock local Pro-gated features without a subscription.
  // `isReady` is forced because the claims query is disabled when
  // unauthenticated (`enabled: false`), so it would stay pending forever.
  // Guard by `MODE !== "test"` so vitest still sees real billing values.
  if (import.meta.env.MODE !== "test") {
    return {
      ...context,
      isPro: true,
      isPaid: true,
      isLite: true,
      isReady: true,
      plan: "pro" as const,
    };
  }

  return context;
}
