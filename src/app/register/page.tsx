import React, { Suspense } from "react";
import Link from "next/link";
import { RegisterForm } from "./register-form";

interface RegisterPageProps {
  searchParams?: Promise<{ disabled?: string }>;
}

async function RegisterContent({ searchParams }: RegisterPageProps) {
  const params = await searchParams;
  const isTestDisabled = process.env.E2E_MODE === "1" && params?.disabled === "1";
  const allowRegistration = process.env.ALLOW_REGISTRATION !== "false" && !isTestDisabled;

  return (
    <div className="w-full max-w-sm space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded bg-[var(--accent)] text-white font-bold text-lg mb-1">
          H
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">
          Create an Account
        </h1>
        <p className="text-xs text-[var(--text-muted)]">
          Start managing your personal treasury locally
        </p>
      </div>

      {!allowRegistration ? (
        <div
          data-testid="registration-closed-notice"
          role="alert"
          className="flat-card p-6 text-center space-y-3"
        >
          <p className="text-sm font-semibold text-[var(--text)]">
            registration closed
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            Public registration has been disabled by the server administrator.
          </p>
          <Link
            href="/login"
            className="inline-block py-2 px-4 rounded text-xs font-semibold bg-[var(--border)] text-[var(--text)] hover:bg-[var(--border)]/80 transition-colors"
          >
            Back to Sign In
          </Link>
        </div>
      ) : (
        <>
          <RegisterForm />

          {/* Footer Link */}
          <p className="text-center text-xs text-[var(--text-muted)]">
            Already have an account?{" "}
            <Link
              href="/login"
              data-testid="login-link"
              className="font-medium text-[var(--accent)] hover:underline"
            >
              Sign In
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

export default function RegisterPage({ searchParams }: RegisterPageProps) {
  return (
    <div className="min-h-full flex flex-col justify-center items-center px-4 py-12">
      <Suspense fallback={<div className="text-xs text-[var(--text-muted)]">Loading…</div>}>
        <RegisterContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
