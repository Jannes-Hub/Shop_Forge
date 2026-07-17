require('dotenv').config();
const express = require('express');
const Stripe = require('stripe');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors());

app.use((req, res, next) => {
  if (req.originalUrl === '/webhook') {
    next();
  } else {
    express.json()(req, res, next);
  }
});

app.get('/', (req, res) => res.send('ShopForge Backend is running ✅'));

// ================== CREATE CHECKOUT SESSION ==================
app.post('/create-checkout-session', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'Starter Forge Paket',
            description: 'Vollständiges HTML-Template + 6 detaillierte PDF-Guides',
          },
          unit_amount: 4999,
        },
        quantity: 1,
      }],
      customer_creation: 'always',
      success_url: `${process.env.FRONTEND_URL}/erfolg.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Fehler beim Erstellen der Session' });
  }
});

// ================== STRIPE WEBHOOK ==================
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const customerEmail = session.customer_details?.email || session.customer_email;

    console.log('✅ Payment successful for:', customerEmail);

    if (customerEmail) {
      try {
        await sendEmailWithEmailJS(customerEmail);
        console.log('📧 Email sent to:', customerEmail);
      } catch (emailError) {
        console.error('Email error:', emailError);
      }
    }
  }

  res.json({ received: true });
});

// ================== SEND EMAIL VIA EMAILJS ==================
async function sendEmailWithEmailJS(customerEmail) {
  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: process.env.EMAILJS_SERVICE_ID,
      template_id: process.env.EMAILJS_TEMPLATE_ID,
      user_id: process.env.EMAILJS_PUBLIC_KEY,
      accessToken: process.env.EMAILJS_PRIVATE_KEY || '',
      template_params: {
        to_email: customerEmail,
        customer_email: customerEmail,
        download_link: process.env.DOWNLOAD_LINK || 'https://dein-download-link.com/Starter-Forge-Paket.zip',
        product_name: 'Starter Forge Paket',
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`EmailJS Error: ${errorText}`);
  }

  return response.json();
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Backend running on port ${PORT}`));

module.exports = app;