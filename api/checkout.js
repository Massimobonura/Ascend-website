const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://ascendfaithandfitness.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    const { plan, userId, email } = req.body;

    const priceId = plan === 'lifetime'
      ? 'price_1TgatvJ0GAtDMdjACIx9cP5N'
      : 'price_1TgaqvJ0GAtDMdjAYPlY9BW9';

    const mode = plan === 'lifetime' ? 'payment' : 'subscription';

    const session = await stripe.checkout.sessions.create({
      mode,
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { userId, plan },
      success_url: 'https://ascendfaithandfitness.com/dashboard.html?payment=success',
      cancel_url: 'https://ascendfaithandfitness.com/signup.html?cancelled=true',
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
