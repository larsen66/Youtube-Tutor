/**
 * Utility functions for working with Chrome's built-in AI Prompt API
 */

/**
 * JSON schemas for structured output using responseConstraint
 * These schemas enforce JSON output from the Prompt API
 */
export const schemas = {
  quizQuestions: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        type: { type: 'string' },
        options: {
          type: 'array',
          items: { type: 'string' }
        },
        correctAnswer: { type: 'string' },
        explanation: { type: 'string' }
      },
      required: ['question', 'type', 'correctAnswer', 'explanation']
    }
  },
  summary: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      keyTakeaways: {
        type: 'array',
        items: { type: 'string' }
      },
      topics: {
        type: 'array',
        items: { type: 'string' }
      }
    },
    required: ['summary', 'keyTakeaways', 'topics']
  },
  answerEvaluation: {
    type: 'object',
    properties: {
      isCorrect: { type: 'boolean' },
      feedback: { type: 'string' }
    },
    required: ['isCorrect', 'feedback']
  }
};

/**
 * Prompts the AI with responseConstraint for structured JSON output
 * Uses streaming for better UX
 */
export async function promptWithStructuredOutput(
  session: any,
  prompt: string,
  schema: any,
  options?: { signal?: AbortSignal }
): Promise<any> {
  try {
    // Use promptStreaming with responseConstraint
    const stream = await session.promptStreaming(prompt, {
      ...options,
      responseConstraint: schema
    });

    let fullResponse = '';
    for await (const chunk of stream) {
      fullResponse = String(chunk || '');
    }

    // With responseConstraint, the response IS the JSON - just parse it
    return JSON.parse(fullResponse);
  } catch (streamError: any) {
    console.warn('Streaming failed, trying regular prompt:', streamError);

    // Fallback to non-streaming with responseConstraint
    const response = await session.prompt(prompt, {
      ...options,
      responseConstraint: schema
    });

    return JSON.parse(String(response));
  }
}

/**
 * Validates quiz questions and ensures they have proper structure
 */
export function validateQuizQuestions(questions: any[]): boolean {
  if (!Array.isArray(questions) || questions.length === 0) {
    return false;
  }

  return questions.every((q) => {
    if (!q.question || !q.type || !q.correctAnswer) {
      return false;
    }

    if (q.type === 'multiple_choice') {
      if (!Array.isArray(q.options) || q.options.length !== 4) {
        return false;
      }
      // Check if correctAnswer matches one of the options
      if (!q.options.some((opt: string) => opt.toLowerCase().trim() === q.correctAnswer.toLowerCase().trim())) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Validates summary data structure
 */
export function validateSummary(data: any): boolean {
  if (!data || typeof data !== 'object') {
    return false;
  }

  if (!data.summary || typeof data.summary !== 'string') {
    return false;
  }

  if (!Array.isArray(data.keyTakeaways) || data.keyTakeaways.length < 3) {
    return false;
  }

  if (!Array.isArray(data.topics) || data.topics.length < 2) {
    return false;
  }

  return true;
}
