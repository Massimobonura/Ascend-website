const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://ascendfaithandfitness.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') { 
    res.status(200).end(); 
    return; 
  }
  
  if (req.method !== 'POST') { 
    res.status(405).json({ error: 'Method not allowed' }); 
    return; 
  }

  const { email } = req.body;

  if (!email) {
    res.status(400).json({ error: 'Email required' });
    return;
  }

  try {
    // Find all subscriptions for this email
    const subscriptions = await stripe.subscriptions.list({
      customer_email: email,
      status: 'active',
      limit: 100
    });

    // Cancel all active subscriptions
    let cancelledCount = 0;
    if (subscriptions.data && subscriptions.data.length > 0) {
      for (const subscription of subscriptions.data) {
        await stripe.subscriptions.del(subscription.id);
        cancelledCount++;
      }
    }

    res.status(200).json({ 
      success: true, 
      cancelledCount: cancelledCount,
      message: `Cancelled ${cancelledCount} subscription(s)`
    });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: err.message });
  }
};
