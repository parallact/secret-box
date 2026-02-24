"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { motion } from "framer-motion";

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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

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
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const emailErr = validateEmail(email);
    if (emailErr) {
      setEmailError(emailErr);
      setIsLoading(false);
      return;
    }

    try {
      // First, validate credentials with rate limiting
      const validateRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const validateData = await validateRes.json();

      if (!validateRes.ok) {
        setError(validateData.error || "Invalid email or password");
        setShake(true);
        setTimeout(() => setShake(false), 500);
        setIsLoading(false);
        return;
      }

      // If credentials are valid, proceed with NextAuth signIn
      await signIn("credentials", {
        email,
        password,
        redirectTo: "/dashboard",
      });
    } catch {
      setError("Invalid email or password");
      setShake(true);
      setTimeout(() => setShake(false), 500);
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
          Welcome back
        </motion.h1>
        <motion.p
          className="text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          Sign in to access your vault
        </motion.p>
      </motion.div>

      {/* Error message */}
      {error && (
        <motion.div
          className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={shake ? "shake" : { opacity: 1, scale: 1 }}
          variants={shakeAnimation}
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </motion.div>
      )}

      {/* Form */}
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

      {/* Footer */}
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
    </motion.div>
  );
}
