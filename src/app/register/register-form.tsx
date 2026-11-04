"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { register } from "@/services/auth-service";
import { queryKeys } from "@/lib/api/query-keys";

export function RegisterForm() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const registerMutation = useMutation({
    mutationFn: register,
    onSuccess: (data) => {
      if (data?.user?.id) localStorage.setItem("hardmoney_active_user", data.user.id);
      void queryClient.invalidateQueries({ queryKey: queryKeys.session() });
      router.push("/");
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
      await registerMutation.mutateAsync({ name, email, password });
    } catch (mutationError) {
      setError(
        mutationError instanceof Error ? mutationError.message : "Failed to register account"
      );
    }
  };

  return (
    <>
      {error && (
        <div
          data-testid="auth-error"
          role="alert"
          className="p-4 text-xs rounded-2xl border border-[var(--expense)]/30 bg-[var(--expense)]/10 text-[var(--expense)] font-semibold"
        >
          {error}
        </div>
      )}

      <form
        action="javascript:void(0);"
        onSubmit={handleSubmit}
        className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-6 sm:p-7 space-y-5 shadow-sm"
      >
        <div className="space-y-1.5">
          <label
            htmlFor="register-name"
            className="block text-xs font-semibold text-[var(--text-muted)]"
          >
            Full name
          </label>
          <input
            id="register-name"
            data-testid="register-name"
            name="name"
            type="text"
            autoComplete="name"
            required
            tabIndex={1}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={handleFocus}
            placeholder="Jane Doe"
            className="w-full h-12 px-4 rounded-2xl text-sm bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="register-email"
            className="block text-xs font-semibold text-[var(--text-muted)]"
          >
            Email address
          </label>
          <input
            id="register-email"
            data-testid="register-email"
            name="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            required
            tabIndex={2}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={handleFocus}
            placeholder="jane@example.com"
            className="w-full h-12 px-4 rounded-2xl text-sm bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="register-password"
            className="block text-xs font-semibold text-[var(--text-muted)]"
          >
            Password
          </label>
          <input
            id="register-password"
            data-testid="register-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            tabIndex={3}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onFocus={handleFocus}
            placeholder="At least 6 characters"
            className="w-full h-12 px-4 rounded-2xl text-sm bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>

        <button
          type="submit"
          data-testid="register-submit"
          tabIndex={4}
          disabled={registerMutation.isPending}
          className="w-full h-12 px-5 rounded-2xl text-sm font-bold bg-[var(--accent)] text-white hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer shadow-xs"
        >
          {registerMutation.isPending ? "Creating account…" : "Create Account"}
        </button>
      </form>
    </>
  );
}
