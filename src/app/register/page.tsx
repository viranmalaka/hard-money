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
    <div className="w-full max-w-md space-y-6">
      {/* Header */}
      <div className="text-center space-y-2.5">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-3xl bg-gradient-to-br from-[#065F46] to-[#10B981] text-white font-bold text-xl shadow-md mb-1">
          HM
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text)]">
          Create an Account
        </h1>
        <p className="text-xs sm:text-sm text-[var(--text-muted)]">
          Start managing your personal treasury locally
        </p>
      </div>

      {!allowRegistration ? (
        <div
          data-testid="registration-closed-notice"
          role="alert"
          className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-7 text-center space-y-4 shadow-xs"
        >
          <p className="text-base font-bold text-[var(--text)] capitalize">
            registration closed
          </p>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            Public registration has been disabled by the server administrator.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center h-11 px-5 rounded-2xl text-xs font-bold bg-[var(--accent)] text-white hover:opacity-95 transition-all"
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
              className="font-bold text-[var(--accent)] hover:underline"
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
    <div className="min-h-full flex flex-col justify-center items-center px-5 py-12">
      <Suspense fallback={<div className="text-xs text-[var(--text-muted)]">Loading…</div>}>
        <RegisterContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
