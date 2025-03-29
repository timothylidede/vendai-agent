require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const csv = require('csv-parser');
const fs = require('fs');
const axios = require('axios');
import { OpenAI } from "openai";
import { systemPrompt } from "./systemPrompt";
import {getContext} from "./context";
// const openai = new OpenAI();

// Configuration
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL;
const ADMIN_NUMBER = '254795536131';

const openai = new OpenAI({
    baseURL: DEEPSEEK_BASE_URL,
    apiKey: DEEPSEEK_API_KEY
});

async function getResponseFromDeepSeek(userQuery) {

    const completion = await openai.chat.completions.create({
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userQuery }],
        model: "deepseek-chat",
      });
    
    //   console.log();
    return completion.choices[0].message.content
}

// Enhanced Inventory Management
class InventoryManager {
    constructor() {
        this.products = [];
        this.categories = new Set();
        this.loadInventory();
    }

    loadInventory() {
        fs.createReadStream('one-stop-wholesalers.csv')
            .pipe(csv())
            .on('data', (data) => {
                // Enhanced data processing
                data.cleanPrice = parseFloat(data.Price.replace(/[^\d.]/g, ''));
                data.keywords = this.extractKeywords(data['Product Name']);
                
                // Track unique categories
                if (data.Category) {
                    this.categories.add(data.Category.toLowerCase().trim());
                }
                
                this.products.push(data);
            })
            .on('end', () => {
                console.log('Inventory loaded:', this.products.length);
                console.log('Categories:', Array.from(this.categories));
            });
    }

    // Advanced keyword extraction for better matching
    extractKeywords(productName) {
        return productName.toLowerCase()
            .split(/\s+/)
            .filter(word => word.length > 2 && !['the', 'and', 'with'].includes(word));
    }

    // Advanced product search with multiple matching strategies
    findProducts(query, context = {}) {
        const lowercaseQuery = query.toLowerCase();
        
        // Scoring-based matching
        const scoredProducts = this.products.map(product => {
            let score = 0;
            const productName = product['Product Name'].toLowerCase();
            const productKeywords = product.keywords;

            // Exact name match
            if (productName === lowercaseQuery) score += 100;
            
            // Keyword matches
            const queryWords = lowercaseQuery.split(/\s+/);
            queryWords.forEach(word => {
                if (productKeywords.includes(word)) score += 50;
                if (productName.includes(word)) score += 30;
            });

            // Category match if context provided
            if (context.category && 
                product.Category && 
                product.Category.toLowerCase() === context.category.toLowerCase()) {
                score += 75;
            }

            // Price range consideration
            if (context.priceRange) {
                const { min, max } = context.priceRange;
                if (product.cleanPrice >= min && product.cleanPrice <= max) {
                    score += 25;
                }
            }

            return { ...product, score };
        });

        // Sort by score and filter top results
        return scoredProducts
            .filter(p => p.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);
    }

    // Generate smart product recommendations
    getRecommendations(currentCart, context) {
        if (currentCart.length === 0) return [];

        // Find related products based on cart contents
        const cartCategories = [...new Set(currentCart.map(item => item.Category))];
        const recommendedProducts = this.products
            .filter(product => 
                cartCategories.includes(product.Category) && 
                !currentCart.some(cartItem => cartItem['Product Name'] === product['Product Name'])
            )
            .slice(0, 3);

        return recommendedProducts;
    }
}

// Enhanced AI Analysis
async function analyzeMessage(userInput, session) {
    try {
        const response = await axios.post(
            'https://api.deepseek.com/v1/chat/completions',
            {
                model: "deepseek-chat",
                messages: [
                    {
                        role: "system",
                        content: `Advanced message analysis with rich context:
                        - Analyze user's intent with deep context awareness
                        - Current cart: ${JSON.stringify(session.cart)}
                        - Previous interactions: ${JSON.stringify(session.lastInquiry)}
                        - Detect nuanced intents like price range, product category, specific requirements
                        Respond with enriched JSON: { 
                            "intent": "greeting" | "product_inquiry" | "cart_management" | "recommendation" | "question",
                            "context": {
                                "category": "optional category",
                                "priceRange": {"min": number, "max": number},
                                "additionalDetails": "any specific user requirements"
                            },
                            "response": "natural language contextual reply"
                        }`
                    },
                    { role: "user", content: userInput }
                ],
                temperature: 0.4
            },
            {
                headers: {
                    'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        let content = response.data.choices[0].message.content;
        if (content.startsWith('```json') && content.endsWith('```')) {
            content = content.slice(7, -3).trim();
        }
        return JSON.parse(content);
    } catch (error) {
        console.error('AI Analysis Error:', error);
        return null;
    }
}




// async function getResponseFromDeepSeek(userInput) {
//     openai.chat.create({

// WhatsApp Bot Manager
class WhatsAppBot {
    constructor() {
        this.inventoryManager = new InventoryManager();
        this.userSessions = new Map();
        this.initializeWhatsAppClient();
    }

    initializeWhatsAppClient() {
        this.client = new Client({ authStrategy: new LocalAuth() });
        this.client.on('message', this.handleMessage.bind(this));
        this.client.initialize();
    }

    // Comprehensive message handling
    async handleMessage(msg) {
        const userNumber = msg.from;
        const contact = await this.client.getContactById(userNumber);
        const displayName = contact.pushname || 'Customer';
        const userInput = msg.body.trim();

        // Initialize or retrieve user session
        if (!this.userSessions.has(userNumber)) {
            this.userSessions.set(userNumber, {
                name: displayName,
                cart: [],
                stage: 'awaiting_product',
                lastInquiry: null,
                conversationContext: {}
            });
        }
        const session = this.userSessions.get(userNumber);

        // Advanced AI-powered message analysis
        // const aiAnalysis = await analyzeMessage(userInput, session);

        context = await getContext(userInput);
        query = userInput + " " + context;
        response = await getResponseFromDeepSeek(query);
        

        


        // Intelligent response routing
        
    }

    formatProducts(products) {
        return products.map((p, i) => 
            `${i + 1}. ${p['Product Name']} - ${p.Price} (${p.Category || 'Uncategorized'})`
        ).join('\n');
    }
}

// Initialize and start the bot
const whatsAppBot = new WhatsAppBot();
console.log('Advanced WhatsApp Product Suggestion Bot Started...');