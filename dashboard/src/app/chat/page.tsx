'use client';

import { useState, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import { api, getToken } from '@/lib/api';
import type { ChatMessage } from '@/lib/types';
import { Send, Bot, User, Cpu, Zap, Trash2, Copy, Check, Paperclip, X, FileText } from 'lucide-react';

const TASK_TYPES = ['auto', 'coding', 'research', 'math', 'creative', 'general'];

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={clsx('flex gap-3 group', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      <div className={clsx(
        'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
        isUser ? 'bg-blue-600' : 'bg-[#1e2535]',
      )}>
        {isUser ? <User size={13} className="text-white" /> : <Bot size={13} className="text-slate-300" />}
      </div>

      {/* Bubble */}
      <div className={clsx('max-w-[75%] space-y-1', isUser ? 'items-end' : 'items-start', 'flex flex-col')}>
        <div className={clsx(
          'rounded-xl px-4 py-3 text-sm leading-relaxed',
          isUser
            ? 'bg-blue-600 text-white rounded-tr-none'
            : 'bg-[#161b27] border border-[#1e2535] text-slate-200 rounded-tl-none',
        )}>
          {/* Render code blocks */}
          {msg.content.split(/(```[\s\S]*?```)/g).map((part, i) => {
            if (part.startsWith('```')) {
              const lines = part.slice(3).split('\n');
              const lang = lines[0];
              const code = lines.slice(1, -1).join('\n');
              return (
                <div key={i} className="my-2 rounded-lg overflow-hidden border border-[#1e2535]">
                  {lang && (
                    <div className="flex items-center justify-between px-3 py-1.5 bg-[#0f1117] border-b border-[#1e2535]">
                      <span className="text-xs text-slate-500 font-mono">{lang}</span>
                      <button onClick={copy} className="text-xs text-slate-500 hover:text-white transition-colors">
                        {copied ? <Check size={11} /> : <Copy size={11} />}
                      </button>
                    </div>
                  )}
                  <pre className="p-3 bg-[#0a0d14] text-xs font-mono text-slate-300 overflow-x-auto">
                    <code>{code}</code>
                  </pre>
                </div>
              );
            }
            return <span key={i} className="whitespace-pre-wrap">{part}</span>;
          })}
        </div>

        {/* Meta */}
        {!isUser && (msg.model || msg.tokensIn) && (
          <div className="flex items-center gap-3 px-1">
            {msg.model && (
              <span className="flex items-center gap-1 text-[10px] text-slate-600">
                <Cpu size={9} />
                {msg.provider}/{msg.model}
              </span>
            )}
            {msg.tokensIn != null && (
              <span className="flex items-center gap-1 text-[10px] text-slate-600">
                <Zap size={9} />
                {msg.tokensIn}↑ {msg.tokensOut}↓
              </span>
            )}
            {msg.durationMs != null && (
              <span className="text-[10px] text-slate-600">{msg.durationMs}ms</span>
            )}
            {msg.taskType && msg.taskType !== 'general' && (
              <span className="text-[10px] text-blue-500">{msg.taskType}</span>
            )}
            {msg.agentUsed && msg.agentUsed !== 'direct' && (
              <span className="text-[10px] text-purple-400">{msg.agentUsed}_agent</span>
            )}
            {msg.debateUsed && (
              <span className="text-[10px] text-yellow-400">⚡ debate</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-lg bg-[#1e2535] flex items-center justify-center shrink-0">
        <Bot size={13} className="text-slate-300" />
      </div>
      <div className="bg-[#161b27] border border-[#1e2535] rounded-xl rounded-tl-none px-4 py-3">
        <div className="flex gap-1 items-center h-4">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [taskType, setTaskType] = useState('auto');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [useDebate, setDebate]  = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Streaming applies to the plain conversational path only — debate mode and
  // explicit specialized task types (coding/research/etc.) use multi-step
  // agent orchestration that isn't compatible with token-by-token streaming.
  const canStream = !useDebate && (taskType === 'auto' || taskType === 'general');

  async function sendStreaming(text: string, history: { role: string; content: string }[]) {
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    const res = await fetch('/api/v1/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ message: text, history, task_type: taskType }),
    });
    if (!res.body) throw new Error('No response stream from server');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';

      for (const part of parts) {
        if (!part.startsWith('data: ')) continue;
        const json = JSON.parse(part.slice(6)) as {
          delta?: string; error?: string; done?: boolean;
          provider?: string; model?: string; tokens_in?: number; tokens_out?: number; duration_ms?: number;
        };
        if (json.error) throw new Error(json.error);
        if (json.delta) {
          setMessages(prev => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            copy[copy.length - 1] = { ...last, content: last.content + json.delta };
            return copy;
          });
        }
        if (json.done) {
          setMessages(prev => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            copy[copy.length - 1] = {
              ...last,
              provider: json.provider,
              model: json.model,
              tokensIn: json.tokens_in,
              tokensOut: json.tokens_out,
              durationMs: json.duration_ms,
              taskType,
            };
            return copy;
          });
        }
      }
    }
  }

  async function sendWithFile(text: string, history: { role: string; content: string }[], file: File) {
    const form = new FormData();
    form.append('message', text);
    form.append('history', JSON.stringify(history));
    form.append('taskType', taskType);
    form.append('file', file);

    const res = await fetch('/api/v1/chat/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: form,
    });
    const data = await res.json() as {
      content?: string; provider?: string; model?: string;
      tokensIn?: number; tokensOut?: number; durationMs?: number;
      taskType?: string; agentUsed?: string; debateUsed?: boolean; message?: string;
    };
    if (!res.ok) throw new Error(data.message ?? 'Upload failed');

    setMessages(prev => [...prev, {
      role: 'assistant',
      content: data.content ?? '',
      provider: data.provider,
      model: data.model,
      tokensIn: data.tokensIn,
      tokensOut: data.tokensOut,
      durationMs: data.durationMs,
      taskType: data.taskType,
      agentUsed: data.agentUsed,
      debateUsed: data.debateUsed,
    }]);
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setError('');
    const history = messages.map(m => ({ role: m.role, content: m.content }));
    const startLen = messages.length;
    const file = attachedFile;
    const userMsg: ChatMessage = { role: 'user', content: file ? `${text}\n\n📎 ${file.name}` : text };
    setMessages(prev => [...prev, userMsg]);
    setAttachedFile(null);
    setLoading(true);

    try {
      if (file) {
        await sendWithFile(text, history, file);
      } else if (canStream) {
        await sendStreaming(text, history);
      } else {
        const res = await api.chat.send({
          message: text,
          history,
          task_type: taskType,
          use_debate: useDebate,
        }) as {
          content: string; provider: string; model: string;
          tokensIn: number; tokensOut: number; durationMs: number;
          taskType: string; agentUsed: string; debateUsed: boolean;
        };

        setMessages(prev => [...prev, {
          role: 'assistant',
          content: res.content,
          provider: res.provider,
          model: res.model,
          tokensIn: res.tokensIn,
          tokensOut: res.tokensOut,
          durationMs: res.durationMs,
          taskType: res.taskType,
          agentUsed: res.agentUsed,
          debateUsed: res.debateUsed,
        }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
      // Roll back the user message and any partial assistant placeholder.
      setMessages(prev => prev.slice(0, startLen));
    } finally {
      setLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="max-w-4xl flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white">Chat</h1>
          <p className="text-slate-400 text-sm mt-1">Talk to AI OS — auto-routes to the best model</p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-400 transition-colors"
          >
            <Trash2 size={12} /> Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-5 pb-4 pr-2">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-blue-600/20 flex items-center justify-center">
              <Bot size={22} className="text-blue-400" />
            </div>
            <div>
              <p className="text-slate-300 font-medium">AI OS is ready</p>
              <p className="text-slate-500 text-sm mt-1">Ask anything — coding, research, math, or general questions</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {[
                'Write a Python async REST API with FastAPI',
                'Explain how LangGraph state machines work',
                'Design a PostgreSQL schema for a multi-tenant SaaS',
              ].map(s => (
                <button
                  key={s}
                  onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                  className="text-xs px-3 py-1.5 bg-[#161b27] border border-[#1e2535] hover:border-blue-500/50 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
        {loading && messages[messages.length - 1]?.role !== 'assistant' && <TypingIndicator />}
        {error && (
          <div className="text-red-400 text-xs px-4 py-2 bg-red-400/10 border border-red-400/20 rounded-lg">
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 bg-[#0f1117] border border-[#1e2535] rounded-xl p-3">
        {attachedFile && (
          <div className="flex items-center gap-2 mb-2 px-2.5 py-1.5 bg-[#161b27] border border-[#1e2535] rounded-lg w-fit">
            <FileText size={12} className="text-blue-400" />
            <span className="text-xs text-slate-300">{attachedFile.name}</span>
            <button onClick={() => setAttachedFile(null)} className="text-slate-500 hover:text-red-400">
              <X size={12} />
            </button>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) setAttachedFile(f);
            e.target.value = '';
          }}
        />
        <textarea
          ref={textareaRef}
          rows={3}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask anything… (Enter to send, Shift+Enter for new line)"
          className="w-full bg-transparent text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none leading-relaxed"
        />
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#1e2535]">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500">Mode:</span>
              <select
                value={taskType}
                onChange={e => setTaskType(e.target.value)}
                className="bg-[#161b27] border border-[#1e2535] rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
              >
                {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <button
              onClick={() => setDebate(d => !d)}
              className={clsx(
                'flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border transition-colors',
                useDebate
                  ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-400'
                  : 'bg-[#161b27] border-[#1e2535] text-slate-500 hover:text-slate-300',
              )}
              title="AI Debate — multiple models critique each other for better accuracy"
            >
              ⚡ Debate
            </button>
            {canStream && (
              <span className="text-[10px] text-green-500/70" title="Response streams token-by-token">
                ● live
              </span>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-[#1e2535] text-slate-500 hover:text-slate-300 disabled:opacity-40 transition-colors"
              title="Attach a text/code file (max 5MB)"
            >
              <Paperclip size={12} />
            </button>
          </div>
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <Send size={12} />
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
