'use client';

import useSWR, { mutate } from 'swr';
import { useState } from 'react';
import { api } from '@/lib/api';
import type { Skill } from '@/lib/types';
import { Sparkles, RefreshCw, BookOpen, TrendingUp, AlertCircle, Cpu, ChevronDown, ChevronUp } from 'lucide-react';
import { clsx } from 'clsx';

interface EvalResult {
  tasks_evaluated: number;
  avg_score: number;
  patterns: string[];
  improvements: string[];
  meta_knowledge_stored: number;
  skills_updated: number;
}

const fetcher = () => api.autonomous.skills() as Promise<Skill[]>;

const CATEGORY_COLORS: Record<string, string> = {
  language:   'bg-blue-500/15 text-blue-400 border border-blue-500/20',
  framework:  'bg-purple-500/15 text-purple-400 border border-purple-500/20',
  ai_ml:      'bg-green-500/15 text-green-400 border border-green-500/20',
  devops:     'bg-orange-500/15 text-orange-400 border border-orange-500/20',
  auto_discovered: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20',
};

function levelColor(level: number) {
  if (level >= 80) return 'bg-green-500';
  if (level >= 60) return 'bg-blue-500';
  if (level >= 40) return 'bg-yellow-500';
  if (level >= 20) return 'bg-orange-500';
  return 'bg-red-500';
}

