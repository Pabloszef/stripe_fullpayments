import Stripe from "stripe";
import stripe from "@/lib/stripe";
import { ConvexHttpClient } from "convex/browser";
import {api} from "../../../../../convex/_generated/api";
import {Id} from "../../../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)


export async function POST(req:Request) {
	const body = await req.text();
	const signature = req.headers.get("Stripe-Signature") as string;

	let event: Stripe.Event;

	try {
		event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!)
	} catch (error: any) {
		console.log(`Webhook signature verification failed.`, error.message);
		return new Response("Webhook signature verification failed.", {status: 400})
	}

	try {
		switch (event.type) {
			case "checkout.session.completed":
				await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session)
				break;
			case "customer.subscription.created":
			case "customer.subscription.updated":
				await handleSubscriptionUpsert(event.data.object as Stripe.Subscription, event.type);
				break;
			default:
				console.log(`Unhandled event type ${event.type}`);
				break;
		}
	} catch (error: any) {
		console.error(`Error processing webhook (${event.type}):`, error);
		return new Response("Error processing webhook", {status: 500})
	}

	return new Response(null, {status: 200})
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
	const stripeCustomerId = session.customer as string;

	if (!stripeCustomerId) {
		throw new Error("Missing stripeCustomerId in checkout session");
	}

	// For subscription checkouts, we'll handle them in the subscription.created/updated webhook
	if (session.mode === 'subscription') {
		console.log('Skipping subscription checkout in checkout.session.completed');
		return;
	}

	// For one-time purchases, we need a courseId
	const courseId = session.metadata?.courseId;
	if (!courseId) {
		console.log('No courseId found in metadata, skipping purchase recording');
		return;
	}

	const user = await convex.query(api.users.getUserByStripeCustomerId, { stripeCustomerId });
	if (!user) {
		console.error(`User not found for stripe customer id: ${stripeCustomerId}`);
		throw new Error("User not found");
	}

	try {
		await convex.mutation(api.purchases.recordPurchase, {
			userId: user._id,
			courseId: courseId as Id<"courses">,
			amount: session.amount_total || 0,
			stripePurchaseId: session.id,
		});
		console.log(`Successfully recorded purchase ${session.id} for user ${user._id}`);
	} catch (error) {
		console.error('Error recording purchase:', error);
		throw error;
	}
}

async function handleSubscriptionUpsert(subscription: Stripe.Subscription, eventType: string) {
	console.log('Processing subscription:', {
		id: subscription.id,
		status: subscription.status,
		customer: subscription.customer,
		period: {
			start: (subscription as any).current_period_start,
			end: (subscription as any).current_period_end
		}
	});

	if (subscription.status !== "active" || !subscription.latest_invoice) {
		console.log(`Skipping subscription ${subscription.id} - Status: ${subscription.status}, has invoice: ${!!subscription.latest_invoice}`);
		return;
	}

	const stripeCustomerId = subscription.customer as string;
	const user = await convex.query(api.users.getUserByStripeCustomerId, { stripeCustomerId });

	if (!user) {
		throw new Error(`User not found for stripe customer id: ${stripeCustomerId}`);
	}

	try {
		// Access the raw subscription data
		let currentPeriodStart = (subscription as any).current_period_start;
		let currentPeriodEnd = (subscription as any).current_period_end;

		// If period dates are missing, fetch the subscription from Stripe
		if (!currentPeriodStart || !currentPeriodEnd) {
			console.log('Period dates missing in webhook payload, fetching subscription from Stripe...');
			const latestSubscription = await stripe.subscriptions.retrieve(subscription.id, {
				expand: ['latest_invoice', 'schedule']
			});

			currentPeriodStart = (latestSubscription as any).current_period_start;
			currentPeriodEnd = (latestSubscription as any).current_period_end;

			console.log('Fetched subscription from Stripe:', {
				currentPeriodStart,
				currentPeriodEnd
			});
		}

		console.log('Subscription period data:', {
			currentPeriodStart,
			currentPeriodEnd,
			subscriptionItems: subscription.items.data.map((item: any) => ({
				id: item.id,
				price: item.price.id,
				interval: item.price.recurring?.interval
			}))
		});

		if (!currentPeriodStart || !currentPeriodEnd) {
			console.error('Missing period dates in subscription:', {
				subscriptionId: subscription.id,
				subscription: JSON.stringify(subscription, null, 2)
			});
			throw new Error(`Missing period dates in subscription ${subscription.id}`);
		}

		// Get the plan type from the subscription items
		const planType = subscription.items.data[0]?.price?.recurring?.interval;
		if (!planType || (planType !== 'month' && planType !== 'year')) {
			throw new Error(`Invalid or missing plan type in subscription ${subscription.id}`);
		}

		const subscriptionParams = {
			userId: user._id,
			stripeSubscriptionId: subscription.id,
			status: subscription.status,
			planType: planType as "month" | "year",
			currentPeriodStart: currentPeriodStart * 1000, // Convert to milliseconds
			currentPeriodEnd: currentPeriodEnd * 1000,     // Convert to milliseconds
			cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
		};

		console.log('Saving subscription with params:', subscriptionParams);

		const result = await convex.mutation(api.subscriptions.upsertSubscription, subscriptionParams);
		console.log(`Successfully processed ${eventType} for subscription ${subscription.id}`, { result });

	} catch (error) {
		console.error(`Error processing ${eventType} for subscription ${subscription.id}:`, error);
		if (error instanceof Error) {
			console.error('Error details:', {
				message: error.message,
				stack: error.stack,
				name: error.name
			});
		}
		throw error;
	}
}