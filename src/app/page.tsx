export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-foreground">
      <div className="w-full max-w-md p-8 border border-border rounded-lg shadow-sm text-center space-y-4">
        <h1
          data-testid="app-title"
          className="text-2xl font-bold tracking-tight"
        >
          Hard Money
        </h1>
        <p className="text-sm text-muted-foreground">
          Local-first, double-entry financial ledger and personal treasury.
        </p>
      </div>
    </main>
  );
}
