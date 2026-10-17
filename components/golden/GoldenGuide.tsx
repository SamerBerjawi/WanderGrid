import React, { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { PaperPlaneTilt, Sparkle } from '@/components/ui/hugeicons';
import { dataService } from '../../services/mockDb';
import { Trip } from '../../types';
import { GhCard } from './Gh';

interface ChatMessage { role: 'user' | 'model'; text: string }

// **bold** and line breaks as React elements, so trip data and AI output are never interpreted as HTML.
const ChatText: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split('\n').map((line, li) => (
      <React.Fragment key={li}>
        {li > 0 && <br />}
        {line.split(/\*\*(.*?)\*\*/g).map((part, pi) => (pi % 2 === 1 ? <strong key={pi}>{part}</strong> : part))}
      </React.Fragment>
    ))}
  </>
);

/** Golden Hour version of the NomadGuide chat. Same prompt and server call as the original. */
export const GoldenGuide: React.FC<{ trip: Trip }> = ({ trip }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{ role: 'model', text: `Hi! I'm your NomadGuide for **${trip.name}**. I know your itinerary for ${trip.location}. Ask me about local food, hidden gems, or packing tips!` }]);
    }
  }, [trip]);

  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [messages, loading]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);
    try {
      const context = `
        You are NomadGuide, an expert travel assistant.
        Current Trip Context:
        - Destination: ${trip.location}
        - Dates: ${trip.startDate} to ${trip.endDate}
        - Travelers: ${(trip.participants || []).length}
        - Itinerary Items: ${trip.transports?.length || 0} flights, ${trip.activities?.length || 0} activities.

        Answer the user's question concisely and helpfully. Focus on travel advice, logistics, and local recommendations.
        Format with Markdown.
      `;
      const reply = await dataService.generateAI([
        { role: 'user', text: context },
        ...messages.map(m => ({ role: m.role, text: m.text })),
        { role: 'user', text: userMsg },
      ]);
      setMessages(prev => [...prev, { role: 'model', text: reply || "I couldn't retrieve that info right now." }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'model', text: e?.message || 'Connection error. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <GhCard className="flex flex-col h-[70vh] min-h-[28rem] max-h-[40rem] !p-0 overflow-hidden">
      <div className="flex items-center gap-3 p-4 bg-sunset-lilac text-sunset-ink">
        <span className="w-12 h-12 rounded-full bg-sunset-sun flex items-center justify-center shrink-0"><Sparkle className="w-6 h-6" weight="duotone" /></span>
        <div>
          <h3 className="text-xl font-black leading-tight">NomadGuide</h3>
          <p className="text-sm font-semibold opacity-80">Ask anything about {trip.location || 'your trip'}</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={clsx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={clsx('max-w-[85%] px-4 py-3 rounded-3xl text-sm font-medium leading-relaxed', m.role === 'user' ? 'bg-sunset-coral text-white rounded-br-md' : 'bg-sunset-sand dark:bg-sunset-dusk text-sunset-ink dark:text-white rounded-bl-md')}>
              <ChatText text={m.text} />
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start" role="status" aria-label="NomadGuide is typing">
            <div className="px-4 py-3 rounded-3xl rounded-bl-md bg-sunset-sand dark:bg-sunset-dusk flex gap-1.5">
              <span className="w-2 h-2 rounded-full bg-sunset-coral animate-bounce" />
              <span className="w-2 h-2 rounded-full bg-sunset-sun animate-bounce delay-75" />
              <span className="w-2 h-2 rounded-full bg-sunset-teal animate-bounce delay-150" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="p-3 flex gap-2 bg-sunset-sand dark:bg-sunset-dusk">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Where should we eat?"
          aria-label="Message NomadGuide"
          className="flex-1 min-w-0 min-h-[48px] rounded-full px-5 text-base font-semibold bg-white dark:bg-sunset-plum text-sunset-ink dark:text-white placeholder:text-sunset-ink/40 dark:placeholder:text-white/40 outline-none focus:ring-2 focus:ring-sunset-coral"
        />
        <button
          type="button"
          onClick={send}
          disabled={!input.trim() || loading}
          aria-label="Send message to NomadGuide"
          className="w-12 h-12 shrink-0 rounded-full bg-sunset-coral text-white flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-transform"
        >
          <PaperPlaneTilt className="w-5 h-5" weight="bold" />
        </button>
      </div>
    </GhCard>
  );
};
