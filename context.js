import ollama from 'ollama';
import Database from 'better-sqlite3';

const db = new Database('embedblob.db');
const sessionId = 'testUser';

// Register cosine_similarity for SQLite
db.function('cosine_similarity', (vec1, vec2) => {
    const v1 = vec1 instanceof Buffer ? new Float32Array(vec1.buffer, vec1.byteOffset, vec1.length / 4) : vec1;
    const v2 = vec2 instanceof Buffer ? new Float32Array(vec2.buffer, vec2.byteOffset, vec2.length / 4) : vec2;

    if (v1.length !== v2.length) throw new Error("Vectors must be of the same length.");
    let dot = 0, norm1Sq = 0, norm2Sq = 0;
    for (let i = 0; i < v1.length; i++) {
        const a = v1[i];
        const b = v2[i];
        dot += a * b;
        norm1Sq += a * a;
        norm2Sq += b * b;
    }
    const normProduct = Math.sqrt(norm1Sq) * Math.sqrt(norm2Sq);
    return normProduct === 0 ? 0 : dot / normProduct;
});

/**
 * @param {string} query - The user's input
 * @returns {Promise<Float32Array>} - A list of embeddings
 */
async function EmbedUserQuery(query) {
    const res = await ollama.embed({
        model: "mxbai-embed-large",
        truncate: true,
        input: query,
    });
    return new Float32Array(res.embeddings.flat());
}

/**
 * @param {Float32Array} f - An embedding of the user input
 * @returns {string} - 3-5 similar content from the database
 */
const getSimilarContentFromDb = (f) => {
    const embeddingBuffer = Buffer.from(f.buffer); // Convert Float32Array buffer to Buffer
    const rows = db.prepare(
        "SELECT *, cosine_similarity(embeddings, ?) AS similarity FROM embeddings WHERE sessid = ? ORDER BY similarity DESC LIMIT 3"
    ).all(embeddingBuffer, sessionId);
    return rows[0].content; // Return the most similar content
};

/**
 * @param {string} query - The user's input
 * @returns {Promise<string>} - Similar content from the database
 */
export const getContext = async (query) => {
    const embedding = await EmbedUserQuery(query);
    const similarContent = getSimilarContentFromDb(embedding);
    return similarContent;
};

// Run the function and handle the Promise
(async () => {
    try {
        const result = await getContext("tea");
        console.log(result);
    } catch (error) {
        console.error("Error:", error);
    }
})();