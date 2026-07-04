const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  
  if (!sig) {
    res.status(400).json({ error: 'No stripe signature' });
    return;
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    res.status(400).json({ error: 'Webhook signature verification failed' });
    return;
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      
      // Check if this is a coaching payment (price_1TpFa0J0GAtDMdjAyxsygPS1)
      const isCoachingPayment = session.line_items && (await Promise.all(
        (session.line_items.data || []).map(async (item) => {
          const price = await stripe.prices.retrieve(item.price.id);
          return price.id === 'price_1TpFa0J0GAtDMdjAyxsygPS1';
        })
      )).some(result => result);

      if (isCoachingPayment) {
        const email = session.customer_email;
        
        if (email) {
          // Get Massimo's coach_id
          const { data: massimo } = await sb.from('coaches')
            .select('id')
            .eq('email', 'ascend.ff.coaching@gmail.com')
            .maybeSingle();

          // Get the user_id from profiles table if they exist
          const { data: profile } = await sb.from('profiles')
            .select('id')
            .eq('email', email)
            .maybeSingle();

          // Update the coaching_clients record to active and assign to Massimo
          const { error: updateError } = await sb.from('coaching_clients')
            .update({
              status: 'active',
              coach_id: massimo?.id || null,
              user_id: profile?.id || null,
              stripe_subscription_id: session.id,
            })
            .eq('email', email)
            .eq('status', 'pending_payment');

          if (updateError) {
            console.error('Error updating coaching client:', updateError);
          } else {
            console.log(`✓ Coaching client ${email} activated and assigned to Massimo`);
          }
        }
      }
    }

    // Handle subscription payments (regular monthly/annual)
    if (event.type === 'charge.succeeded') {
      const charge = event.data.object;
      
      if (charge.metadata && charge.metadata.user_id) {
        // Update member status if needed
        const userId = charge.metadata.user_id;
        const { error } = await sb.from('profiles')
          .update({ is_member: true })
          .eq('id', userId);
        
        if (error) console.error('Error updating member status:', error);
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).json({ error: err.message });
  }
};