function SkillCard({ skill }: { skill: Skill }) {
  const gap = skill.target_level - skill.level;
  return (
    <div className="rounded-xl border border-[#1e2535] bg-[#0f1117] p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-white truncate">{skill.name}</h3>
          <span
            className={clsx(
              'inline-block text-[10px] px-1.5 py-0.5 rounded mt-1',
              CATEGORY_COLORS[skill.category] ?? 'bg-slate-700/50 text-slate-400 border border-slate-600/20',
            )}
          >
            {skill.category.replace('_', ' ')}
          </span>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold text-white">{skill.level.toFixed(0)}%</p>
          <p className="text-[10px] text-slate-500">target {skill.target_level.toFixed(0)}%</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="h-2 bg-[#1e2535] rounded-full overflow-hidden">
          <div
            className={clsx('h-full rounded-full transition-all duration-500', levelColor(skill.level))}
            style={{ width: `${Math.min(skill.level, 100)}%` }}
          />
        </div>
        {/* Target marker */}
        <div className="relative h-1">
          <div
            className="absolute top-0 w-0.5 h-2 bg-slate-500 rounded-full -translate-y-0.5"
            style={{ left: `${Math.min(skill.target_level, 100)}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px]">
        <span className={clsx('flex items-center gap-1', gap > 0 ? 'text-amber-400' : 'text-green-400')}>
          {gap > 0 ? (
            <><AlertCircle size={10} /> {gap.toFixed(0)}% gap</>
          ) : (
            <><TrendingUp size={10} /> At target</>
          )}
        </span>
        {skill.is_learning && (
          <span className="flex items-center gap-1 text-blue-400">
            <BookOpen size={10} /> Learning
          </span>
        )}
        <span className="text-slate-600">priority {skill.priority}</span>
      </div>
    </div>
  );
}

function CategorySection({ category, skills }: { category: string; skills: Skill[] }) {
  const avg = skills.reduce((s, k) => s + k.level, 0) / skills.length;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          {category.replace('_', ' ')}
        </h2>
        <span className="text-xs text-slate-500">{skills.length} skills · avg {avg.toFixed(0)}%</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {skills.map(s => <SkillCard key={s.id} skill={s} />)}
      </div>
    </div>
  );
}

export default function SkillsPage() {
  const { data: skills, isLoading, error } = useSWR<Skill[]>('skills', fetcher, { refreshInterval: 30000 });
  const [learning, setLearning]     = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [evaluating, setEval]       = useState(false);
  const [evalResult, setEvalRes]    = useState<EvalResult | null>(null);
  const [showEval, setShowEval]     = useState(false);

  async function triggerLearning() {
    setLearning(true);
    setLastResult(null);
    try {
      const res = await api.autonomous.learn({ max_skills: 2 }) as { results: Array<{ skill: string; summary: string }> };
      const summaries = res.results.map(r => `${r.skill}: ${r.summary}`).join('\n');
      setLastResult(summaries || 'No gaps found — all skills at target level');
      mutate('skills');
    } catch (e: unknown) {
      setLastResult(`Error: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setLearning(false);
    }
  }

  async function triggerEvaluation() {
    setEval(true);
    setEvalRes(null);
    try {
      const res = await api.autonomous.evaluate(20) as EvalResult;
      setEvalRes(res);
      setShowEval(true);
      mutate('skills');
    } catch (e: unknown) {
      setLastResult(`Eval error: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setEval(false);
    }
  }

  const grouped = (skills ?? []).reduce<Record<string, Skill[]>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  const totalGaps = (skills ?? []).filter(s => s.level < s.target_level).length;
  const avgLevel = skills?.length
    ? skills.reduce((s, k) => s + k.level, 0) / skills.length
    : 0;

  return (
    <div className="min-h-screen bg-[#0a0d14] text-white">
      {/* Header */}
      <div className="border-b border-[#1e2535] bg-[#0f1117] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-600/20 border border-purple-500/30 flex items-center justify-center">
              <Sparkles size={16} className="text-purple-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Skill Matrix</h1>
              <p className="text-xs text-slate-500">Autonomous learning progress</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {skills && (
              <div className="flex items-center gap-4 text-sm text-slate-400 mr-4">
                <span><span className="text-white font-medium">{skills.length}</span> skills</span>
                <span><span className="text-amber-400 font-medium">{totalGaps}</span> gaps</span>
                <span><span className="text-white font-medium">{avgLevel.toFixed(0)}%</span> avg</span>
              </div>
            )}
            <button
              onClick={triggerEvaluation}
              disabled={evaluating}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                evaluating
                  ? 'bg-orange-600/50 text-orange-300 cursor-not-allowed'
                  : 'bg-orange-600 hover:bg-orange-500 text-white',
              )}
            >
              {evaluating ? (
                <><RefreshCw size={14} className="animate-spin" /> Evaluating…</>
              ) : (
                <><Cpu size={14} /> Self-Evaluate</>
              )}
            </button>
            <button
              onClick={triggerLearning}
              disabled={learning}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                learning
                  ? 'bg-purple-600/50 text-purple-300 cursor-not-allowed'
                  : 'bg-purple-600 hover:bg-purple-500 text-white',
              )}
            >
              {learning ? (
                <><RefreshCw size={14} className="animate-spin" /> Learning…</>
              ) : (
                <><BookOpen size={14} /> Learn Now</>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-8">
        {/* Learning result banner */}
        {lastResult && (
          <div className="rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3 text-sm text-green-300 whitespace-pre-line">
            {lastResult}
          </div>
        )}

        {/* Evaluation result */}
        {evalResult && (
          <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-5 space-y-3">
            <button
              onClick={() => setShowEval(v => !v)}
              className="flex items-center justify-between w-full"
            >
              <div className="flex items-center gap-3">
                <Cpu size={16} className="text-orange-400" />
                <span className="text-sm font-medium text-orange-300">
                  Self-Evaluation Complete — Avg Score: {evalResult.avg_score.toFixed(0)}/100
                </span>
                <span className="text-xs text-orange-500">
                  ({evalResult.tasks_evaluated} tasks · {evalResult.skills_updated} skills updated)
                </span>
              </div>
              {showEval ? <ChevronUp size={14} className="text-orange-400" /> : <ChevronDown size={14} className="text-orange-400" />}
            </button>
            {showEval && (
              <div className="space-y-3 pt-2 border-t border-orange-500/20">
                {evalResult.patterns.length > 0 && (
                  <div>
                    <p className="text-xs text-orange-400 font-medium mb-1.5 uppercase tracking-wider">Failure Patterns</p>
                    <ul className="space-y-1">
                      {evalResult.patterns.map((p, i) => (
                        <li key={i} className="text-sm text-slate-300 flex gap-2">
                          <span className="text-orange-500 shrink-0">•</span> {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {evalResult.improvements.length > 0 && (
                  <div>
                    <p className="text-xs text-green-400 font-medium mb-1.5 uppercase tracking-wider">Improvement Plan</p>
                    <ul className="space-y-1">
                      {evalResult.improvements.map((imp, i) => (
                        <li key={i} className="text-sm text-slate-300 flex gap-2">
                          <span className="text-green-500 shrink-0">{i + 1}.</span> {imp}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-xs text-slate-500">
                  {evalResult.meta_knowledge_stored} insights stored in Qdrant memory
                </p>
              </div>
            )}
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center h-40 text-slate-500">Loading skills…</div>
        )}
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
            Failed to load skills — is the database connected?
          </div>
        )}

        {Object.entries(grouped).map(([cat, list]) => (
          <CategorySection key={cat} category={cat} skills={list} />
        ))}
      </div>
    </div>
  );
}
