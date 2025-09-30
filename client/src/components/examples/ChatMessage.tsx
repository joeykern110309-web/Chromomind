import ChatMessage from '../ChatMessage';

export default function ChatMessageExample() {
  return (
    <div className="p-6 bg-background space-y-4">
      <ChatMessage
        role="user"
        content="Hello! Can you help me understand how neural networks work?"
        timestamp="2:45 PM"
      />
      <ChatMessage
        role="assistant"
        content="Of course! Neural networks are computing systems inspired by biological neural networks. They consist of interconnected nodes (neurons) organized in layers that process information through weighted connections. Would you like me to explain a specific aspect in more detail?"
        timestamp="2:45 PM"
      />
    </div>
  );
}
