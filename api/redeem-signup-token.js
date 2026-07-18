// Securely activates a free-signup-link account server-side, using the service
// role key. This bypasses the RLS timing issue where a brand-new user doesn't
// yet have a fully authenticated session (e.g. when "Confirm email" is required),
// which was silently causing these updates to affect zero rows when done from
// the browser directly.

const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { token, userId } = req.body;

    if (!token || !userId) {
      res.status(400).json({ error: 'Missing token or userId' });
      return;
    }

    // Look up the token and make sure it hasn't already been used
    const { data: tokenRow, error: tokenError } = await sb
      .from('signup_tokens')
      .select('*')
      .eq('id', token)
      .eq('used', false)
      .maybeSingle();

    if (tokenError || !tokenRow) {
      res.status(400).json({ error: 'This signup link is invalid or has already been used.' });
      return;
    }

    // Mark the user as a full member (bypasses RLS via service role — safe here
    // because we've already validated the token server-side above)
    const { error: profileError } = await sb
      .from('profiles')
      .update({ is_member: true, plan: 'coaching' })
      .eq('id', userId);

    if (profileError) {
      console.error('Error updating profile:', profileError);
      res.status(500).json({ error: 'Could not activate your account. Please contact your coach.' });
      return;
    }

    // Tag them as a coaching client with the dates set when the link was created
    const { error: coachingError } = await sb
      .from('coaching_clients')
      .insert({
        user_id: userId,
        coaching_start_date: tokenRow.coaching_start_date,
        coaching_end_date: tokenRow.coaching_end_date,
        status: 'active'
      });

    if (coachingError) {
      console.error('Error creating coaching client record:', coachingError);
      // Don't block the user over this — their membership is already active.
      // Massimo can add them as a coaching client manually if this step failed.
    }

    // Mark the token as used so it can never be redeemed again
    await sb
      .from('signup_tokens')
      .update({ used: true, used_by: userId, used_at: new Date().toISOString() })
      .eq('id', token);

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error redeeming signup token:', err);
    res.status(500).json({ error: 'Something went wrong activating your account. Please contact your coach.' });
  }
};
