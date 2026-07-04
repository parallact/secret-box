import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { authConfig } from "./auth.config";
import { verifyTOTPCode } from "./totp";
import { verifyBackupCode, removeBackupCode } from "./backup-codes";
import { decryptServerSide } from "./crypto/server-encryption";
import { loginLimiter, checkRateLimit, getClientIp } from "./rate-limit";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  session: {
    strategy: "jwt",
  },
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totpCode: { label: "2FA Code", type: "text" },
        backupCode: { label: "Backup Code", type: "text" },
      },
      async authorize(credentials, request) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        // Rate-limit the credentials endpoint itself. The /api/auth/login
        // pre-check is skippable by calling signIn() directly, so this is the
        // authoritative brute-force guard. Uses a dedicated key namespace so a
        // normal two-step login does not double-consume the pre-check budget.
        try {
          const ip = request ? getClientIp(request as unknown as Request) : "127.0.0.1";
          const rl = await checkRateLimit(loginLimiter, `authorize:${ip}`);
          if (!rl.success) {
            return null;
          }
        } catch {
          // Rate limiting is defense-in-depth; never block auth on limiter faults.
        }

        const user = await db.user.findUnique({
          where: { email: email.toLowerCase() },
        });

        if (!user || !user.password) {
          return null;
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
          return null;
        }

        // Enforce 2FA at the point where the session is actually granted.
        // Without this, signIn() would authenticate on password alone and the
        // TOTP/backup-code challenge would be purely cosmetic.
        if (user.twoFactorEnabled) {
          const totpCode = typeof credentials?.totpCode === "string" ? credentials.totpCode : "";
          const backupCode = typeof credentials?.backupCode === "string" ? credentials.backupCode : "";

          if (totpCode) {
            if (!user.twoFactorSecret || !/^\d{6}$/.test(totpCode)) {
              return null;
            }
            const validTotp = await verifyTOTPCode(
              totpCode,
              decryptServerSide(user.twoFactorSecret)
            );
            if (!validTotp) {
              return null;
            }
          } else if (backupCode) {
            const codes = user.twoFactorBackupCodes ?? [];
            const matchedIndex = await verifyBackupCode(backupCode, codes);
            if (matchedIndex === -1) {
              return null;
            }
            // Consume the used backup code (one-time use).
            await db.user.update({
              where: { id: user.id },
              data: { twoFactorBackupCodes: removeBackupCode(codes, matchedIndex) },
            });
          } else {
            // 2FA is enabled but no code was supplied — deny.
            return null;
          }
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
  },
});
