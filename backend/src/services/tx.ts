import { Prisma } from "@prisma/client";

// Prisma surfaces Postgres serialization/deadlock failures as P2034 on interactive
// transactions. Our locking strategy (single-row FOR UPDATE, plus SKIP LOCKED for allocation)
// shouldn't produce these, but retrying once is cheap insurance per the spec's requirement.
export async function withRetryOnce<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
      return await fn();
    }
    throw err;
  }
}
