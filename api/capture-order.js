const PAYPAL_API = process.env.PAYPAL_ENV === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

async function getPayPalToken() {
  const creds = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await res.json();
  return data.access_token;
}

async function addToKlaviyo(name, email) {
  const firstName = name.split(' ')[0];
  const lastName = name.split(' ').slice(1).join(' ') || '';

  const profileRes = await fetch('https://a.klaviyo.com/api/profiles/', {
    method: 'POST',
    headers: {
      Authorization: `Klaviyo-API-Key ${process.env.KLAVIYO_API_KEY}`,
      'Content-Type': 'application/json',
      revision: '2024-02-15',
    },
    body: JSON.stringify({
      data: {
        type: 'profile',
        attributes: {
          email,
          first_name: firstName,
          last_name: lastName,
          properties: {
            product: 'The Anchor Method',
            purchase_date: new Date().toISOString(),
          },
        },
      },
    }),
  });

  const profileData = await profileRes.json();
  let profileId = profileData?.data?.id;
  if (!profileId && profileData?.errors?.[0]?.meta?.duplicate_profile_id) {
    profileId = profileData.errors[0].meta.duplicate_profile_id;
  }

  if (!profileId) {
    console.error('Klaviyo profile error:', JSON.stringify(profileData));
    return;
  }

  await fetch(`https://a.klaviyo.com/api/lists/${process.env.KLAVIYO_LIST_ID}/relationships/profiles/`, {
    method: 'POST',
    headers: {
      Authorization: `Klaviyo-API-Key ${process.env.KLAVIYO_API_KEY}`,
      'Content-Type': 'application/json',
      revision: '2024-02-15',
    },
    body: JSON.stringify({
      data: [{ type: 'profile', id: profileId }],
    }),
  });

  await fetch('https://a.klaviyo.com/api/events/', {
    method: 'POST',
    headers: {
      Authorization: `Klaviyo-API-Key ${process.env.KLAVIYO_API_KEY}`,
      'Content-Type': 'application/json',
      revision: '2024-02-15',
    },
    body: JSON.stringify({
      data: {
        type: 'event',
        attributes: {
          metric: { data: { type: 'metric', attributes: { name: 'Anchor Method Purchase' } } },
          profile: { data: { type: 'profile', id: profileId } },
          properties: { product: 'The Anchor Method', value: 147 },
        },
      },
    }),
  });

  console.log('Klaviyo: profile added and event fired for', email);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orderID, name, email } = req.body;
  if (!orderID || !name || !email) return res.status(400).json({ error: 'Missing fields' });

  try {
    const token = await getPayPalToken();

    const capture = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await capture.json();

    if (data?.status === 'COMPLETED') {
      await addToKlaviyo(name, email);
      return res.status(200).json({ success: true });
    }

    console.error('Capture failed:', JSON.stringify(data));
    return res.status(400).json({ error: 'Payment not completed', details: data });
  } catch (err) {
    console.error('capture-order error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
