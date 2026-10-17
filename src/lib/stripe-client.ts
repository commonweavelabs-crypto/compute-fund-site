"use client";

import { loadStripe } from "@stripe/stripe-js";

let stripePromise: ReturnType<typeof loadStripe> | null = null;

function getStripe() {
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
  }
  return stripePromise;
}

/**
 * Create a Stripe Checkout session and redirect the browser to it.
 * Falls back to a no-op with an error message if Stripe is not configured.
 */
export async function redirectToStripeCheckout(
  projectId: string,
  projectTitle: string,
  amount: number
): Promise<{ error?: string }> {
  try {
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, projectTitle, amount }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.error) {
      return { error: data.error || "Failed to create checkout session" };
    }

    if (!data.url) {
      return { error: "No checkout URL returned" };
    }

    // Direct redirect to Stripe-hosted checkout page
    window.location.href = data.url;
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unexpected error" };
  }
}
