import OpenAI from 'openai'

export function createClient(baseUrl: string, apiKey: string): OpenAI {
  return new OpenAI({
    baseURL: baseUrl,
    apiKey: apiKey
  })
}

export async function testConnection(
  baseUrl: string,
  apiKey: string,
  model: string
): Promise<boolean> {
  try {
    const client = createClient(baseUrl, apiKey)
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 1
    })
    return response.choices.length > 0
  } catch {
    return false
  }
}
