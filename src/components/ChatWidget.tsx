'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { MessageSquare, X, Send, Bot, User, Sparkles, ArrowRight } from 'lucide-react';
import { Badge } from './Badge';
import { refreshAccessToken } from '@/lib/api';

interface NavigateAction {
  type: 'navigate';
  path: string;
  label: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  action?: NavigateAction;
}

export function formatMessage(content: string) {
  if (!content) return null;

  // Split by code blocks first
  const blocks = content.split(/(```[\s\S]*?```)/g);

  return blocks.map((block, i) => {
    if (block.startsWith('```')) {
      const match = block.match(/```(\w*)\n([\s\S]*?)```/);
      const language = match ? match[1] : '';
      const code = match ? match[2] : block.slice(3, -3);
      return (
        <pre 
          key={i} 
          className="bg-neutral-900 dark:bg-neutral-950 text-neutral-100 p-3 rounded-xl font-mono text-[10px] my-2 overflow-x-auto border border-neutral-800 shadow-inner"
        >
          {language && (
            <div className="text-[8px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5 border-b border-neutral-800 pb-1 flex justify-between items-center">
              <span>{language}</span>
              <span className="text-[7px] text-neutral-600">code block</span>
            </div>
          )}
          <code>{code.trim()}</code>
        </pre>
      );
    }

    // Process bold, inline code, and line breaks
    const lines = block.split('\n');
    return (
      <div key={i} className="space-y-1">
        {lines.map((line, lineIdx) => {
          // Check if it's a bullet point
          const isBullet = line.trim().startsWith('- ') || line.trim().startsWith('* ');
          const bulletStripped = isBullet ? line.trim().slice(2) : line;
          // Defensive cleanup: the model is instructed never to emit markdown
          // links (navigate_to_page is the only link mechanism), but if one
          // leaks through, show the label instead of raw [label](url) syntax.
          const cleanLine = bulletStripped.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

          // Parse inline code `code`
          const parts = cleanLine.split(/(`[^`]+`)/g);
          const lineContent = parts.map((part, partIdx) => {
            if (part.startsWith('`') && part.endsWith('`')) {
              return (
                <code 
                  key={partIdx} 
                  className="bg-neutral-100 dark:bg-neutral-805 text-primary dark:text-indigo-400 px-1 py-0.5 rounded font-mono text-[10px]"
                >
                  {part.slice(1, -1)}
                </code>
              );
            }
            
            // Parse bold **text**
            const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
            return boldParts.map((bp, bpIdx) => {
              if (bp.startsWith('**') && bp.endsWith('**')) {
                return (
                  <strong key={bpIdx} className="font-extrabold text-text-primary">
                    {bp.slice(2, -2)}
                  </strong>
                );
              }
              return bp;
            });
          });

          if (isBullet) {
            return (
              <div key={lineIdx} className="flex items-start gap-1.5 pl-2 my-0.5">
                <span className="w-1.5 h-1.5 bg-primary rounded-full mt-1.5 shrink-0" />
                <span className="flex-1">{lineContent}</span>
              </div>
            );
          }

          return <p key={lineIdx}>{lineContent}</p>;
        })}
      </div>
    );
  });
}

export function ChatWidget() {
  const { user } = useAuth();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  if (!user) return null;

  const role = user.role;

  // Role-aware starter questions
  const starterQuestions = {
    student: [
      'What assignments do I have due?',
      'What are my current grades?',
      'How do I submit an assignment?',
    ],
    teacher: [
      'How many students are in my classes?',
      "Which assignments haven't been graded yet?",
      'How do I publish an assignment?',
    ],
    admin: [
      'How many users are on the platform?',
      'Are any teachers currently suspended?',
      'Show me platform stats',
    ],
  }[role] || [];

  // The access token is short-lived (~15min); every other request in the app
  // recovers from an expired token via apiCall's refresh-and-retry logic
  // (src/lib/api.ts). This fetch is a raw SSE stream (not JSON), so it can't
  // reuse apiCall directly, but it still needs the same recovery - otherwise
  // a chat sent after the token expires just fails with a generic
  // "trouble connecting" error instead of transparently refreshing.
  const fetchChatStream = async (text: string, isRetry = false): Promise<Response> => {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: text,
        conversationHistory: messages.slice(-10), // Send last 10 messages for context
      }),
    });

    if (response.status === 401 && !isRetry && (await refreshAccessToken())) {
      return fetchChatStream(text, true);
    }

    return response;
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isStreaming) return;

    const userMessage: Message = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);

    // Temp message structure to append assistant tokens
    let assistantMessageText = '';
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const response = await fetchChatStream(text);

      if (!response.ok) {
        if (response.status === 429) {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: 'assistant',
              content: 'Rate limit exceeded. Please wait a moment and try again.',
            };
            return updated;
          });
          setIsStreaming(false);
          return;
        }
        throw new Error('Chat API returned error');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const cleaned = line.trim();
          if (!cleaned) continue;
          if (cleaned === 'data: [DONE]') continue;

          if (cleaned.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(cleaned.slice(6));
              const token = parsed.content;
              const action = parsed.action as NavigateAction | undefined;
              if (token) {
                assistantMessageText += token;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    role: 'assistant',
                    content: assistantMessageText,
                  };
                  return updated;
                });
              } else if (action) {
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    action,
                  };
                  return updated;
                });
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      console.error('Chat stream failed:', err);
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: "I'm having trouble connecting right now. Please try again in a moment.",
        };
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end">
      {/* Chat Window Panel */}
      {isOpen && (
        <div className="mb-4 w-[calc(100vw-2rem)] max-w-[380px] sm:w-[400px] h-[520px] max-h-[70vh] bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slideUp">
          {/* Header */}
          <div className="p-4 bg-gradient-to-r from-violet-600 via-indigo-600 to-pink-500 text-white flex justify-between items-center shrink-0 shadow-[0_4px_20px_rgba(99,102,241,0.35)] relative overflow-hidden">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="h-9 w-9 rounded-xl bg-white/10 flex items-center justify-center border border-white/20 shadow-sm">
                  <Sparkles className="h-5 w-5 text-warning animate-pulse" />
                </div>
                <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-white">
                  <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
                </span>
              </div>
              <div>
                <h3 className="font-black text-sm tracking-tight flex items-center gap-1.5">
                  Concentrate AI
                </h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Badge variant={role === 'admin' ? 'danger' : role === 'teacher' ? 'info' : 'success'} className="text-[8px] px-1.5 py-0 uppercase">
                    {role}
                  </Badge>
                  <span className="text-[8px] px-1 bg-white/20 text-white rounded font-extrabold uppercase">Beta</span>
                </div>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-background dark:bg-dark-bg/20">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-4 space-y-4">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 animate-bounce">
                  <Bot className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <p className="font-bold text-text-primary text-sm">Hello, {user.name}!</p>
                  <p className="text-xs text-text-tertiary mt-1.5 font-medium leading-relaxed max-w-[280px]">
                    I&apos;m your platform assistant. Ask me questions about deadlines, performance metrics, system status, or use a shortcut below:
                  </p>
                </div>
                
                {/* Suggestions List */}
                <div className="w-full space-y-2 mt-3 animate-fadeIn">
                  <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider text-left pl-1">Suggested prompts</p>
                  {starterQuestions.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(q)}
                      disabled={isStreaming}
                      className="w-full text-left text-xs p-3 bg-surface dark:bg-dark-surface hover:bg-primary-soft/20 dark:hover:bg-primary-soft/10 border border-border dark:border-dark-border rounded-xl font-bold text-text-secondary hover:text-primary transition-all transform hover:translate-x-1 shadow-sm duration-200"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((m, idx) => (
                  <div 
                    key={idx} 
                    className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {m.role !== 'user' && (
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20 shadow-sm">
                        <Bot className="h-4.5 w-4.5 text-primary" />
                      </div>
                    )}
                    <div 
                      className={`p-3 rounded-2xl max-w-[80%] text-xs font-semibold leading-relaxed shadow-sm ${
                        m.role === 'user' 
                          ? 'bg-primary text-primary-foreground rounded-tr-none' 
                          : 'bg-surface dark:bg-dark-surface text-text-primary border border-border dark:border-dark-border rounded-tl-none'
                      }`}
                    >
                      {m.content ? (
                        formatMessage(m.content)
                      ) : (
                        <div className="flex items-center gap-1.5 py-1">
                          <span className="w-1.5 h-1.5 bg-text-tertiary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 bg-text-tertiary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 bg-text-tertiary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      )}
                      {m.action && (
                        <button
                          onClick={() => router.push(m.action!.path)}
                          className="mt-2 flex items-center gap-1 text-[11px] font-bold text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-lg px-2.5 py-1.5 transition-colors"
                        >
                          {m.action.label}
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    {m.role === 'user' && (
                      <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-sm">
                        <User className="h-4 w-4 text-white" />
                      </div>
                    )}
                  </div>
                ))}
                {isStreaming && messages[messages.length - 1]?.content && (
                  <div className="text-[10px] text-text-tertiary font-bold pl-10">
                    Assistant is typing...
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Form Input */}
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage(input);
            }}
            className="p-3 bg-surface dark:bg-dark-surface border-t border-border dark:border-dark-border flex gap-2 shrink-0"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question..."
              disabled={isStreaming}
              className="flex-1 bg-background dark:bg-dark-bg/25 border border-border dark:border-dark-border rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-primary/50 text-text-primary placeholder:text-text-tertiary font-semibold shadow-inner"
            />
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="p-2.5 bg-primary text-primary-foreground hover:bg-primary/95 disabled:opacity-50 rounded-xl transition-all shadow-sm shrink-0 flex items-center justify-center"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}

      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="h-14 w-14 rounded-full bg-gradient-to-r from-primary to-indigo-600 text-primary-foreground shadow-2xl flex items-center justify-center hover:scale-105 transition-all focus:outline-none hover:shadow-primary/25 hover:shadow-lg"
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
      </button>
    </div>
  );
}
