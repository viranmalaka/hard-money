"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

export function RegisterForm() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "Failed to register account");
        setLoading(false);
        return;
      }

      if (data?.user?.id) {
        localStorage.setItem("hardmoney_active_user", data.user.id);
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("An unexpected network error occurred");
      setLoading(false);
    }
  };

  return (
    <>
      {error && (
        <div
          data-testid="auth-error"
          role="alert"
          className="p-3 text-xs rounded border border-red-200 bg-red-50 dark:bg-red-950/40 dark:border-red-800 text-red-600 dark:text-red-400 font-medium"
        >
          {error}
        </div>
      )}

      <form action="javascript:void(0);" onSubmit={handleSubmit} className="flat-card p-5 space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="register-name"
            className="block text-xs font-medium text-[var(--text-muted)]"
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
            className="w-full px-3 py-2 rounded text-sm bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="register-email"
            className="block text-xs font-medium text-[var(--text-muted)]"
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
            className="w-full px-3 py-2 rounded text-sm bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="register-password"
            className="block text-xs font-medium text-[var(--text-muted)]"
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
            className="w-full px-3 py-2 rounded text-sm bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>

        <button
          type="submit"
          data-testid="register-submit"
          tabIndex={4}
          disabled={loading}
          className="w-full py-2.5 px-4 rounded text-sm font-semibold bg-[var(--accent)] text-white hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
        >
          {loading ? "Creating account…" : "Create Account"}
        </button>
      </form>
    </>
  );
}
