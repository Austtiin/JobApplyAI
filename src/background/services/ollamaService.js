// Ollama service for local LLM communication

export class OllamaService {
  constructor(baseUrl = 'http://127.0.0.1:11434') {
    this.baseUrl = baseUrl;
  }

  /**
   * Generate text completion with Ollama
   */
  async generate(prompt, options = {}) {
    const defaultOptions = {
      model: 'llama3.2:3b',
      temperature: 0.7,
      max_tokens: 500
    };

    const config = { ...defaultOptions, ...options };

    try {
      console.log(`🔗 Ollama request to ${this.baseUrl}/api/generate`);
      console.log(`📝 Model: ${config.model}, Prompt length: ${prompt.length}`);
      
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: config.model,
          prompt: prompt,
          stream: false,
          options: {
            temperature: config.temperature,
            num_predict: config.max_tokens
          }
        })
      });

      console.log(`📡 Ollama response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Ollama error response: ${errorText}`);
        throw new Error(`Ollama request failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      console.log(`✅ Ollama response received: ${data.response?.substring(0, 100)}...`);
      return data.response;
    } catch (error) {
      console.error('❌ Ollama API error:', error);
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Chat completion (for conversation context)
   */
  async chat(messages, options = {}) {
    const defaultOptions = {
      model: 'llama3.2:3b',
      temperature: 0.3
    };

    const config = { ...defaultOptions, ...options };

    try {
      console.log(`💬 Ollama chat request to ${this.baseUrl}/api/chat`);
      console.log(`📝 Model: ${config.model}, Messages: ${messages.length}`);
      
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: config.model,
          messages: messages,
          stream: false,
          options: {
            temperature: config.temperature
          }
        })
      });

      console.log(`📡 Ollama chat response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Ollama chat error: ${errorText}`);
        throw new Error(`Ollama chat request failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      console.log(`✅ Chat response: ${data.message.content?.substring(0, 100)}...`);
      return data.message.content;
    } catch (error) {
      console.error('❌ Ollama chat API error:', error);
      throw error;
    }
  }

  /**
   * List available models
   */
  async listModels() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
        //temp could add status code here if needed
      }

      const data = await response.json();
      return data.models || [];
    } catch (error) {
      console.error('Failed to list Ollama models:', error);
      return [];
    }
  }

  /**
   * Check if Ollama is running
   */
  async isAvailable() {
    try {
      console.log(`🔍 Checking if Ollama is available at ${this.baseUrl}/api/tags`);
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET'
      });
      console.log(`📡 Ollama availability check status: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Ollama is available! Models:`, data.models?.map(m => m.name).join(', '));
        return true;
      } else {
        console.warn(`⚠️ Ollama responded but not OK: ${response.status}`);
        return false;
      }
    } catch (error) {
      console.error(`❌ Ollama not available:`, error.message);
      console.error('Error details:', error);
      return false;
    }
  }

  /**
   * Analyze form field with context
   */
  async analyzeFormField(field, userProfile, pageContext) {
    const prompt = this.buildFieldPrompt(field, userProfile, pageContext);
    const response = await this.generate(prompt, {
      temperature: 0.3, // Lower for more consistent results
      max_tokens: 300
      //temperature lower means less creative responses
    });
    
    return this.parseFieldAnalysis(response);
  }

  /**
   * Build prompt for field analysis
   */
  buildFieldPrompt(field, userProfile, pageContext) {
    return `Analyze this job application form field and suggest the best value.

Field: ${field.label || field.name}
Type: ${field.type}
Placeholder: ${field.placeholder || 'none'}

User Info:
${userProfile ? JSON.stringify(userProfile, null, 2) : 'No profile available'}

Context: ${pageContext.title}

Respond with JSON only:
{
  "category": "field type",
  "value": "suggested value or null",
  "confidence": "high/medium/low"
}`;
  }

  /**
   * Parse AI field analysis response
   */
  parseFieldAnalysis(response) {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Failed to parse field analysis:', error);
    }
    
    return {
      category: 'unknown',
      value: null,
      confidence: 'low'
    };
  }
}
