import { useState, KeyboardEvent } from "react";

interface ChatInputProps {
  onSend: (message: string) => void;
  suggestedActions?: string[];
  disabled?: boolean;
}

export function ChatInput({ onSend, suggestedActions = [], disabled = false }: ChatInputProps) {
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (input.trim() && !disabled) {
      onSend(input.trim());
      setInput("");
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestion = (suggestion: string) => {
    onSend(suggestion);
  };

  return (
    <div className="chat-input-container">
      <div className="chat-input-wrapper">
        <input
          type="text"
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type a message... (e.g., 'connect', 'list secrets', 'help')"
          disabled={disabled}
        />
        <button
          className="chat-send-btn"
          onClick={handleSend}
          disabled={disabled || !input.trim()}
        >
          Send
        </button>
      </div>

      {suggestedActions.length > 0 && (
        <div className="suggested-actions">
          {suggestedActions.map((action, idx) => (
            <button
              key={idx}
              className="suggested-action"
              onClick={() => handleSuggestion(action)}
              disabled={disabled}
            >
              {action}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
