import 'dotenv/config';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import csv from 'csv-parser';
import fs from 'node:fs';
import axios from 'axios';
import { OpenAI } from 'openai';
import { systemPrompt } from './systemPrompt.js';
import { getContext } from './context.js';

// Log environment variables
console.log('DEEPSEEK_API_KEY:', process.env.DEEPSEEK_API_KEY);
// console.log('DEEPSEEK_BASE_URL:', process.env.DEEPSEEK_BASE_URL);

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL;
const ADMIN_NUMBER = '254795536131';

const openai = new OpenAI({
    baseURL: 'https://api.deepseek.com/v1',
    apiKey: DEEPSEEK_API_KEY
});

let communicationhistoryList = [{"role":" ", "content":" "}];

// console.log('OpenAI Config:', openai.baseURL, openai.apiKey);
console.log('OpenAI API Initialized with deepseek creds...');

async function getResponseFromDeepSeek(userQuery) {
    console.log('Sending query to DeepSeek:', userQuery); // Debug
    const completion = await openai.chat.completions.create({
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userQuery }],
        model: "deepseek-chat",
    });
    // console.log('DeepSeek Response:', completion.choices[0].message.content); // Debug
    return completion.choices[0].message.content;
}

// Rest of your code remains unchanged...
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
                data.cleanPrice = parseFloat(data.Price.replace(/[^\d.]/g, ''));
                data.keywords = this.extractKeywords(data['Product Name']);
                
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

    extractKeywords(productName) {
        return productName.toLowerCase()
            .split(/\s+/)
            .filter(word => word.length > 2 && !['the', 'and', 'with'].includes(word));
    }

    findProducts(query, context = {}) {
        const lowercaseQuery = query.toLowerCase();
        
        const scoredProducts = this.products.map(product => {
            let score = 0;
            const productName = product['Product Name'].toLowerCase();
            const productKeywords = product.keywords;

            if (productName === lowercaseQuery) score += 100;
            
            const queryWords = lowercaseQuery.split(/\s+/);
            queryWords.forEach(word => {
                if (productKeywords.includes(word)) score += 50;
                if (productName.includes(word)) score += 30;
            });

            if (context.category && 
                product.Category && 
                product.Category.toLowerCase() === context.category.toLowerCase()) {
                score += 75;
            }

            if (context.priceRange) {
                const { min, max } = context.priceRange;
                if (product.cleanPrice >= min && product.cleanPrice <= max) {
                    score += 25;
                }
            }

            return { ...product, score };
        });

        return scoredProducts
            .filter(p => p.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);
    }

    getRecommendations(currentCart, context) {
        if (currentCart.length === 0) return [];

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

    async handleMessage(msg) {
        
        // Basic conversion
        const commsHistoryString = JSON.stringify(communicationhistoryList);
        const userNumber = msg.from;
        console.log('Message from:', userNumber, msg.body);
        const contact = await this.client.getContactById(userNumber);
        const displayName = contact.pushname || 'Customer';
        const userInput = msg.body.trim();

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
        console.log('Just before new code stuff');
        const context = await getContext(userInput);
        communicationhistoryList.push({"role":"user", "content":userInput});
        console.log('Context has been found:', context);
        // const query = userInput + " with this context " + context;
        const query = `Use the context below to answer the subsequent question."

                context: ${context + systemPrompt + commsHistoryString}
                Question:` + userInput;

        const response = await getResponseFromDeepSeek(query);
        console.log('Response from DeepSeek:', response);
        communicationhistoryList.push({"role":"system", "content":response});
        msg.reply(response);
    }

    formatProducts(products) {
        return products.map((p, i) => 
            `${i + 1}. ${p['Product Name']} - ${p.Price} (${p.Category || 'Uncategorized'})`
        ).join('\n');
    }
}

const whatsAppBot = new WhatsAppBot();
console.log('Advanced WhatsApp Product Suggestion Bot Started...');