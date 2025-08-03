/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, Type } from '@google/genai';
import { jsPDF } from 'jspdf';

// --- DOM Elements ---
const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement;
const themeInput = document.getElementById('theme-input') as HTMLTextAreaElement;
const generateBtn = document.getElementById('generate-btn') as HTMLButtonElement;
const magicBtn = document.getElementById('magic-btn') as HTMLButtonElement;
const loader = document.getElementById('loader') as HTMLDivElement;
const outputContainer = document.getElementById('output-container') as HTMLDivElement;

// --- State & API ---
let ai: GoogleGenAI | null = null;

// --- API Key Handling ---
const initAi = (key: string) => {
    try {
        ai = new GoogleGenAI({ apiKey: key });
        return true;
    } catch (error) {
        console.error("Failed to initialize GoogleGenAI:", error);
        alert("Invalid API Key format.");
        return false;
    }
};

apiKeyInput.addEventListener('change', () => {
    const key = apiKeyInput.value.trim();
    if (key) {
        sessionStorage.setItem('gemini-api-key', key);
        initAi(key);
    }
});

// Load key from session storage on startup
const storedApiKey = sessionStorage.getItem('gemini-api-key');
if (storedApiKey) {
    apiKeyInput.value = storedApiKey;
    initAi(storedApiKey);
}

// --- UI Control ---
const setLoading = (isLoading: boolean) => {
    loader.style.display = isLoading ? 'flex' : 'none';
    outputContainer.innerHTML = ''; // Clear previous results
    outputContainer.style.display = 'none';
    generateBtn.disabled = isLoading;
    magicBtn.disabled = isLoading;
};

// --- Magic Button Logic ---
magicBtn.addEventListener('click', async () => {
    if (!ai) {
        alert('Please enter your Gemini API Key first.');
        return;
    }
    setLoading(true);
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: 'Generate a single, short, thought-provoking, and slightly dark motivational theme. For example: "The loneliness of the leader", "The price of chasing dreams", "Effort vs. Results". Keep it under 10 words. Do not add quotes or any other formatting.',
        });
        themeInput.value = response.text.trim();
    } catch (error) {
        console.error('Magic button error:', error);
        alert('Could not generate a magic theme. Please check your API key and try again.');
    } finally {
        setLoading(false);
    }
});

// --- Main Generation Logic ---
generateBtn.addEventListener('click', async () => {
    if (!ai) {
        alert('Please enter your Gemini API Key first.');
        return;
    }
    const theme = themeInput.value.trim();
    if (!theme) {
        alert('Please enter a theme or topic.');
        return;
    }

    setLoading(true);

    try {
        // 1. Generate 10 meme concepts (text + image prompts)
        const concepts = await generateMemeConcepts(ai, theme);
        
        // 2. Generate 10 images based on the prompts
        const images = await generateImages(ai, concepts.map(c => c.image_prompt));

        // 3. Create the PDF
        createPdf(concepts, images);

    } catch (error) {
        console.error('Generation failed:', error);
        alert(`An error occurred during generation: ${(error as Error).message}. Please check the console for details.`);
    } finally {
        // setLoading is called within createPdf on success, or here on failure.
        if (outputContainer.innerHTML === '') {
            setLoading(false);
        }
    }
});

// --- Helper Functions ---

async function generateMemeConcepts(ai: GoogleGenAI, theme: string): Promise<{ truth: string; image_prompt: string }[]> {
    console.log('Generating meme concepts...');
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Based on the theme "${theme}", generate 10 distinct, single-panel meme concepts. For each concept, provide a short, impactful motivational or dark-truth quote (the 'truth'), and a detailed visual prompt for an AI image generator to create a symbolic, artistic image for that quote.`,
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    memes: {
                        type: Type.ARRAY,
                        description: 'An array of 10 meme concepts.',
                        items: {
                            type: Type.OBJECT,
                            required: ['truth', 'image_prompt'],
                            properties: {
                                truth: {
                                    type: Type.STRING,
                                    description: 'The short, impactful quote. Max 15 words.'
                                },
                                image_prompt: {
                                    type: Type.STRING,
                                    description: 'A detailed prompt for an AI image generator to create a symbolic, artistic, high-contrast image. Should be visually striking and metaphorical.'
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    const result = JSON.parse(response.text);
    if (!result.memes || result.memes.length === 0) {
        throw new Error("AI failed to generate meme concepts. Try a different theme.");
    }
    console.log('Concepts generated:', result.memes);
    return result.memes;
}

async function generateImages(ai: GoogleGenAI, prompts: string[]): Promise<string[]> {
    console.log('Generating images...');
    const imagePromises = prompts.map(prompt => 
        ai.models.generateImages({
            model: 'imagen-3.0-generate-002',
            prompt: `${prompt}, dark fantasy art, cinematic, dramatic lighting, hyper-detailed, epic`,
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/jpeg',
                aspectRatio: '16:9'
            }
        }).then(res => {
            if (!res.generatedImages || res.generatedImages.length === 0) {
                throw new Error(`Failed to generate image for prompt: "${prompt}"`);
            }
            return res.generatedImages[0].image.imageBytes;
        })
    );
    const results = await Promise.all(imagePromises);
    console.log('All images generated.');
    return results;
}

function createPdf(concepts: { truth: string; image_prompt: string }[], images: string[]) {
    console.log('Creating PDF...');
    const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: 'a4' // A4 landscape is roughly 842x595 px
    });
    
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    for (let i = 0; i < concepts.length; i++) {
        if (i > 0) {
            doc.addPage();
        }
        
        const { truth } = concepts[i];
        const base64Image = images[i];
        
        // Add image
        const imgProps = doc.getImageProperties(`data:image/jpeg;base64,${base64Image}`);
        const imgRatio = imgProps.width / imgProps.height;
        let imgWidth = pageWidth;
        let imgHeight = pageWidth / imgRatio;
        if (imgHeight > pageHeight) {
            imgHeight = pageHeight;
            imgWidth = pageHeight * imgRatio;
        }
        const x = (pageWidth - imgWidth) / 2;
        const y = (pageHeight - imgHeight) / 2;
        doc.addImage(`data:image/jpeg;base64,${base64Image}`, 'JPEG', x, y, imgWidth, imgHeight);

        // Add text overlay only if truth text exists
        if (truth && truth.trim() !== '') {
            const textBoxHeight = 80; // Height of the black bar
            const textYPos = y + imgHeight - textBoxHeight;
            
            // Use a solid black rectangle for reliability
            doc.setFillColor(0, 0, 0); 
            doc.rect(x, textYPos, imgWidth, textBoxHeight, 'F');

            doc.setFont('helvetica', 'bold');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(28);
            
            const textLines = doc.splitTextToSize(truth.toUpperCase(), imgWidth - 40);
            doc.text(textLines, pageWidth / 2, textYPos + textBoxHeight / 2, { align: 'center', baseline: 'middle' });
        }
    }

    console.log('PDF created.');
    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);

    outputContainer.innerHTML = `
        <div class="output-button-group">
            <a href="${pdfUrl}" target="_blank" role="button" class="preview-btn">Preview PDF</a>
            <a href="${pdfUrl}" download="dark-truths.pdf" role="button" class="download-btn">Download PDF</a>
        </div>
    `;
    outputContainer.style.display = 'block';
    loader.style.display = 'none';
}