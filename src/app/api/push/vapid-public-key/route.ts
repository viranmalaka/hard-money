import { NextResponse } from "next/server";

export async function GET() {
  const publicKey =
    process.env.VAPID_PUBLIC_KEY ||
    "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkws6Z35FUVqWp5kxIFgqyTQ2962W1ZOfWDUED850=";

  return NextResponse.json({ publicKey });
}
