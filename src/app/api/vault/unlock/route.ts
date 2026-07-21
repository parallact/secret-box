import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/audit";
import { unlockLimiter, checkRateLimit, rateLimitHeaders, formatRetryTime } from "@/lib/rate-limit";
import { unlockSchema, validateInput } from "@/lib/validation/schemas";

/**
 * Return the (non-secret) key-derivation salt and auth scheme for the logged-in
 * user so the client can derive its verifier BEFORE proving it. The salt is not
 * a secret (it was already returned on a successful unlock), and this endpoint
 * is session-gated, so it only ever discloses the caller's own salt.
 */
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        masterPassword: true,
        encryptionSalt: true,
        authVersion: true,
      },
    });

    if (!user?.masterPassword || !user?.encryptionSalt) {
      return NextResponse.json(
        { error: "Vault not set up. Please complete registration." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      salt: user.encryptionSalt,
      authVersion: user.authVersion,
    });
  } catch (error) {
    logger.error("Unlock salt lookup error", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check rate limit (by user ID to prevent brute force per account)
    const rateLimitResult = await checkRateLimit(unlockLimiter, session.user.id);

    if (!rateLimitResult.success) {
      const retryIn = formatRetryTime(rateLimitResult.reset ?? Date.now() + 60000);
      return NextResponse.json(
        { error: `Too many unlock attempts. Please try again in ${retryIn}.` },
        {
          status: 429,
          headers: rateLimitHeaders(rateLimitResult.remaining ?? 0, rateLimitResult.reset ?? 0),
        }
      );
    }

    // Parse and validate input
    const body = await req.json();
    const validation = validateInput(unlockSchema, body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    const { verifier, masterPassword } = validation.data;

    // Get user with stored auth material and salt
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        masterPassword: true,
        encryptionSalt: true,
        authVersion: true,
      },
    });

    if (!user?.masterPassword || !user?.encryptionSalt) {
      return NextResponse.json(
        { error: "Vault not set up. Please complete registration." },
        { status: 400 }
      );
    }

    let isValid: boolean;
    let upgradedFromLegacy = false;

    if (user.authVersion >= 2) {
      // Zero-knowledge path: the client proves knowledge of the master password
      // via the derived verifier; the plaintext never reaches the server.
      isValid = await bcrypt.compare(verifier, user.masterPassword);
    } else {
      // Legacy account (authVersion 1): the stored hash is still over the
      // plaintext master password, so we must verify against the plaintext one
      // final time, then transparently re-hash the verifier and upgrade.
      if (!masterPassword) {
        return NextResponse.json(
          { error: "Legacy vault requires re-entry. Please try again." },
          { status: 409 }
        );
      }
      isValid = await bcrypt.compare(masterPassword, user.masterPassword);
      upgradedFromLegacy = isValid;
    }

    if (!isValid) {
      await logAudit({ userId: session.user.id, action: "UNLOCK_FAILED", request: req });
      return NextResponse.json(
        { error: "Invalid master password" },
        { status: 401 }
      );
    }

    // One-time migration: replace the plaintext-based hash with a verifier-based
    // hash so this account never needs to send the plaintext again.
    if (upgradedFromLegacy) {
      try {
        const verifierHash = await bcrypt.hash(verifier, 12);
        await db.user.update({
          where: { id: session.user.id },
          data: { masterPassword: verifierHash, authVersion: 2 },
        });
      } catch (upgradeError) {
        // Non-fatal: the unlock itself succeeded. The account stays on the
        // legacy scheme and will retry the upgrade on the next unlock.
        logger.error("Auth verifier upgrade failed", upgradeError);
      }
    }

    await logAudit({ userId: session.user.id, action: "UNLOCK_VAULT", request: req });

    // Return the salt so the client can derive the encryption key
    return NextResponse.json({
      success: true,
      salt: user.encryptionSalt,
    });
  } catch (error) {
    logger.error("Unlock API error", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
