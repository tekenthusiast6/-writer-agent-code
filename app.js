const express = require('express');
const { Firestore } = require('@google-cloud/firestore');
const { VertexAI } = require('@google-cloud/vertexai');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(express.json());

const firestore = new Firestore();
const vertex_ai = new VertexAI({ project: 'ai-news-463508', location: 'asia-south1' });
const generativeModel = vertex_ai.getGenerativeModel({ model: 'gemini-1.5-pro-001' });

app.post('/write-article', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).send('Error: URL is required.');
    console.log(`Processing URL: ${url}`);
    try {
        const response = await axios.get(url, { timeout: 10000 });
        const html = response.data;
        const $ = cheerio.load(html);
        let scrapedText = '';
        $('p').each((i, elem) => { scrapedText += $(elem).text() + '\n'; });
        if (scrapedText.length < 200) return res.status(400).send('Scraped text is too short.');

        const prompt = `Based on the following scraped text, write a new, unique news article of approximately 500 words with a neutral, journalistic tone. Also, generate a short, catchy headline. Provide the output in a JSON format with keys: "headline" and "articleContent".`;
        const result = await generativeModel.generateContent(prompt);
        const generatedContent = result.response.candidates[0].content.parts[0].text;
        const cleanedJsonString = generatedContent.replace(/```json|```/g, '').trim();
        const { headline, articleContent } = JSON.parse(cleanedJsonString);

        const draftCollection = firestore.collection('draftArticles');
        await draftCollection.add({ headline, articleContent, sourceUrl: url, timestamp: new Date() });
        console.log('Writer-agent finished successfully.');
        res.status(200).send(`Successfully wrote article: ${headline}`);
    } catch (error) {
        console.error('An error occurred in the writer-agent:', error.message);
        res.status(500).send('Internal Server Error in writer-agent.');
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => { console.log(`Writer-agent server listening on port ${PORT}`); });
