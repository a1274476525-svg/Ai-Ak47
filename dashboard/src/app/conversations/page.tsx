'use client';

import useSWR from 'swr';
import { useState } from 'react';
import { api } from '@/lib/api';
import type { Conversation, Message } from '@/lib/types';
import { BookOpen, MessageSquare, ChevronRight, Bot, User, Copy, Check, Search } from 'lucide-react';
import { clsx } from 'clsx';

function timeAgo(date: string | null): string {
  if (!date) return '—';
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60)   return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="opacity-0 group-hover:opacity-100 p-1 text-slate-600 hover:text-slate-300 transition-all"
    >
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
    </button>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <div className={clsx('flex gap-3 group', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div className={clsx(
        'w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-1',
        isUser ? 'bg-blue-600' : 'bg-slate-700',
      )}>
        {isUser ? <User size={13} className="text-white" /> : <Bot size={13} className="text-slate-300" />}
      </div>
      <div className={clsx('max-w-[80%] space-y-1', isUser ? 'items-end' : 'items-start')}>
        <div className={clsx(
          'rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
          isUser
            ? 'bg-blue-600 text-white rounded-tr-sm'
            : 'bg-[#161b27] text-slate-200 rounded-tl-sm border border-[#1e2535]',
        )}>
          {msg.content}
        </div>
        <div className={clsx(
          'flex items-center gap-2 text-[10px] text-slate-600',
          isUser ? 'justify-end' : 'justify-start',
        )}>
          {msg.model && <span>{msg.model}</span>}
          {(msg.tokens_in > 0 || msg.tokens_out > 0) && (
            <span>{msg.tokens_in}↑ {msg.tokens_out}↓</span>
          )}
          <span>{new Date(msg.created_at).toLocaleTimeString()}</span>
          <CopyButton text={msg.content} />
        </div>
      </div>
    </div>
  );
}

export default function ConversationsPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch]     = useState('');

  const { data: convs, isLoading } = useSWR<Conversation[]>(
    ['conversations', search],
    () => api.conversations.list(30, search || undefined) as Promise<Conversation[]>,
    { refreshInterval: 10000 },
  );

  const { data: messages, isLoading: loadMsgs } = useSWR<Message[]>(
    selected ? ['messages', selected] : null,
    () => api.conversations.messages(selected!) as Promise<Message[]>,
  );

  const selectedConv = convs?.find(c => c.id === selected);

  return (
    <div className="min-h-screen bg-[#0a0d14] text-white flex flex-col">
      {/* Header */}
      <div className="border-b border-[#1e2535] bg-[#0f1117] px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
            <BookOpen size={16} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Conversations</h1>
            <p className="text-xs text-slate-500">{convs?.length ?? 0} conversations · chat history</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Conversation list */}
        <div className="w-72 border-r border-[#1e2535] bg-[#0f1117] flex flex-col overflow-y-auto">
          <div className="relative px-3 py-2.5 border-b border-[#1e2535] shrink-0">
            <Search size={12} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="w-full bg-[#0a0d14] border border-[#1e2535] rounded-lg pl-7 pr-3 py-1.5 text-xs text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none"
            />
          </div>
          {isLoading && (
            <div className="p-6 text-center text-slate-500 text-sm">Loading…</div>
          )}
          {!isLoading && !convs?.length && (
            <div className="p-6 text-center text-slate-500 text-sm">No conversations yet</div>
          )}
          {convs?.map(conv => (
            <button
              key={conv.id}
              onClick={() => setSelected(conv.id)}
              className={clsx(
                'w-full text-left px-4 py-3.5 border-b border-[#1e2535] transition-colors',
                selected === conv.id
                  ? 'bg-blue-600/10 border-l-2 border-l-blue-500'
                  : 'hover:bg-white/[0.02]',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-slate-200 truncate flex-1">{conv.title || 'Untitled'}</p>
                <ChevronRight size={13} className="text-slate-600 shrink-0 mt-0.5" />
              </div>
              <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                <MessageSquare size={10} />
                <span>{conv.message_count} msgs</span>
                <span>·</span>
                <span>{timeAgo(conv.last_message_at)}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Messages view */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-slate-600">
              <div className="text-center space-y-2">
                <MessageSquare size={32} className="mx-auto opacity-30" />
                <p className="text-sm">Select a conversation</p>
              </div>
            </div>
          ) : (
            <>
              {/* Conv header */}
              <div className="px-6 py-3 border-b border-[#1e2535] shrink-0">
                <p className="text-sm font-medium text-white">{selectedConv?.title || 'Conversation'}</p>
                <p className="text-xs text-slate-500">{messages?.length ?? 0} messages</p>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {loadMsgs && (
                  <div className="text-center text-slate-500 text-sm py-10">Loading messages…</div>
                )}
                {messages?.map(msg => (
                  <MessageBubble key={msg.id} msg={msg} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
