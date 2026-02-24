"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Check, X, AlertCircle, AlertTriangle, Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  validateMasterPassword,
  calculatePasswordStrength,
} from "@/lib/crypto/encryption";

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 }
  }
};

export default function RegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [masterPassword, setMasterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nameError, setNameError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showMasterPassword, setShowMasterPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const passwordValidation = validateMasterPassword(masterPassword);
  const passwordStrength = calculatePasswordStrength(masterPassword);
  const passwordsMatch = masterPassword === confirmPassword && confirmPassword.length > 0;

  const strengthLabel = passwordStrength < 25 ? "Weak" : passwordStrength < 50 ? "Fair" : passwordStrength < 75 ? "Good" : "Strong";
  const strengthColor = passwordStrength < 25 ? "text-red-500" : passwordStrength < 50 ? "text-yellow-500" : passwordStrength < 75 ? "text-green-500" : "text-green-600";

  const NAME_REGEX = /^(?=.*\p{L})[\p{L}\s\-']+$/u;

  function validateName(value: string) {
    if (value.length > 50) return "Name cannot exceed 50 characters";
    if (value.length > 0 && value.length < 2) return "Name must be at least 2 characters";
    if (value.length > 0 && !NAME_REGEX.test(value))
      return "Only letters, spaces, hyphens, and apostrophes allowed";
    return "";
  }

  function validateEmail(value: string) {
    if (value.length > 254) return "Email cannot exceed 254 characters";
    if (value.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
      return "Invalid email format";
    return "";
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const nameErr = validateName(name);
    const emailErr = validateEmail(email);
    if (nameErr) { setNameError(nameErr); setIsLoading(false); return; }
    if (emailErr) { setEmailError(emailErr); setIsLoading(false); return; }

    if (!passwordValidation.valid) {
      setError(passwordValidation.errors.join(". "));
      setIsLoading(false);
      return;
    }

    if (!passwordsMatch) {
      setError("Master passwords do not match");
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, masterPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Registration failed");
        setIsLoading(false);
        return;
      }

      router.push("/login?registered=true");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <motion.div
      className="space-y-6"
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
    >
      {/* Header */}
      <motion.div className="space-y-2" variants={fadeIn}>
        <motion.h1
          className="text-2xl font-bold tracking-tight md:text-3xl"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          Create your vault
        </motion.h1>
        <motion.p
          className="text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          Set up your account and master password
        </motion.p>
      </motion.div>

      {/* Error message */}
      <AnimatePresence>
        {error && (
          <motion.div
            className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Form */}
      <motion.form onSubmit={handleSubmit} className="space-y-4" variants={fadeIn} noValidate>
        <motion.div
          className="grid gap-4 sm:grid-cols-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              placeholder="John Doe"
              required
              disabled={isLoading}
              maxLength={50}
              onChange={(e) => setNameError(validateName(e.target.value))}
              className={`h-11 transition-shadow focus:shadow-md ${nameError ? "border-destructive" : ""}`}
            />
            {nameError && (
              <p className="text-xs text-destructive">{nameError}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
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
            {emailError && (
              <p className="text-xs text-destructive">{emailError}</p>
            )}
          </div>
        </motion.div>

        <motion.div
          className="space-y-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Label htmlFor="password">Account Password</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Used to log in"
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
          <p className="text-xs text-muted-foreground">
            This is your login password (different from master password)
          </p>
        </motion.div>

        <motion.div
          className="rounded-lg border bg-muted/30 p-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <motion.div
            className="mb-4 flex items-start gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <motion.div
              animate={{ rotate: [0, -10, 10, -10, 0] }}
              transition={{ delay: 0.5, duration: 0.5 }}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
            </motion.div>
            <div className="text-sm">
              <p className="font-medium text-yellow-600 dark:text-yellow-400">Important: Master Password</p>
              <p className="mt-1 text-muted-foreground">
                Your master password encrypts all your secrets. It cannot be recovered if lost.
              </p>
            </div>
          </motion.div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="masterPassword">Master Password</Label>
              <div className="relative">
                <Input
                  id="masterPassword"
                  name="masterPassword"
                  type={showMasterPassword ? "text" : "password"}
                  autoComplete="off"
                  placeholder="Strong encryption password"
                  required
                  disabled={isLoading}
                  maxLength={128}
                  value={masterPassword}
                  onChange={(e) => setMasterPassword(e.target.value)}
                  className="h-11 pr-11 transition-shadow focus:shadow-md"
                />
                <button
                  type="button"
                  onClick={() => setShowMasterPassword((v) => !v)}
                  className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground"
                  aria-label={showMasterPassword ? "Hide master password" : "Show master password"}
                >
                  {showMasterPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Password strength indicator */}
              <AnimatePresence>
                {masterPassword && (
                  <motion.div
                    className="space-y-3 pt-1"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-2 flex-1 gap-1">
                        {[25, 50, 75, 100].map((threshold, i) => (
                          <motion.div
                            key={threshold}
                            className={`flex-1 rounded-full transition-colors ${
                              passwordStrength >= threshold
                                ? i === 0 ? "bg-red-500"
                                : i === 1 ? "bg-yellow-500"
                                : i === 2 ? "bg-green-500"
                                : "bg-green-600"
                                : "bg-muted"
                            }`}
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: passwordStrength >= threshold ? 1 : 0.5 }}
                            transition={{ delay: i * 0.1, duration: 0.3 }}
                          />
                        ))}
                      </div>
                      <motion.span
                        className={`text-xs font-medium ${strengthColor}`}
                        key={strengthLabel}
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        {strengthLabel}
                      </motion.span>
                    </div>

                    <motion.ul
                      className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs"
                      variants={staggerContainer}
                      initial="hidden"
                      animate="visible"
                    >
                      <PasswordRequirement
                        met={masterPassword.length >= 12}
                        text="12+ characters"
                      />
                      <PasswordRequirement
                        met={/[A-Z]/.test(masterPassword)}
                        text="Uppercase"
                      />
                      <PasswordRequirement
                        met={/[a-z]/.test(masterPassword)}
                        text="Lowercase"
                      />
                      <PasswordRequirement
                        met={/[0-9]/.test(masterPassword)}
                        text="Number"
                      />
                    </motion.ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <motion.div
              className="space-y-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35 }}
            >
              <Label htmlFor="confirmMasterPassword">Confirm Master Password</Label>
              <div className="relative">
                <Input
                  id="confirmMasterPassword"
                  name="confirmMasterPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="off"
                  placeholder="Confirm your master password"
                  required
                  disabled={isLoading}
                  maxLength={128}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-11 pr-11 transition-shadow focus:shadow-md"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground"
                  aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <AnimatePresence>
                {confirmPassword && (
                  <motion.div
                    className={`flex items-center gap-1 text-xs ${passwordsMatch ? "text-accent" : "text-muted-foreground"}`}
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 25 }}
                    >
                      {passwordsMatch ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    </motion.span>
                    {passwordsMatch ? "Passwords match" : "Passwords do not match"}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
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
            disabled={isLoading || !passwordValidation.valid || !passwordsMatch || !!nameError || !!emailError}
          >
            {isLoading ? (
              <motion.span
                className="flex items-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating vault...
              </motion.span>
            ) : (
              "Create Account"
            )}
          </Button>
        </motion.div>
      </motion.form>

      {/* Footer */}
      <motion.p
        className="text-center text-sm text-muted-foreground"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        Already have an account?{" "}
        <motion.span whileHover={{ scale: 1.05 }} className="inline-block">
          <Link
            href="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </motion.span>
      </motion.p>
    </motion.div>
  );
}

function PasswordRequirement({ met, text }: { met: boolean; text: string }) {
  return (
    <motion.li
      className="flex items-center gap-1.5"
      variants={fadeIn}
      transition={{ duration: 0.2 }}
    >
      <motion.span
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 25 }}
      >
        {met ? (
          <Check className="h-3 w-3 text-accent" />
        ) : (
          <X className="h-3 w-3 text-muted-foreground/50" />
        )}
      </motion.span>
      <span className={met ? "text-accent" : "text-muted-foreground"}>
        {text}
      </span>
    </motion.li>
  );
}
