const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://ascendfaithandfitness.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { email } = req.body;

  if (!email) {
    res.status(400).json({ error: 'Email required' });
    return;
  }

  try {
    // Create Stripe checkout session for $3,000 one-time payment
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      line_items: [
        {
          price: 'price_1TpFa0J0GAtDMdjAyxsygPS1',
          quantity: 1,
        },
      ],
      success_url: 'https://ascendfaithandfitness.com/thank-you',
      cancel_url: 'https://ascendfaithandfitness.com/',
    });

    // Add client to coaching_clients table
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
};
