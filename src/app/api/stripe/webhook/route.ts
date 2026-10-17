import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabase";

// Lazily built so a missing key returns a clean 503
// instead of crashing the module with "Neither apiKey nor config.authenticator provided".
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
  const client = getStripe();
  if (!client) {
    return NextResponse.json(
      { error: "Stripe not configured: STRIPE_SECRET_KEY is not set" },
      { status: 503 }
    );
  }
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  let event: Stripe.Event;

  try {
    event = client.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    );
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const projectId = session.metadata?.projectId;
      const projectTitle = session.metadata?.projectTitle;
      const amount = session.metadata?.amount;

      if (projectId && amount) {
        // Persist to Supabase when configured (plan Task 4);
        // otherwise mock-mode just logs — the app's local ledger fallback covers dev.
        const admin = getSupabaseAdmin();
        if (admin) {
          try {
            await admin.from("ledger_entries").insert({
              project_id: projectId,
              kind: "funding",
              label: "Stripe compute sponsorship",
              amount_cents: Math.round(Number(amount) * 100),
              provider_reference: session.id,
            });
            await admin.from("supporter_receipts").insert({
              project_id: projectId,
              stripe_payment_intent:
                typeof session.payment_intent === "string" ? session.payment_intent : null,
              amount_cents: Math.round(Number(amount) * 100),
              badge_label: "Compute Sponsor",
            });
            // increment project balance + supporter count
            const { data: proj } = await admin
              .from("projects")
              .select("id, compute_balance_cents, supporter_count")
              .eq("id", projectId)
              .single();
            if (proj) {
              await admin
                .from("projects")
                .update({
                  compute_balance_cents:
                    (proj.compute_balance_cents ?? 0) + Math.round(Number(amount) * 100),
                  supporter_count: (proj.supporter_count ?? 0) + 1,
                })
                .eq("id", projectId);
            }
          } catch (writeError) {
            // Supabase write failed: log it but still return 200 so Stripe
            // does not retry-loop the webhook (plan Task 4 Step 3).
            console.error("[Stripe Webhook] Supabase persistence failed:", writeError);
          }
        } else {
          console.log(
            "[Stripe Webhook] Supabase not configured — payment recorded in logs only:",
            session.id,
          );
        }
      }
      break;
    }

    case "payment_intent.payment_failed": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log("[Stripe Webhook] payment_intent.payment_failed", {
        paymentIntentId: paymentIntent.id,
        lastPaymentError: paymentIntent.last_payment_error?.message,
      });
      break;
    }

    default:
      console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
