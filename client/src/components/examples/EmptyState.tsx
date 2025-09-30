import EmptyState from '../EmptyState';

export default function EmptyStateExample() {
  return (
    <div className="h-screen bg-background">
      <EmptyState onPromptClick={(prompt) => console.log('Prompt clicked:', prompt)} />
    </div>
  );
}
