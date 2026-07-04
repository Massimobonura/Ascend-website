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

  // TEST VERSION - just return success
  res.status(200).json({ 
    success: true, 
    cancelledCount: 0,
    message: 'Test success - Stripe call will be added next'
  });
};
