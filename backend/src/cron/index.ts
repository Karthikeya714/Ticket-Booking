import cron from "node-cron";
import { env } from "../env";
import { sweepExpiredHolds } from "./expireHolds";
import { sweepExpiredOffers } from "../services/waitlist";

export function startCronJobs() {
  const seconds = env.expirySweepIntervalSeconds;
  // node-cron's optional leading field is seconds (6-field expression), giving sub-minute
  // granularity — a plain 5-field cron expression can't run more often than once a minute.
  const expression = `*/${seconds} * * * * *`;

  cron.schedule(expression, async () => {
    try {
      const freed = await sweepExpiredHolds();
      if (freed > 0) console.log(`[cron] hold expiry sweep freed ${freed} seat(s)`);
    } catch (err) {
      console.error("[cron] hold expiry sweep failed:", err);
    }

    // Separate try/catch so a failure in one sweep can't stop the other from running.
    try {
      const cascaded = await sweepExpiredOffers();
      if (cascaded > 0) console.log(`[cron] waitlist offer sweep expired ${cascaded} offer(s) and cascaded`);
    } catch (err) {
      console.error("[cron] waitlist offer sweep failed:", err);
    }
  });

  console.log(`[cron] hold + waitlist offer expiry sweeps scheduled every ${seconds}s`);
}
