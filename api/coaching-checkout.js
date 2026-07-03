import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  try {
    // Create Stripe checkout session for $3,000 one-time payment
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: 'price_1TpFa0J0GAtDMdjAyxsygPS1', // Your $3,000 coaching price
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: email,
      success_url: `${process.env.VERCEL_URL}/thank-you`,
      cancel_url: `${process.env.VERCEL_URL}/`,
    });

    // Add client to coaching_clients table with pending status
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + 6 * 30 * 24 * 60 * 60 * 1000);
    
    await sb.from('coaching_clients').insert({
      email: email,
      stripe_subscription_id: session.id,
      coaching_start_date: startDate.toISOString().split('T')[0],
      coaching_end_date: endDate.toISOString().split('T')[0],
      status: 'pending_payment',
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Error creating checkout:', err);
    res.status(500).json({ error: err.message });
  }
}
