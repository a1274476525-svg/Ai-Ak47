export interface Provider {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  modelDefault: string | null;
  costPer1k: number;
  rateLimit: number;
  fallbackTo: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
export type TaskOrigin = 'user' | 'autonomous' | 'learning_engine' | 'scheduled';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: number;
  origin: TaskOrigin;
  assignedAgent: string | null;
  modelUsed: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface HealthStatus {
  status: 'ok' | 'error';
  info?: Record<string, { status: string }>;
  error?: Record<string, unknown>;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  provider?: string;
  tokensIn?: number;
  tokensOut?: number;
  durationMs?: number;
  taskType?: string;
  agentUsed?: string;
  debateUsed?: boolean;
}

export interface Skill {
  id: string;
  name: string;
  category: string;
  level: number;
  target_level: number;
  is_learning: boolean;
  priority: number;
  last_assessed: string | null;
}

export interface PlannedTask {
  index: number;
  title: string;
  description: string;
  agent: string;
  priority: number;
  depends_on: number[];
  estimated_minutes: number;
}

export interface PlanResponse {
  goal: string;
  breakdown: string;
  estimated_total_minutes: number;
  tasks: PlannedTask[];
  task_ids: string[];
}

export interface ResearchReport {
  repos_found: number;
  hn_stories_found: number;
  papers_found: number;
  knowledge_stored: number;
  tasks_created: number;
  errors: string[];
  synthesis_preview: string;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  message_count: number;
  last_message_at: string | null;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  provider: string | null;
  model: string | null;
  tokens_in: number;
  tokens_out: number;
  created_at: string;
}

export interface MemorySearchResult {
  id: string;
  score: number;
  content: string;
  topic: string;
  source: string;
  metadata: Record<string, unknown>;
}

export interface WorldModelStats {
  total_facts: number;
  knowledge_graph_nodes: number;
  knowledge_graph_edges: number;
  last_updated: string;
}

export interface KnowledgeConcept {
  name: string;
  category: string;
  description: string;
  tags: string[];
}

export interface KnowledgeGraphStats {
  available: boolean;
  nodes: Record<string, number>;
  relationships: number;
}

export interface CodingBrainSubResult {
  agent: string;
  content: string;
}

export interface CodingBrainResult {
  content: string;
  task_type: string;
  agents_used: string[];
  tokens_in: number;
  tokens_out: number;
  sub_results: CodingBrainSubResult[];
  task_id?: string | null;
}

export interface TaskStep {
  id: string;
  step_index: number;
  agent: string | null;
  message: string;
  status: 'running' | 'success' | 'failed';
  created_at: string;
}
