import ChatInput from '../ChatInput';

export default function ChatInputExample() {
  return (
    <div className="bg-background">
      <ChatInput
        onSend={(message) => console.log('Message sent:', message)}
        placeholder="Type your message..."
      />
    </div>
  );
}
