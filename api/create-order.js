// api/create-order.js

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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  try {
    const token = await getPayPalToken();

    const order = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: 'USD',
              value: '147.00',
            },
            description: 'The Anchor Method - 30-Day Coaching Program',
            custom_id: JSON.stringify({ name, email }),
          },
        ],
        application_context: {
          brand_name: 'Way For Men',
          landing_page: 'NO_PREFERENCE',
          user_action: 'PAY_NOW',
          return_url: `${process.env.SITE_URL}/success.html`,
          cancel_url: `${process.env.SITE_URL}/checkout.html`,
        },
      }),
    });

    const orderData = await order.json();

    if (orderData.id) {
      return res.status(200).json({ orderID: orderData.id });
    } else {
      console.error('PayPal order creation failed:', JSON.stringify(orderData));
      return res.status(500).json({ error: 'Failed to create order', details: orderData });
    }
  } catch (err) {
    console.error('create-order error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
