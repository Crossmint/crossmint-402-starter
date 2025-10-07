// Simple intent detection for conversational UI

export interface Intent {
  type: 'connect' | 'list' | 'store' | 'retrieve' | 'help' | 'status' | 'unknown';
  confidence: number;
  extractedData?: {
    secretId?: string;
    amount?: string;
  };
}

export function detectIntent(message: string): Intent {
  const lowerMessage = message.toLowerCase().trim();

  // Connect intent
  if (/^(connect|start|begin|setup|init)$/.test(lowerMessage)) {
    return { type: 'connect', confidence: 1.0 };
  }

  // List secrets intent
  if (/(list|show|view|get|display).*(secret|all)/.test(lowerMessage) || lowerMessage === 'list') {
    return { type: 'list', confidence: 0.9 };
  }

  // Store secret intent
  if (/(store|save|add|create).*(secret|key)/.test(lowerMessage)) {
    return { type: 'store', confidence: 0.9 };
  }

  // Retrieve secret intent
  if (/(retrieve|get|fetch|show).*(secret)/.test(lowerMessage)) {
    // Try to extract secret ID
    const secretIdMatch = lowerMessage.match(/([a-f0-9-]{36})/);
    if (secretIdMatch) {
      return {
        type: 'retrieve',
        confidence: 0.95,
        extractedData: { secretId: secretIdMatch[1] }
      };
    }
    return { type: 'retrieve', confidence: 0.8 };
  }

  // Help intent
  if (/(help|what|how|commands?)/.test(lowerMessage)) {
    return { type: 'help', confidence: 0.9 };
  }

  // Status intent
  if (/(status|info|wallet|balance)/.test(lowerMessage)) {
    return { type: 'status', confidence: 0.8 };
  }

  return { type: 'unknown', confidence: 0.0 };
}

export function getSuggestedActions(mcpConnected: boolean, hasSecrets: boolean): string[] {
  if (!mcpConnected) {
    return ['connect', 'help'];
  }

  if (hasSecrets) {
    return ['list secrets', 'store a secret', 'wallet status'];
  }

  return ['store a secret', 'wallet status', 'help'];
}
