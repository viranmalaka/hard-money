"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { login } from "@/services/auth-service";
import { queryKeys } from "@/lib/api/query-keys";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      if (data?.user?.id) localStorage.setItem("hardmoney_active_user", data.user.id);
      void queryClient.invalidateQueries({ queryKey: queryKeys.session() });
      router.push(callbackUrl);
      router.refresh();
    },
  });

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await loginMutation.mutateAsync({ email, password });
    } catch (mutationError) {
      setError(
        mutationError instanceof Error ? mutationError.message : "Invalid email or password"
      );
    }
  };

  return (
    <div className="w-full max-w-md space-y-6">
      {/* Header */}
      <div className="text-center space-y-2.5">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-3xl bg-gradient-to-br from-[#065F46] to-[#10B981] text-white font-bold text-xl shadow-md mb-1">
          HM
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text)]">
          Sign In to Hard Money
        </h1>
        <p className="text-xs sm:text-sm text-[var(--text-muted)]">
          Local-first private treasury &amp; financial ledger
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div
          data-testid="auth-error"
          role="alert"
          className="p-4 text-xs rounded-2xl border border-[var(--expense)]/30 bg-[var(--expense)]/10 text-[var(--expense)] font-semibold"
        >
          {error}
        </div>
      )}

      {/* Login Form */}
      <form
        action="javascript:void(0);"
        onSubmit={handleSubmit}
        className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-6 sm:p-7 space-y-5 shadow-sm"
      >
        <div className="space-y-1.5">
          <label
            htmlFor="login-email"
            className="block text-xs font-semibold text-[var(--text-muted)]"
          >
            Email address
          </label>
          <input
            id="login-email"
            data-testid="login-email"
            name="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            required
            tabIndex={1}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={handleFocus}
            placeholder="you@example.com"
            className="w-full h-12 px-4 rounded-2xl text-sm bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="login-password"
            className="block text-xs font-semibold text-[var(--text-muted)]"
          >
            Password
          </label>
          <input
            id="login-password"
            data-testid="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            tabIndex={2}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onFocus={handleFocus}
            placeholder="••••••••"
            className="w-full h-12 px-4 rounded-2xl text-sm bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>

        <button
          type="submit"
          data-testid="login-submit"
          tabIndex={3}
          disabled={loginMutation.isPending}
          className="w-full h-12 px-5 rounded-2xl text-sm font-bold bg-[var(--accent)] text-white hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer shadow-xs"
        >
          {loginMutation.isPending ? "Signing in…" : "Sign In"}
        </button>

        <div className="flex items-center justify-center gap-1.5 pt-1 text-2xs text-[var(--text-muted)]">
          <ShieldCheck size={13} className="text-[var(--accent)]" />
          <span>End-to-end offline-ready IndexedDB treasury</span>
        </div>
      </form>

      {/* Footer Link */}
      <p className="text-center text-xs text-[var(--text-muted)]">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          data-testid="register-link"
          className="font-bold text-[var(--accent)] hover:underline"
        >
          Create account
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-full flex flex-col justify-center items-center px-5 py-12">
      <Suspense fallback={<div className="text-xs text-[var(--text-muted)]">Loading…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
