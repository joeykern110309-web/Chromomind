import ConversationCard from '../ConversationCard';

export default function ConversationCardExample() {
  return (
    <div className="p-6 bg-sidebar w-80 space-y-2">
      <ConversationCard
        id="1"
        title="Neural Networks Explained"
        preview="Of course! Neural networks are computing..."
        timestamp="2:45 PM"
        isActive={true}
        onClick={() => console.log('Conversation 1 clicked')}
        onDelete={() => console.log('Delete conversation 1')}
      />
      <ConversationCard
        id="2"
        title="JavaScript Tips"
        preview="Here are some advanced JavaScript..."
        timestamp="Yesterday"
        onClick={() => console.log('Conversation 2 clicked')}
        onDelete={() => console.log('Delete conversation 2')}
      />
      <ConversationCard
        id="3"
        title="Recipe for Pasta"
        preview="I'd be happy to share a delicious..."
        timestamp="Mon"
        onClick={() => console.log('Conversation 3 clicked')}
        onDelete={() => console.log('Delete conversation 3')}
      />
    </div>
  );
}
