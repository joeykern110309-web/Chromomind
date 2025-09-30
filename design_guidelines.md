# Design Guidelines: Advanced AI Chatbot with Spotify-Inspired Interface

## Design Approach: Reference-Based (Spotify-Inspired)

**Primary Reference**: Spotify's modern, dark-first design system with vibrant accent colors, smooth transitions, and content-focused layouts.

**Key Design Principles**:
- Dark mode primary with high contrast for readability
- Vibrant green accent color for primary actions
- Clean, uncluttered interface with breathing room
- Smooth, subtle animations for state changes
- Content takes center stage with minimal chrome

---

## Core Design Elements

### A. Color Palette

**Dark Mode (Primary)**:
- Background Primary: 18 10% 8% (Deep charcoal)
- Background Secondary: 0 0% 12% (Card/elevated surfaces)
- Background Tertiary: 0 0% 16% (Hover states, inputs)
- Text Primary: 0 0% 98% (Main text)
- Text Secondary: 0 0% 64% (Metadata, timestamps)
- Text Tertiary: 0 0% 48% (Subtle hints)

**Accent Colors**:
- Primary (Spotify Green): 141 76% 48%
- Primary Hover: 141 76% 42%
- Success: 142 71% 45%
- Warning: 45 93% 47%
- Error: 0 72% 51%

**Light Mode (Secondary)**:
- Background: 0 0% 98%
- Surface: 0 0% 100%
- Text Primary: 0 0% 10%
- Text Secondary: 0 0% 40%

### B. Typography

**Font Families**:
- Primary: 'Inter', system-ui, sans-serif (UI elements, chat messages)
- Monospace: 'JetBrains Mono', monospace (code snippets, technical content)

**Type Scale**:
- Display: text-4xl font-bold (32px) - Main headings
- Heading: text-2xl font-semibold (24px) - Section titles
- Subheading: text-lg font-medium (18px) - Conversation titles
- Body: text-base (16px) - Chat messages
- Small: text-sm (14px) - Timestamps, metadata
- Tiny: text-xs (12px) - Labels, hints

### C. Layout System

**Spacing Primitives**: Use Tailwind units of 2, 4, 6, 8, 12, 16 for consistent rhythm
- Component padding: p-4 or p-6
- Section spacing: gap-8 or gap-12
- Icon sizes: w-5 h-5 (20px) for inline, w-6 h-6 (24px) for standalone

**Layout Structure**:
- Sidebar: Fixed 280px width (w-70) with conversation history
- Main chat area: Flex-1 with max-w-4xl constraint for optimal reading
- Header: Sticky 64px height with backdrop blur
- Bottom input: Fixed positioning with elevated shadow

### D. Component Library

**Navigation Sidebar**:
- Dark background (bg-[#0a0a0a])
- Rounded conversation cards with hover states
- Active conversation highlighted with green left border (border-l-4 border-green-500)
- New chat button prominent at top with green gradient
- Conversation list scrollable with custom styled scrollbar

**Chat Interface**:
- Messages alternate alignment (user: right, AI: left)
- User messages: Green gradient background (from-green-600 to-green-700)
- AI messages: Dark elevated surface (bg-zinc-800/50)
- Avatar circles: 40px with user/AI differentiation
- Timestamp below each message in subtle gray

**Input Area**:
- Multi-line textarea with smooth expansion (max 6 lines)
- Send button: Green circular button with paper plane icon
- Floating above chat with subtle shadow and blur backdrop
- Attachment and options buttons flanking input

**Conversation Cards**:
- Rounded-lg with hover lift effect (hover:translate-y-[-2px])
- Preview of last message truncated with ellipsis
- Timestamp in top-right corner
- Delete/edit actions on hover (subtle icons)

**Loading States**:
- Typing indicator: Three animated dots in AI message bubble
- Pulse animation for conversation loading
- Skeleton screens for initial load

### E. Animations

**Subtle & Purpose-Driven**:
- Message appearance: Fade in + slide up (duration-200)
- Sidebar hover: Translate-y-[-2px] + shadow change (duration-150)
- Button interactions: Scale-95 on active (duration-100)
- Typing indicator: Staggered bounce animation
- **No** complex scroll animations or parallax effects

---

## Images

**No hero image required** - This is a utility application focused on chat functionality.

**Avatar System**:
- User avatar: Circular, 40px, can use user initials with green background gradient
- AI avatar: Circular, 40px, use a simple bot icon or gradient with sparkle effect
- Sidebar avatars: 32px for conversation list

**Empty States**:
- Initial screen (no conversations): Centered illustration placeholder with gradient background
- Suggested prompts as cards to start conversation
- Simple vector-style illustration in muted tones

---

## Layout Specifications

**Desktop Layout** (1280px+):
- Sidebar: 280px fixed left
- Chat area: Flex-1 with max-w-4xl centered
- Input bar: Full width of chat area, sticky bottom

**Tablet Layout** (768px - 1279px):
- Sidebar: Collapsible drawer (toggle button)
- Chat area: Full width
- Input bar: Full width

**Mobile Layout** (<768px):
- Sidebar: Slide-over drawer from left
- Chat area: Full viewport width
- Input bar: Sticky bottom with reduced padding
- Hide timestamps on very small screens

---

## Interaction Patterns

**Conversation Management**:
- Click conversation in sidebar to load
- Long press/right-click for options menu (rename, delete)
- Cmd/Ctrl + K for quick search conversations

**Message Sending**:
- Enter to send, Shift + Enter for new line
- Auto-scroll to bottom on new message
- Smooth scroll animation (duration-300)

**Visual Feedback**:
- Button states: Default → Hover (lighter) → Active (scale down)
- Message sent confirmation: Checkmark fade in
- Error states: Red border pulse on input

---

## Accessibility

- High contrast ratio (4.5:1 minimum) for all text
- Focus indicators: Green outline (ring-2 ring-green-500)
- Keyboard navigation for all interactive elements
- ARIA labels for icon-only buttons
- Screen reader announcements for new messages

---

This Spotify-inspired design creates a modern, engaging chat experience with strong visual hierarchy, smooth interactions, and professional polish while maintaining excellent usability for daily conversation management.