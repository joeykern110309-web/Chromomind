import { useState, useRef, useEffect } from "react";
import { Plus, Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ChatMessage from "@/components/ChatMessage";
import ConversationCard from "@/components/ConversationCard";
import ChatInput from "@/components/ChatInput";
import TypingIndicator from "@/components/TypingIndicator";
import EmptyState from "@/components/EmptyState";
import ThemeToggle from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
}

export default function Chat() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([
    {
      id: "1",
      title: "Neural Networks Explained",
      messages: [
        {
          id: "m1",
          role: "user",
          content: "Hello! Can you help me understand how neural networks work?",
          timestamp: "2:45 PM",
        },
        {
          id: "m2",
          role: "assistant",
          content:
            "Of course! Neural networks are computing systems inspired by biological neural networks. They consist of interconnected nodes (neurons) organized in layers that process information through weighted connections. Would you like me to explain a specific aspect in more detail?",
          timestamp: "2:45 PM",
        },
      ],
      createdAt: new Date(),
    },
    {
      id: "2",
      title: "JavaScript Tips",
      messages: [
        {
          id: "m3",
          role: "user",
          content: "What are some advanced JavaScript tips?",
          timestamp: "Yesterday",
        },
        {
          id: "m4",
          role: "assistant",
          content:
            "Here are some advanced JavaScript tips:\n\n1. Use optional chaining (?.) for safer property access\n2. Leverage destructuring for cleaner code\n3. Master async/await for asynchronous operations\n4. Use Array methods like map, filter, and reduce\n5. Understand closures and their practical applications",
          timestamp: "Yesterday",
        },
      ],
      createdAt: new Date(Date.now() - 86400000),
    },
  ]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>("1");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeConversation?.messages, isTyping]);

  const handleNewConversation = () => {
    const newConversation: Conversation = {
      id: Date.now().toString(),
      title: "New Conversation",
      messages: [],
      createdAt: new Date(),
    };
    setConversations([newConversation, ...conversations]);
    setActiveConversationId(newConversation.id);
  };

  const handleDeleteConversation = (id: string) => {
    setConversations(conversations.filter((c) => c.id !== id));
    if (activeConversationId === id) {
      setActiveConversationId(conversations[0]?.id || null);
    }
  };

  const handleSendMessage = (content: string) => {
    if (!activeConversationId) {
      handleNewConversation();
    }

    const currentConvId = activeConversationId || Date.now().toString();
    const newMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
      timestamp: new Date().toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      }),
    };

    setConversations((prev) =>
      prev.map((conv) => {
        if (conv.id === currentConvId) {
          const updatedMessages = [...conv.messages, newMessage];
          return {
            ...conv,
            messages: updatedMessages,
            title: conv.messages.length === 0 ? content.slice(0, 50) : conv.title,
          };
        }
        return conv;
      })
    );

    setIsTyping(true);
    setTimeout(() => {
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content:
          "This is a demo response. In the full application, this will be replaced with real AI responses from OpenAI's API. The chatbot will provide intelligent, context-aware answers based on the conversation history.",
        timestamp: new Date().toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        }),
      };

      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id === currentConvId) {
            return {
              ...conv,
              messages: [...conv.messages, aiResponse],
            };
          }
          return conv;
        })
      );
      setIsTyping(false);
    }, 1500);
  };

  const handlePromptClick = (prompt: string) => {
    handleSendMessage(prompt);
  };

  const filteredConversations = conversations.filter((conv) =>
    conv.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getConversationTimestamp = (conv: Conversation) => {
    const now = new Date();
    const diff = now.getTime() - conv.createdAt.getTime();
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    return conv.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-80 bg-sidebar border-r border-sidebar-border transform transition-transform duration-200 lg:relative lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
        data-testid="sidebar"
      >
        <div className="flex flex-col h-full">
          <div className="p-4 space-y-4 border-b border-sidebar-border">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-sidebar-foreground">Conversations</h2>
              <Button
                size="icon"
                variant="ghost"
                className="lg:hidden"
                onClick={() => setSidebarOpen(false)}
                data-testid="button-close-sidebar"
              >
                <Menu className="w-5 h-5" />
              </Button>
            </div>

            <Button
              className="w-full justify-start gap-2"
              onClick={handleNewConversation}
              data-testid="button-new-conversation"
            >
              <Plus className="w-4 h-4" />
              New Conversation
            </Button>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search conversations..."
                className="pl-9 bg-sidebar-accent border-sidebar-border"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredConversations.map((conv) => (
              <ConversationCard
                key={conv.id}
                id={conv.id}
                title={conv.title}
                preview={conv.messages[conv.messages.length - 1]?.content || "No messages yet"}
                timestamp={getConversationTimestamp(conv)}
                isActive={activeConversationId === conv.id}
                onClick={() => setActiveConversationId(conv.id)}
                onDelete={() => handleDeleteConversation(conv.id)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-border bg-background/95 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Button
              size="icon"
              variant="ghost"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
              data-testid="button-open-sidebar"
            >
              <Menu className="w-5 h-5" />
            </Button>
            <h1 className="text-lg font-semibold text-foreground">
              {activeConversation?.title || "AI Chatbot"}
            </h1>
          </div>
          <ThemeToggle />
        </header>

        <main className="flex-1 overflow-y-auto">
          {activeConversation && activeConversation.messages.length > 0 ? (
            <div className="max-w-4xl mx-auto p-6">
              {activeConversation.messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  role={message.role}
                  content={message.content}
                  timestamp={message.timestamp}
                />
              ))}
              {isTyping && <TypingIndicator />}
              <div ref={messagesEndRef} />
            </div>
          ) : (
            <EmptyState onPromptClick={handlePromptClick} />
          )}
        </main>

        <ChatInput
          onSend={handleSendMessage}
          disabled={isTyping}
          placeholder="Type your message..."
        />
      </div>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          data-testid="sidebar-overlay"
        />
      )}
    </div>
  );
}
