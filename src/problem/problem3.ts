import React, { useMemo } from "react";

/**
 * ✅ ISSUE (original): WalletBalance type did NOT include `blockchain`, but code used `balance.blockchain`.
 * ✅ FIX: Add `blockchain` to the type (or stop using it in logic).
 */
interface WalletBalance {
  currency: string;
  amount: number;
  blockchain: string;
}

/**
 * ✅ ISSUE (original): There was a FormattedWalletBalance type, but the code rendered from `sortedBalances`
 * while expecting `.formatted` to exist (it didn't).
 * ✅ FIX: Build a clear pipeline that produces formatted balances, then render from that.
 */
interface FormattedWalletBalance extends WalletBalance {
  formatted: string;
  priority: number; // ✅ FIX: store computed priority so we don't recompute repeatedly in sort.
}

interface Props extends BoxProps {}

/**
 * ✅ ISSUE (original): `getPriority` was defined inside the component, so it was recreated on every render.
 * ✅ FIX: move it outside the component (cheaper & stable).
 */
const PRIORITY: Record<string, number> = {
  Osmosis: 100,
  Ethereum: 50,
  Arbitrum: 30,
  Zilliqa: 20,
  Neo: 20,
};

function getPriority(blockchain: string): number {
  // ✅ ISSUE (original): getPriority accepted `any`.
  // ✅ FIX: strongly type the input and provide a fallback.
  return PRIORITY[blockchain] ?? -99;
}

const WalletPage: React.FC<Props> = (props) => {
  const { children, ...rest } = props;

  const balances = useWalletBalances();
  const prices = usePrices();

  const displayBalances: FormattedWalletBalance[] = useMemo(() => {
    /**
     * ✅ ISSUE (original): useMemo depended on `[balances, prices]` even though the sort/filter
     * logic did not use `prices`. This causes extra sorting work whenever prices update.
     * ✅ FIX: this memo should only depend on `balances` (see dependency array below).
     *
     * ✅ ISSUE (original): filter used an undefined variable `lhsPriority` (bug),
     * and the logic kept `amount <= 0` (likely reversed).
     * ✅ FIX: compute `priority` correctly and keep only valid + positive balances.
     *
     * ✅ ISSUE (original): sort comparator did not return `0` for equal priorities
     * (returned `undefined`), causing unstable/non-deterministic sorting.
     * ✅ FIX: always return a number; add a deterministic tie-breaker.
     *
     * ✅ ISSUE (original): getPriority was recomputed many times inside sort comparator
     * (sort is O(n log n) comparisons).
     * ✅ FIX: compute priority once per item (decorate → sort → map).
     */
    return balances
      .map((b) => ({
        ...b,
        priority: getPriority(b.blockchain),
      }))
      .filter((b) => b.priority > -99 && b.amount > 0)
      .sort((a, b) => {
        // Higher priority first
        if (b.priority !== a.priority) return b.priority - a.priority;

        // ✅ FIX: deterministic tie-breaker for stable ordering
        return a.currency.localeCompare(b.currency);
      })
      .map((b) => ({
        ...b,
        /**
         * ✅ ISSUE (original): toFixed() default is 0 decimals, which is usually wrong for crypto.
         * ✅ FIX: make precision explicit (example: 2 dp). Adjust to your product requirements.
         */
        formatted: b.amount.toFixed(2),
      }));
  }, [balances]); // ✅ FIX: remove `prices` dependency here

  const rows = useMemo(() => {
    /**
     * ✅ ISSUE (original): code rendered from `sortedBalances` but typed items as `FormattedWalletBalance`
     * and read `balance.formatted` which didn't exist.
     * ✅ FIX: render from `displayBalances` which actually contains `formatted`.
     *
     * ✅ ISSUE (original): `key={index}` is an anti-pattern, especially with sorting/reordering.
     * ✅ FIX: use a stable key (e.g., blockchain+currency).
     *
     * ✅ ISSUE (original): `prices[currency]` could be undefined, making usdValue NaN.
     * ✅ FIX: default missing prices to 0 (or guard).
     */
    return displayBalances.map((balance) => {
      const price = prices[balance.currency] ?? 0; // ✅ FIX: prevent NaN
      const usdValue = price * balance.amount;

      return (
        <WalletRow
          /**
           * ✅ ISSUE (original): `classes` was referenced but not defined (runtime error).
           * ✅ FIX: ensure you define classes (e.g., via a styling hook) or remove this.
           */
          // className={classes.row}

          key={`${balance.blockchain}:${balance.currency}`} // ✅ FIX: stable key
          amount={balance.amount}
          usdValue={usdValue}
          formattedAmount={balance.formatted}
        />
      );
    });
  }, [displayBalances, prices]);

  return (
    <div {...rest}>
      {/* ✅ NOTE: `children` was destructured but never used in the original code. Remove if not needed. */}
      {rows}
    </div>
  );
};
