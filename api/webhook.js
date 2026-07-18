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
      } else if (session.metadata && session.metadata.userId) {
        // Regular monthly/annual member. Using the checkout session's own metadata
        // directly (set at session creation, always present on this event) rather
        // than relying on it propagating down to a separate charge object. Upserting
        // the full profile here too, so this doesn't depend on the earlier client-side
        // signup write having succeeded — same fix as the free-signup-link flow.
        const userId = session.metadata.userId;
        const plan = session.metadata.plan || null;
        const email = session.customer_email;
        const firstName = session.metadata.firstName || null;
        const lastName = session.metadata.lastName || null;

        const { error: memberError } = await sb.from('profiles')
          .upsert({
            id: userId,
            email: email,
            first_name: firstName,
            last_name: lastName,
            is_member: true,
            plan: plan
          }, { onConflict: 'id' });

        if (memberError) {
          console.error('Error activating member:', memberError);
        } else {
          console.log(`✓ Member ${email || userId} activated (${plan})`);
        }
      }
    }
    // Handle subscription payments (regular monthly/annual) — kept as a best-effort
    // fallback in case charge.metadata happens to be populated; the reliable path
    // is now the checkout.session.completed handler above.
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

    // Handle a subscription being fully canceled — this only fires after Stripe has
    // exhausted its full Smart Retries grace period (typically ~2-3 weeks of retry
    // attempts), NOT on the first failed payment. This gives the member every chance
    // to fix a card issue before losing access. Their workout/habit/photo history is
    // never touched — this only flips their membership flag off, same as a manual
    // "Revoke" in the admin panel.
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      try {
        const customer = await stripe.customers.retrieve(subscription.customer);
        const email = customer && !customer.deleted ? customer.email : null;

        if (email) {
          const { error } = await sb.from('profiles')
            .update({ is_member: false, plan: null, deactivated_at: new Date().toISOString() })
            .eq('email', email);

          if (error) {
            console.error('Error deactivating member after subscription cancellation:', error);
          } else {
            console.log(`✓ Membership deactivated for ${email} — subscription canceled after failed payment retries`);
          }
        } else {
          console.error('Could not find customer email for canceled subscription:', subscription.id);
        }
      } catch (err) {
        console.error('Error handling subscription deletion:', err);
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).json({ error: err.message });
  }
};
