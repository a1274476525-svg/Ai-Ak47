const BASE = '/api/v1';

export function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('aios_token') ?? '';
}

export function setToken(token: string) {
  localStorage.setItem('aios_token', token);
  // Also write to cookie so Next.js middleware can read it server-side
  document.cookie = `aios_token=${token}; path=/; max-age=${7 * 24 * 3600}; SameSite=Lax`;
}

export function clearToken() {
  localStorage.removeItem('aios_token');
  document.cookie = 'aios_token=; path=/; max-age=0';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    ...init,
  });
  if (res.status === 401) {
    clearToken();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Providers ────────────────────────────
export const api = {
  providers: {
    list:   ()              => request('/providers'),
    create: (body: unknown) => request('/providers', { method: 'POST',   body: JSON.stringify(body) }),
    update: (id: string, body: unknown) => request(`/providers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: string)    => request(`/providers/${id}`, { method: 'DELETE' }),
  },

  tasks: {
    list:   (params?: { status?: string; agent?: string; q?: string; from?: string; to?: string }) => {
      const qp = new URLSearchParams();
      if (params?.status) qp.set('status', params.status);
      if (params?.agent)  qp.set('agent', params.agent);
      if (params?.q)      qp.set('q', params.q);
      if (params?.from)   qp.set('from', params.from);
      if (params?.to)     qp.set('to', params.to);
      const qs = qp.toString();
      return request(`/tasks${qs ? `?${qs}` : ''}`);
    },
    get:    (id: string)    => request(`/tasks/${id}`),
    create: (body: unknown) => request('/tasks', { method: 'POST', body: JSON.stringify(body) }),
    remove: (id: string)    => request(`/tasks/${id}`, { method: 'DELETE' }),
  },

  chat: {
    send: (body: unknown) => request('/chat', { method: 'POST', body: JSON.stringify(body) }),
  },

  health: {
    check: () => request('/health'),
  },

  auth: {
    login: (username: string, password: string) =>
      request<{ accessToken: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
  },

  conversations: {
    list:     (limit?: number, q?: string) => {
      const qp = new URLSearchParams();
      if (limit) qp.set('limit', String(limit));
      if (q)     qp.set('q', q);
      const qs = qp.toString();
      return request(`/conversations${qs ? `?${qs}` : ''}`);
    },
    messages: (id: string)     => request(`/conversations/${id}/messages`),
  },

  autonomous: {
    plan:          (body: unknown)  => request('/autonomous/plan', { method: 'POST', body: JSON.stringify(body) }),
    skills:        ()               => request('/autonomous/skills'),
    skillGaps:     (threshold?: number) => request(`/autonomous/skills/gaps${threshold !== undefined ? `?threshold=${threshold}` : ''}`),
    learn:         (body: unknown)  => request('/autonomous/skills/learn', { method: 'POST', body: JSON.stringify(body) }),
    researchRun:   ()               => request('/autonomous/research/run', { method: 'POST', body: '{}' }),
    pendingTasks:  (limit?: number) => request(`/autonomous/tasks/pending${limit ? `?limit=${limit}` : ''}`),
    recentTasks:   (limit?: number, status?: string) => {
      const params = new URLSearchParams();
      if (limit)  params.set('limit', String(limit));
      if (status) params.set('status', status);
      const qs = params.toString() ? `?${params}` : '';
      return request(`/autonomous/tasks/recent${qs}`);
    },
    executeTasks:  (maxTasks?: number) => request(`/autonomous/tasks/execute${maxTasks ? `?max_tasks=${maxTasks}` : ''}`, { method: 'POST', body: '{}' }),
    getTask:       (id: string)        => request(`/autonomous/tasks/${id}`),
    taskSteps:     (id: string)        => request(`/autonomous/tasks/${id}/steps`),
    evaluate:      (maxTasks?: number) => request(`/autonomous/evaluate${maxTasks ? `?max_tasks=${maxTasks}` : ''}`, { method: 'POST', body: '{}' }),

    // World Model
    worldModelStats:       ()               => request('/autonomous/world-model/stats'),
    worldModelRecall:      (body: unknown)  => request('/autonomous/world-model/recall', { method: 'POST', body: JSON.stringify(body) }),
    worldModelLearn:       (body: unknown)  => request('/autonomous/world-model/learn', { method: 'POST', body: JSON.stringify(body) }),
    worldModelConsolidate: (maxItems?: number) => request(`/autonomous/world-model/consolidate${maxItems ? `?max_items=${maxItems}` : ''}`, { method: 'POST', body: '{}' }),

    // Coding Brain
    codingBrain: (body: unknown) => request('/autonomous/coding-brain', { method: 'POST', body: JSON.stringify(body) }),
  },

  // Tools
  tools: {
    terminalRun:  (command: string)                    => request('/tools/terminal/run', { method: 'POST', body: JSON.stringify({ command }) }),
    terminalRead: (path: string)                       => request(`/tools/terminal/read?path=${encodeURIComponent(path)}`),
    terminalWrite:(path: string, content: string)      => request('/tools/terminal/write', { method: 'POST', body: JSON.stringify({ path, content }) }),
    dockerList:   (all?: boolean)                      => request(`/tools/docker/containers${all ? '?all_containers=true' : ''}`),
    dockerLogs:   (container: string, lines?: number)  => request(`/tools/docker/logs/${container}${lines ? `?lines=${lines}` : ''}`),
    dockerStats:  (container: string)                  => request(`/tools/docker/stats/${container}`),
    dockerRestart:(service: string)                    => request(`/tools/docker/restart/${service}`, { method: 'POST', body: '{}' }),
  },

  // Knowledge Graph
  knowledge: {
    stats:        ()              => request('/knowledge/stats'),
    searchConcepts: (q: string, limit?: number) => request(`/knowledge/concepts/search?q=${encodeURIComponent(q)}${limit ? `&limit=${limit}` : ''}`),
    upsertConcept:  (body: unknown) => request('/knowledge/concepts', { method: 'POST', body: JSON.stringify(body) }),
    addRelationship:(body: unknown) => request('/knowledge/relationships', { method: 'POST', body: JSON.stringify(body) }),
    addInsight:     (body: unknown) => request('/knowledge/insights', { method: 'POST', body: JSON.stringify(body) }),
    getRelated:     (name: string, label?: string, depth?: number) =>
      request(`/knowledge/related/${encodeURIComponent(name)}${label ? `?label=${label}` : ''}${depth ? `&depth=${depth}` : ''}`),
    skillGraph: () => request('/knowledge/skills/graph'),
  },

  // Analytics
  analytics: {
    overview: ()             => request('/analytics/overview'),
    tasks:    (days?: number) => request(`/analytics/tasks${days ? `?days=${days}` : ''}`),
    models:   (days?: number) => request(`/analytics/models${days ? `?days=${days}` : ''}`),
    skills:   ()             => request('/analytics/skills'),
    timeline: (days?: number) => request(`/analytics/timeline${days ? `?days=${days}` : ''}`),
    knowledge:()             => request('/analytics/knowledge'),
  },

  // Extensions
  extensions: {
    list:   () => request('/extensions'),
    reload: () => request('/extensions/reload', { method: 'POST', body: '{}' }),
  },

  // Memory (vector knowledge base)
  memory: {
    search: (q: string, limit?: number) => request(`/memory/search?q=${encodeURIComponent(q)}${limit ? `&limit=${limit}` : ''}`),
    store:  (body: { content: string; topic: string; source?: string }) => request('/memory', { method: 'POST', body: JSON.stringify(body) }),
  },

  // Approvals (human-in-the-loop gate for risky tool actions)
  approvals: {
    list:    (status?: string) => request(`/approvals${status ? `?status=${status}` : ''}`),
    approve: (id: string)      => request(`/approvals/${id}/approve`, { method: 'POST', body: '{}' }),
    reject:  (id: string)      => request(`/approvals/${id}/reject`,  { method: 'POST', body: '{}' }),
  },

  // Budget guardrails
  budget: {
    get:    () => request('/budget'),
    update: (body: { daily_limit_usd: number | null; monthly_limit_usd: number | null; enabled: boolean }) =>
      request('/budget', { method: 'PUT', body: JSON.stringify(body) }),
  },

  // Notifications
  notifications: {
    list:        (unreadOnly?: boolean) => request(`/notifications${unreadOnly ? '?unread=true' : ''}`),
    unreadCount: () => request('/notifications/unread-count'),
    markRead:    (id: string) => request(`/notifications/${id}/read`, { method: 'POST', body: '{}' }),
    markAllRead: () => request('/notifications/read-all', { method: 'POST', body: '{}' }),
  },
};
