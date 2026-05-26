const https = require('https');

function stripeRequest(path, data, secretKey) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(data).toString();
    const options = {
      hostname: 'api.stripe.com',
      path,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  try {
    const { routeLabel, vehicle, date, time, flight, name, email, phone, price } = JSON.parse(event.body);

    if (!price || isNaN(price) || price <= 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Prix invalide' }) };
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;
    const vehicleLabel = vehicle === 'berline' ? 'Berline (Tesla / Mercedes E-Class)' : 'Van (Mercedes V-Class)';
    const dateFormatted = new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    const description = [vehicleLabel, `${dateFormatted} à ${time}`, flight ? `Vol: ${flight}` : null, `Passager: ${name}`, `Tél: ${phone}`].filter(Boolean).join(' · ');
    const baseUrl = process.env.URL || 'https://lesvtcparisiens.fr';

    const session = await stripeRequest('/v1/checkout/sessions', {
      'payment_method_types[]': 'card',
      'line_items[0][price_data][currency]': 'eur',
      'line_items[0][price_data][product_data][name]': `Transfert ${routeLabel}`,
      'line_items[0][price_data][product_data][description]': description,
      'line_items[0][price_data][unit_amount]': Math.round(price * 100),
      'line_items[0][quantity]': '1',
      'mode': 'payment',
      'customer_email': email,
      'success_url': `${baseUrl}/success.html`,
      'cancel_url': `${baseUrl}/#booking`,
    }, secretKey);

    if (session.error) {
      console.error('Stripe error:', session.error.message);
      return { statusCode: 500, body: JSON.stringify({ error: session.error.message }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url })
    };
  } catch (error) {
    console.error('Error:', error.message);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
