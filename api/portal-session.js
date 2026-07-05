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
    // Find the customer by email
    const customers = await stripe.customers.list({
      email: email,
      limit: 1
    });

    if (!customers.data || customers.data.length === 0) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    const customerId = customers.data[0].id;

    // Create a billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: 'https://ascendfaithandfitness.com/dashboard.html'
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: err.message });
  }
};
