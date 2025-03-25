require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');

// **Dummy User Database** (replace with an actual database in production)
const userDatabase = {
  '+254700123456': {
    registered: false,
    firstName: null,
    lastName: null,
    location: null
  }
};

// **Product Inventory**
const inventory = {
  flour: {
    price: 50,
    unit: 'kg',
    alternatives: ['wheat flour', 'bread flour']
  },
  sugar: {
    price: 60,
    unit: 'kg',
    alternatives: ['brown sugar', 'powdered sugar']
  },
  rice: {
    price: 45,
    unit: 'kg',
    alternatives: ['basmati rice', 'jasmine rice']
  }
};

// **DeepSeek AI Model Helper**
class DeepSeekAI {
  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY;
    this.apiUrl = process.env.DEEPSEEK_API_URL;
  }

  async generateResponse(messages) {
    try {
      const response = await axios.post(this.apiUrl, {
        messages: messages,
        model: "deepseek-chat",
        temperature: 0.7
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('DeepSeek API Error:', error.response ? error.response.data : error.message);
      throw error;
    }
  }

  async validateName(input, type) {
    const messages = [
      {
        role: "system", 
        content: `You are a helpful customer service assistant. Evaluate if the input is a valid ${type} name. Respond with "valid" or "invalid".`
      },
      {
        role: "user", 
        content: `Is "${input}" a valid ${type} name? Respond with just "valid" or "invalid".`
      }
    ];

    const response = await this.generateResponse(messages);
    return response.trim().toLowerCase();
  }

  async interpretName(input, expectedField) {
    const messages = [
      {
        role: "system", 
        content: "You are a helpful customer service assistant. Interpret the user's response and guide them to provide a proper first name or last name."
      },
      {
        role: "user", 
        content: `The user responded with: "${input}". This was in response to asking for their ${expectedField}. Please provide a helpful, guiding response.`
      }
    ];

    return await this.generateResponse(messages);
  }
}

// **Initialize DeepSeek AI Model**
const chatModel = new DeepSeekAI();

// **Initialize WhatsApp Client**
const client = new Client({
  authStrategy: new LocalAuth()
});

// **User Conversation States**
const userStates = new Map();

// **Conversation Stages**
const STATES = {
  ASKING_FIRST_NAME: 'asking_first_name',
  ASKING_LAST_NAME: 'asking_last_name',
  ASKING_LOCATION: 'asking_location',
  TAKING_ORDER: 'taking_order',
  SELECTING_QUANTITY: 'selecting_quantity',
  CONFIRMING_ORDER: 'confirming_order',
  IDLE: 'idle'
};

// **Generate Location Sharing Guide**
function getLocationSharingGuide() {
  return `📍 How to Share Location on WhatsApp:
1. Open the chat
2. Tap the attachment (📎) icon
3. Select "Location"
4. Choose "Send Your Current Location"
5. Tap Send

This helps us deliver your order accurately! 🚚`;
}

// **Find Product Based on User Input**
function findProduct(requestedProduct) {
  const lowerRequested = requestedProduct.toLowerCase();

  // Check if it's a main product
  if (inventory[lowerRequested]) {
    return lowerRequested;
  }

  // Check if it's an alternative
  for (const [product, data] of Object.entries(inventory)) {
    if (data.alternatives.some(alt => alt.toLowerCase() === lowerRequested)) {
      return product;
    }
  }

  return null;
}

// **Client Initialization Events**
client.on('qr', (qr) => {
  qrcode.generate(qr, { small: true });
  console.log('Scan the QR code with your WhatsApp app.');
});

client.on('ready', () => {
  console.log('WhatsApp Client is ready!');
});

// **Message Handling**
client.on('message', async (msg) => {
  const userMessage = msg.body.trim();
  const from = msg.from;

  // Initialize user in database if not present
  if (!userDatabase[from]) {
    userDatabase[from] = {
      registered: false,
      firstName: null,
      lastName: null,
      location: null
    };
  }

  const userData = userDatabase[from];
  let userState = userStates.get(from);

  // Set initial state if none exists
  if (!userState) {
    userState = { stage: userData.registered ? STATES.IDLE : STATES.ASKING_FIRST_NAME };
    userStates.set(from, userState);
  }

  try {
    // **Registration Flow for Unregistered Users**
    if (!userData.registered) {
      switch (userState.stage) {
        case STATES.ASKING_FIRST_NAME:
          const firstNameValidation = await chatModel.validateName(userMessage, 'first');
          if (firstNameValidation.trim().toLowerCase() === 'valid') {
            userData.firstName = userMessage;
            msg.reply(`Nice to meet you, ${userData.firstName}! What is your last name?`);
            userState.stage = STATES.ASKING_LAST_NAME;
          } else {
            const interpretationResponse = await chatModel.interpretName(userMessage, 'first name');
            msg.reply(interpretationResponse);
          }
          return;

        case STATES.ASKING_LAST_NAME:
          const lastNameValidation = await chatModel.validateName(userMessage, 'last');
          if (lastNameValidation.trim().toLowerCase() === 'valid') {
            userData.lastName = userMessage;
            msg.reply(getLocationSharingGuide());
            msg.reply('Could you please share your location?');
            userState.stage = STATES.ASKING_LOCATION;
          } else {
            const interpretationResponse = await chatModel.interpretName(userMessage, 'last name');
            msg.reply(interpretationResponse);
          }
          return;

        case STATES.ASKING_LOCATION:
          if (msg.location) {
            userData.location = {
              latitude: msg.location.latitude,
              longitude: msg.location.longitude
            };
            userData.registered = true;
            msg.reply(`Thank you, ${userData.firstName}! You're now registered. What would you like to order?`);
            userState.stage = STATES.TAKING_ORDER;
          } else {
            msg.reply('Please share your location using WhatsApp\'s location feature.');
          }
          return;
      }
    } else {
      // **Ordering Flow for Registered Users**
      if (userState.stage === STATES.IDLE && (userMessage.toLowerCase() === 'hi' || userMessage.toLowerCase() === 'hello')) {
        msg.reply(`Hi ${userData.firstName}! What would you like to order today? We have: ${Object.keys(inventory).join(', ')}`);
        userState.stage = STATES.TAKING_ORDER;
        return;
      }

      if (userState.stage === STATES.TAKING_ORDER) {
        const product = findProduct(userMessage);
        if (product) {
          msg.reply(`Great! How many ${inventory[product].unit} of ${product} would you like?`);
          userState.stage = STATES.SELECTING_QUANTITY;
          userState.product = product;
        } else {
          msg.reply(`Sorry, we don't have "${userMessage}". Available products are: ${Object.keys(inventory).join(', ')}`);
        }
        return;
      }

      if (userState.stage === STATES.SELECTING_QUANTITY) {
        const quantity = parseInt(userMessage.replace(/\D/g, ''));
        if (isNaN(quantity)) {
          msg.reply('Please enter a valid quantity.');
          return;
        }

        const product = userState.product;
        const total = quantity * inventory[product].price;
        msg.reply(`Order Summary:
• Product: ${product}
• Quantity: ${quantity} ${inventory[product].unit}
• Price per ${inventory[product].unit}: ${inventory[product].price} KES
• Total: ${total} KES
Confirm order? (Yes/No)`);
        userState.stage = STATES.CONFIRMING_ORDER;
        userState.quantity = quantity;
        userState.total = total;
        return;
      }

      if (userState.stage === STATES.CONFIRMING_ORDER) {
        if (userMessage.toLowerCase() === 'yes') {
          msg.reply(`Order confirmed! We'll process your ${userState.quantity} ${inventory[userState.product].unit} of ${userState.product} soon. Total: ${userState.total} KES.`);
          userStates.delete(from);
        } else if (userMessage.toLowerCase() === 'no') {
          msg.reply('Order canceled. What would you like to order instead?');
          userState.stage = STATES.TAKING_ORDER;
        } else {
          msg.reply('Please reply with "Yes" to confirm or "No" to cancel.');
        }
        return;
      }

      // Default response for registered users
      msg.reply(`Hi ${userData.firstName}, say "Hi" to start ordering.`);
    }
  } catch (error) {
    console.error('Error processing message:', error);
    msg.reply('Sorry, something went wrong. Please try again.');
  }
});

// **Start the Client**
client.initialize();