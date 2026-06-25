const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  'https://ohzgachjklmtoovjjmqx.supabase.co',
  process.env.SUPABASE_SERVICE_KEY
);

module.exports.config = {
  api: {
    bodyParser: false,
  },
};

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('Webhook event received:', event.type);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { userId, plan } = session.metadata || {};

    console.log('Checkout session metadata:', JSON.stringify(session.metadata));
    console.log('userId:', userId, 'plan:', plan, 'email:', session.customer_email);

    if (userId) {
      const { data, error } = await sb.from('profiles').upsert({
        id: userId,
        email: session.customer_email,
        is_member: true,
        plan: plan,
      });

      if (error) {
        console.error('SUPABASE UPSERT ERROR:', JSON.stringify(error));
      } else {
        console.log('Profile upsert succeeded:', JSON.stringify(data));
      }
    } else {
      console.error('No userId found in session metadata! Cannot create profile.');
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    const { data: profiles } = await sb
      .from('profiles')
      .select('id')
      .eq('email', sub.customer_email);
    if (profiles && profiles.length) {
      await sb.from('profiles').update({ is_member: false, plan: null }).eq('id', profiles[0].id);
    }
  }

  res.status(200).json({ received: true });
};
