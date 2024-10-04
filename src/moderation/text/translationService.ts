import axios from 'axios';

const TRANSLATE_API_URL = 'http://127.0.0.1:5000/translate';

export async function translateText(text: string, targetLanguage: string): Promise<string> {
  try {
    console.log('Texto a traducir:', text);
    console.log('Idioma objetivo:', targetLanguage);

    const response = await axios.post(
      TRANSLATE_API_URL,
      {
        q: text,
        source: 'auto',  // Detectar el idioma automáticamente
        target: targetLanguage,
        format: 'text'
      },
      {
        headers: { 'Content-Type': 'application/json' }  // Asegúrate de especificar los headers
      }
    );

    console.log('Respuesta de traducción:', response.data);

    return response.data.translatedText;
  } catch (error) {
    console.error('Error translating text:', error);
    throw new Error('Translation service unavailable');
  }
}

