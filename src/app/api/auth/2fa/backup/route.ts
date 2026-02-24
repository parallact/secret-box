import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { verifyBackupCode, removeBackupCode } from "@/lib/backup-codes";
import { logAudit } from "@/lib/audit";
import { backupCodeSchema, validateInput } from "@/lib/validation/schemas";

export async function POST(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const validation = validateInput(backupCodeSchema, body.code);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const code = validation.data;

    // Get user with backup codes
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        twoFactorEnabled: true,
        twoFactorBackupCodes: true,
      },
    });

    if (!user?.twoFactorEnabled) {
      return NextResponse.json(
        { error: "Two-factor authentication is not enabled" },
        { status: 400 }
      );
    }

    if (!user.twoFactorBackupCodes || user.twoFactorBackupCodes.length === 0) {
      return NextResponse.json(
        { error: "No backup codes available" },
        { status: 400 }
      );
    }

    // Verify the backup code
    const matchedIndex = await verifyBackupCode(code, user.twoFactorBackupCodes);

    if (matchedIndex === -1) {
      // Log failed attempt
      await logAudit({
        userId: session.user.id,
        action: "UNLOCK_FAILED",
        resource: "SETTINGS",
        metadata: { method: "backup_code" },
        request: req,
      });

      return NextResponse.json(
        { error: "Invalid backup code" },
        { status: 401 }
      );
    }

    // Remove the used backup code (one-time use)
    const remainingCodes = removeBackupCode(user.twoFactorBackupCodes, matchedIndex);

    await db.user.update({
      where: { id: session.user.id },
      data: { twoFactorBackupCodes: remainingCodes },
    });

    // Log successful use
    await logAudit({
      userId: session.user.id,
      action: "UNLOCK_VAULT",
      resource: "SETTINGS",
      metadata: {
        method: "backup_code",
        remainingCodes: remainingCodes.length,
      },
      request: req,
    });

    return NextResponse.json({
      success: true,
      message: "Backup code verified successfully",
      remainingCodes: remainingCodes.length,
    });
  } catch (error) {
    logger.error("Backup code verification error", error);
    return NextResponse.json(
      { error: "Failed to verify backup code" },
      { status: 500 }
    );
  }
}
