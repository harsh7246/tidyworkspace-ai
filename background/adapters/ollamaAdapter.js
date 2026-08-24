export async function queryOllama(prompt, systemPrompt) {
  // Ollama's default local API endpoint
  const url = 'http://localhost:11434/v1/chat/completions';

  const requestBody = {
    model: 'deepseek-coder:1.3b', // Or whatever model you downloaded
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.0
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
    
  } catch (error) {
    console.error("Local model failed. Is Ollama running?", error);
    throw error;
  }
}
