require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');

// Environment variables for DeepSeek API
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/completions'; // Default URL (hypothetical)

// Initialize WhatsApp client with local session storage
const client = new Client({
  authStrategy: new LocalAuth(),
});

// Generate QR code for authentication
client.on('qr', (qr) => {
  qrcode.generate(qr, { small: true });
  console.log('Scan the QR code with your WhatsApp app.');
});

// Log when the client is ready
client.on('ready', () => {
  console.log('WhatsApp Client is ready!');
});

// Sample inventory (replace with database in Phase 2)
const inventory = {
  flour: { price: 50, unit: 'kg' },
  sugar: { price: 60, unit: 'kg' },
};

// Track user orders
const userOrders = new Map();

// Function to process messages with DeepSeek
async function processMessageWithDeepSeek(message) {
  try {
    const response = await axios.post(
      DEEPSEEK_API_URL,
      {
        prompt: `Interpret this merchant order and suggest a reply: "${message}"\nAvailable items: Flour (50 KES/kg), Sugar (60 KES/kg)`,
        max_tokens: 100,
        temperature: 0.7,
      },
      {
        headers: {
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data.choices[0].text.trim();
  } catch (error) {
    console.error('DeepSeek API Error:', error.response ? error.response.data : error.message);
    return 'Sorry, I couldn’t process your request. Please try again.';
  }
}

// Handle incoming messages
client.on('message', async (msg) => {
  const userMessage = msg.body.toLowerCase();
  const from = msg.from;

  // Start or reset the conversation
  if (userMessage === 'hi' || userMessage === 'start') {
    userOrders.delete(from); // Reset any existing order
    msg.reply(
      'Welcome to VendAI! Select an item:\n1. Flour (50 KES/kg)\n2. Sugar (60 KES/kg)\nOr type your order directly (e.g., "10kg flour, 5kg sugar").'
    );
    return;
  }

  // Menu navigation: Select Flour
  if (userMessage === '1') {
    msg.reply('How many kg of Flour? (e.g., "10kg")');
    userOrders.set(from, { item: 'flour', quantity: 0 });
    return;
  }

  // Menu navigation: Select Sugar
  if (userMessage === '2') {
    msg.reply('How many kg of Sugar? (e.g., "5kg")');
    userOrders.set(from, { item: 'sugar', quantity: 0 });
    return;
  }

  // Quantity input
  if (/(\d+)kg/.test(userMessage)) {
    const quantity = parseInt(userMessage.match(/(\d+)/)[0]);
    const order = userOrders.get(from) || { item: null, quantity: 0 };

    if (order.item) {
      order.quantity = quantity;
      const total = order.quantity * inventory[order.item].price;
      const summary = `Order Summary:\n${order.quantity}kg ${order.item} @ ${inventory[order.item].price} KES/kg = ${total} KES\nConfirm? (Yes/No)`;
      msg.reply(summary);
      userOrders.set(from, order);
    } else {
      msg.reply('Please select an item first (e.g., "1" for Flour, "2" for Sugar).');
    }
    return;
  }

  // Order confirmation
  if (userMessage === 'yes' && userOrders.has(from)) {
    const order = userOrders.get(from);
    const total = order.quantity * inventory[order.item].price;
    msg.reply(`Order confirmed! Total: ${total} KES. Payment link coming soon...`);
    userOrders.delete(from); // Clear order after confirmation
    return;
  }

  // Order cancellation
  if (userMessage === 'no' && userOrders.has(from)) {
    msg.reply('Order canceled. Start again with "Hi".');
    userOrders.delete(from);
    return;
  }

  // Fallback to DeepSeek for natural language orders
  const reply = await processMessageWithDeepSeek(userMessage);
  msg.reply(reply);
});

// Start the client
client.initialize();