import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

// Lazily built so a missing key returns a clean 503
// (the frontend falls back to local ledger updates) instead of
// crashing the module with "Neither apiKey nor config.authenticator provided".
let stripe: Stripe | null = null;
function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!stripe) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-07-29.dahlia" as any,
    });
  }
  return stripe;
}

export async function POST(request: NextRequest) {
  try {
    const client = getStripe();
    if (!client) {
      return NextResponse.json(
        { error: "Stripe not configured: STRIPE_SECRET_KEY is not set" },
        { status: 503 }
      );
    }

    const { projectId, projectTitle, amount } = await request.json();

    if (!projectId || !projectTitle || !amount) {
      return NextResponse.json(
        { error: "Missing required fields: projectId, projectTitle, amount" },
        { status: 400 }
      );
    }

    // Convert dollars to cents for Stripe
    const amountInCents = Math.round(amount * 100);

    const session = await client.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Compute Fund: ${projectTitle}`,
              description: `Compute sponsorship for ${projectTitle}. Fund AI work. See every run.`,
            },
            unit_amount: amountInCents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/?checkout=success&project=${projectId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/?checkout=cancelled&project=${projectId}`,
      metadata: {
        projectId,
        projectTitle,
        amount: String(amount),
      },
    });

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
