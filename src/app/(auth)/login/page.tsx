"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { validateEmail } from "@/lib/validation/client-schemas";

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.4, ease: "easeOut" as const }
  })
};

const shakeAnimation = {
  shake: {
    x: [0, -10, 10, -10, 10, 0],
    transition: { duration: 0.5 }
  }
};

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Two-factor challenge state (shown after a valid password when 2FA is on).
  const [step, setStep] = useState<"credentials" | "twoFactor">("credentials");
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);

  function triggerShake() {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }

  async function completeSignIn(
    email: string,
    password: string,
    extra: { totpCode?: string; backupCode?: string } = {}
  ): Promise<boolean> {
    const result = await signIn("credentials", {
      email,
      password,
      ...extra,
      redirect: false,
    });

    if (!result || result.error) {
      return false;
    }

    router.push("/dashboard");
    router.refresh();
    return true;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const emailErr = validateEmail(email);
    if (emailErr) {
      setEmailError(emailErr);
      setIsLoading(false);
      return;
    }

    try {
      // First, validate credentials with rate limiting and learn whether the
      // account requires a second factor before creating the session.
      const validateRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const validateData = await validateRes.json();

      if (!validateRes.ok) {
        setError(validateData.error || "Invalid email or password");
        triggerShake();
        setIsLoading(false);
        return;
      }

      if (validateData.requires2FA) {
        // Hold credentials and prompt for the 2FA code — the session is only
        // created once authorize() verifies the code.
        setCredentials({ email, password });
        setStep("twoFactor");
        setIsLoading(false);
        return;
      }

      const ok = await completeSignIn(email, password);
      if (!ok) {
        setError("Invalid email or password");
        triggerShake();
        setIsLoading(false);
      }
    } catch {
      setError("Invalid email or password");
      triggerShake();
      setIsLoading(false);
    }
  }

  async function handleTwoFactorSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!credentials) return;

    setIsLoading(true);
    setError("");

    const trimmed = twoFactorCode.trim();
    if (!trimmed) {
      setError(useBackupCode ? "Enter a backup code" : "Enter your 6-digit code");
      setIsLoading(false);
      return;
    }

    try {
      const ok = await completeSignIn(
        credentials.email,
        credentials.password,
        useBackupCode ? { backupCode: trimmed } : { totpCode: trimmed }
      );
      if (!ok) {
        setError(useBackupCode ? "Invalid backup code" : "Invalid verification code");
        triggerShake();
        setTwoFactorCode("");
        setIsLoading(false);
      }
    } catch {
      setError("Could not verify code. Please try again.");
      triggerShake();
      setIsLoading(false);
    }
  }

  return (
    <motion.div
      className="space-y-6"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
      }}
    >
      {/* Header */}
      <motion.div className="space-y-2" variants={fadeIn} custom={0}>
        <motion.h1
          className="text-2xl font-bold tracking-tight md:text-3xl"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          {step === "twoFactor" ? "Two-factor authentication" : "Welcome back"}
        </motion.h1>
        <motion.p
          className="text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {step === "twoFactor"
            ? useBackupCode
              ? "Enter one of your backup codes"
              : "Enter the 6-digit code from your authenticator app"
            : "Sign in to access your vault"}
        </motion.p>
      </motion.div>

      {/* Error message */}
      <AnimatePresence>
        {error && (
          <motion.div
            className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={shake ? "shake" : { opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            variants={shakeAnimation}
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Form */}
      {step === "credentials" ? (
      <motion.form
        onSubmit={handleSubmit}
        className="space-y-4"
        variants={fadeIn}
        custom={1}
        noValidate
      >
        <motion.div
          className="space-y-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Label htmlFor="email">Email</Label>
          <motion.div whileFocus={{ scale: 1.01 }}>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              disabled={isLoading}
              maxLength={254}
              onBlur={(e) => setEmailError(validateEmail(e.target.value))}
              onChange={(e) => { if (emailError) setEmailError(validateEmail(e.target.value)); }}
              className={`h-11 transition-shadow focus:shadow-md ${emailError ? "border-destructive" : ""}`}
            />
          </motion.div>
          {emailError && (
            <p className="text-xs text-destructive">{emailError}</p>
          )}
        </motion.div>

        <motion.div
          className="space-y-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
          </div>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              disabled={isLoading}
              maxLength={128}
              className="h-11 pr-11 transition-shadow focus:shadow-md"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
        >
          <Button
            type="submit"
            className="h-11 w-full"
            disabled={isLoading || !!emailError}
          >
            {isLoading ? (
              <motion.span
                className="flex items-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </motion.span>
            ) : (
              "Sign in"
            )}
          </Button>
        </motion.div>
      </motion.form>
      ) : (
        <form onSubmit={handleTwoFactorSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="twoFactorCode">
              {useBackupCode ? "Backup code" : "Verification code"}
            </Label>
            <Input
              id="twoFactorCode"
              name="twoFactorCode"
              type="text"
              inputMode={useBackupCode ? "text" : "numeric"}
              autoComplete="one-time-code"
              placeholder={useBackupCode ? "XXXX-XXXX" : "000000"}
              required
              autoFocus
              disabled={isLoading}
              maxLength={useBackupCode ? 20 : 6}
              value={twoFactorCode}
              onChange={(e) =>
                setTwoFactorCode(
                  useBackupCode
                    ? e.target.value.toUpperCase()
                    : e.target.value.replace(/\D/g, "")
                )
              }
              className="h-11 text-center text-lg tracking-widest transition-shadow focus:shadow-md"
            />
          </div>

          <Button type="submit" className="h-11 w-full" disabled={isLoading}>
            {isLoading ? (
              <span className="flex items-center">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verifying...
              </span>
            ) : (
              "Verify & sign in"
            )}
          </Button>

          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => {
                setStep("credentials");
                setCredentials(null);
                setTwoFactorCode("");
                setUseBackupCode(false);
                setError("");
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => {
                setUseBackupCode((v) => !v);
                setTwoFactorCode("");
                setError("");
              }}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {useBackupCode ? "Use authenticator code" : "Use a backup code"}
            </button>
          </div>
        </form>
      )}

      {/* Footer */}
      {step === "credentials" && (
        <motion.p
          className="text-center text-sm text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          Don&apos;t have an account?{" "}
          <motion.span
            whileHover={{ color: "hsl(var(--primary))" }}
            className="inline-block"
          >
            <Link
              href="/register"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Create one
            </Link>
          </motion.span>
        </motion.p>
      )}
    </motion.div>
  );
}
