import { computed, ref } from 'vue';
import type { Ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import type { Todo } from '../types';

// ---------------------------------------------------------------------------
// Time / date helpers
// ---------------------------------------------------------------------------

export const getTodayDateStr = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** Robust date-string-to-YYYYMMDD converter (handles 今天/明天/M月D日/ISO/...). */
export function getYYYYMMDD(dateStr?: string): string {
  if (!dateStr) return '';
  const today = new Date();
  if (dateStr.includes('今天')) {
    return getTodayDateStr();
  }
  if (dateStr.includes('明天')) {
    const tm = new Date(today);
    tm.setDate(tm.getDate() + 1);
    return `${tm.getFullYear()}-${String(tm.getMonth() + 1).padStart(2, '0')}-${String(tm.getDate()).padStart(2, '0')}`;
  }
  const ymd = dateStr.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  }
  const md = dateStr.match(/(\d{1,2})[月/-](\d{1,2})/);
  if (md) {
    return `${today.getFullYear()}-${md[1].padStart(2, '0')}-${md[2].padStart(2, '0')}`;
  }
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  }
  return dateStr;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GitFetchResult {
  status: 'found' | 'empty' | 'error';
  commits?: string;
  msg?: string;
}

interface GenericGitUrlInfo {
  baseUrl: string;
  owner: string;
  repo: string;
}

export interface TodayTaskStats {
  todayTasks: Todo[];
  completedToday: Todo[];
  pendingToday: Todo[];
  completionRate: number;
}

export interface ReportBundle {
  /** Prompt/data describing today's tasks + commits, sent to the model. */
  dataPrompt: string;
  /** Existing configured summary (built-in) — used when no LLM key is set. */
  builtInSummary: string;
  /** Named model-free stats, e.g. for quick pills in the UI. */
  stats: TodayTaskStats;
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function parseWebGitUrl(url: string): GenericGitUrlInfo | null {
  const trimmed = url.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return null;
  try {
    const u = new URL(trimmed);
    const pathname = u.pathname.replace(/\.git$/i, '').replace(/\/+$/, '');
    const segments = pathname.split('/').filter(Boolean);
    let clean = [...segments];
    const keyIdx = clean.findIndex((s) => ['commits', 'src', 'branches', 'tree', 'blob'].includes(s.toLowerCase()));
    if (keyIdx !== -1) clean = clean.slice(0, keyIdx);
    if (clean.length >= 2) {
      let owner = clean[clean.length - 2];
      if (owner === 'repos' && clean.length >= 3) owner = clean[clean.length - 3];
      return { baseUrl: u.origin, owner, repo: clean[clean.length - 1] };
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function fetchWebGitCommits(webInfo: GenericGitUrlInfo, todayStr: string): Promise<GitFetchResult> {
  const sinceISO = `${todayStr}T00:00:00Z`;
  const untilISO = `${todayStr}T23:59:59Z`;

  // 1. GitHub public API
  if (webInfo.baseUrl.includes('github.com')) {
    try {
      const apiUrl = `https://api.github.com/repos/${webInfo.owner}/${webInfo.repo}/commits?since=${sinceISO}&until=${untilISO}`;
      const res = await fetch(apiUrl, { headers: { Accept: 'application/vnd.github.v3+json' } });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const lines = data.map((item: any) => {
            const msg = item.commit?.message?.split('\n')[0] || '';
            const sha = item.sha?.substring(0, 7) || '';
            const author = item.commit?.author?.name || '';
            return `- ${msg} (${sha})${author ? ` [${author}]` : ''}`;
          }).join('\n');
          return { status: 'found', commits: lines };
        }
        return { status: 'empty', msg: '已成功连接 GitHub 仓库，但今日无 Commit 代码提交' };
      }
    } catch {
      /* ignore */
    }
  }

  // 2. Gitea / Gogs REST API
  try {
    const giteaUrl = `${webInfo.baseUrl}/api/v1/repos/${webInfo.owner}/${webInfo.repo}/commits?since=${sinceISO}&until=${untilISO}`;
    const res = await fetch(giteaUrl, { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const lines = data.map((item: any) => {
          const msg = item.commit?.message?.split('\n')[0] || item.title || '';
          const sha = item.sha?.substring(0, 7) || item.id?.substring(0, 7) || '';
          const author = item.commit?.author?.name || item.author?.username || '';
          return `- ${msg} (${sha})${author ? ` [${author}]` : ''}`;
        }).join('\n');
        return { status: 'found', commits: lines };
      }
      return { status: 'empty', msg: '已成功连接私有 Gitea/Gogs 仓库，但今日无 Commit 提交' };
    }
  } catch {
    /* ignore */
  }

  // 3. GitLab REST API
  try {
    const projectPath = encodeURIComponent(`${webInfo.owner}/${webInfo.repo}`);
    const glUrl = `${webInfo.baseUrl}/api/v4/projects/${projectPath}/repository/commits?since=${sinceISO}&until=${untilISO}`;
    const res = await fetch(glUrl, { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const lines = data.map((item: any) => {
          const msg = item.title || item.message?.split('\n')[0] || '';
          const sha = item.id?.substring(0, 7) || '';
          const author = item.author_name || '';
          return `- ${msg} (${sha})${author ? ` [${author}]` : ''}`;
        }).join('\n');
        return { status: 'found', commits: lines };
      }
      return { status: 'empty', msg: '已成功连接私有 GitLab 仓库，但今日无 Commit 提交' };
    }
  } catch {
    /* ignore */
  }

  return {
    status: 'error',
    msg: `识别到私有网页链接。因内网 Git 网页需要登录鉴权，建议填入该项目在电脑上的本地文件夹路径（如 C:\\Users\\...\\${webInfo.repo}）即可免登录自动读取提交日志`,
  };
}

export function cleanCommitSubject(commitLine: string): string {
  if (!commitLine) return '';
  let text = commitLine.replace(/^[-*\d.\s]+/, '').trim();
  text = text.replace(/\s*[\(\[][a-f0-9]{7,40}[\)\]]\s*$/i, '').trim();
  text = text.replace(/^\[[^\]]+\]\s*/, '').replace(/^\([^)]+\)\s*/, '');
  if (text.includes(':') || text.includes('：')) {
    text = text.replace(/^[^:：]+[:：]\s*/, '');
  }
  text = text.replace(/^\[[^\]]+\]\s*/, '').replace(/^\([^)]+\)\s*/, '').trim();
  return text;
}

// ---------------------------------------------------------------------------
// Main composable factory
// ---------------------------------------------------------------------------

/**
 * Provides "today task daily report" data gathering. Given the live todos ref,
 * it filters tasks relevant to today, fetches git commits for tasks that carry a
 * gitUrl, and produces both a rich data prompt (for an LLM) and a built-in
 * (model-free) summary string.
 */
export function useAIAssistant(todos: Ref<Todo[]>) {
  const todayStr = getTodayDateStr();
  const gitCommitsMap = ref<Map<string, GitFetchResult>>(new Map());

  const replaceDateStr = (t: Todo) => ({
    start: getYYYYMMDD(t.startTime),
    due: getYYYYMMDD(t.dueDate),
    completed: getYYYYMMDD(t.completedAt) || t.completedAt,
  });

  const todayComputed = computed(() => {
    const tasks = todos.value.filter((t) => {
      const { start, due, completed } = replaceDateStr(t);
      if (start && start > todayStr) return false;
      if (t.completed) return !!completed && completed === todayStr;
      if (start === todayStr || due === todayStr) return true;
      if (gitCommitsMap.value.has(t.id)) return true;
      if (!start || start <= todayStr) {
        if (!due || due >= todayStr) return true;
      }
      return false;
    });
    return tasks;
  });

  const stats = computed<TodayTaskStats>(() => {
    const todayTasks = todayComputed.value;
    const completedToday = todayTasks.filter((t) => t.completed);
    const pendingToday = todayTasks.filter((t) => !t.completed && !t.gitUrl);
    const completionRate = todayTasks.length === 0 ? 0 : Math.round((completedToday.length / todayTasks.length) * 100);
    return { todayTasks, completedToday, pendingToday, completionRate };
  });

  async function fetchGitCommits(): Promise<Map<string, GitFetchResult>> {
    const today = getTodayDateStr();
    const map = new Map<string, GitFetchResult>();
    const tasks = todayComputed.value;
    await Promise.all(
      tasks.map(async (task) => {
        if (!task.gitUrl || !task.gitUrl.trim()) return;
        const webInfo = parseWebGitUrl(task.gitUrl);
        if (webInfo) {
          map.set(task.id, await fetchWebGitCommits(webInfo, today));
        } else {
          try {
            const commits: string = await invoke('get_git_commits', {
              repoPath: task.gitUrl.trim(),
              dateStr: today,
            });
            if (commits && commits.trim()) {
              map.set(task.id, { status: 'found', commits: commits.trim() });
            } else {
              map.set(task.id, { status: 'empty', msg: '已成功连接本地代码路径，但今日无 Commit 代码提交' });
            }
          } catch (err: any) {
            map.set(task.id, { status: 'error', msg: err?.message || String(err) || '路径不存在或不是本地有效的 Git 目录' });
          }
        }
      }),
    );
    gitCommitsMap.value = map;
    return map;
  }

  // Dynamic per-task description for the built-in (model-free) generator.
  function describe(title: string, category: string): string {
    const lower = (title + ' ' + category).toLowerCase();
    if (lower.includes('测试') || lower.includes('test')) return '已按计划完成相关测试验证工作，测试结果良好并已同步。';
    if (/界面|ui|视图|页面|布局|重构/.test(lower)) return '已完成界面交互与样式效果重构，体验提升明显。';
    if (/(接口|api|后端|服务)/.test(lower)) return '已完成接口对接与数据打通，链路运行稳定。';
    if (/(文档|需求|方案|评审)/.test(lower)) return '已完成相关文档梳理与方案确认，核心要点已达成闭环。';
    if (/(修复|bug|排查)/.test(lower)) return '已定位并彻底修复相关问题，验证恢复正常。';
    return '已高效推进相关工作事项，成果已顺利落实。';
  }

  function groupByCategory(items: Todo[]): Map<string, Todo[]> {
    const map = new Map<string, Todo[]>();
    items.forEach((t) => {
      const cat = t.category || 'Todolist';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(t);
    });
    return map;
  }

  /** Built-in (offline) daily-report generator, mirroring the legacy structure. */
  function builtInSummary(): string {
    const s = stats.value;
    if (s.todayTasks.length === 0) {
      return `**📝 AI 工作日报**\n\n**一、 ✅ 今日完成与推进工作汇总**\n\n  Todolist 分类下今日暂无记录的关键任务。\n\n---\n\n**二、 📊 分类进度追踪**\n\n  - Todolist 分类：今日共纳入0项任务，已完成0项，完成占比0%。\n\n---\n\n**三、 📌 待跟进重点事项**\n\n  - 点击 **添加任务** 开启今日第一条工作规划。`;
    }

    const workTasks = s.todayTasks.filter((t) => t.completed || t.gitUrl);
    const workMap = groupByCategory(workTasks);
    const section1 =
      workTasks.length > 0
        ? Array.from(workMap.entries())
            .map(([cat, list]) => {
              const numText = list.length === 1 ? '一' : list.length === 2 ? '两' : String(list.length);
              const body = list
                .map((t) => {
                  const statusTag = t.completed ? '' : ' [进行中]';
                  let line = `- ${t.title}${statusTag}:`;
                  if (t.gitUrl && t.gitUrl.trim()) {
                    const g = gitCommitsMap.value.get(t.id);
                    if (g?.status === 'found' && g.commits) {
                      line += `\n${g.commits.split('\n').filter(Boolean).map((c, i) => `  ${i + 1}. ${cleanCommitSubject(c)}`).join('\n')}`;
                    } else if (g?.status === 'empty') {
                      line += ' (已关联代码路径，今日无 Commit 提交)';
                    } else if (g?.status === 'error') {
                      line += ` (代码路径读取提示: ${g.msg})`;
                    }
                  } else {
                    line += ` ${describe(t.title, cat)}`;
                  }
                  return line;
                })
                .join('\n');
              return `${cat} 分类下完成/推进以下${numText}项关键任务:\n${body}`;
            })
            .join('\n\n')
        : '（今日尚无已完成或配置代码路径的任务事项）';

    const allMap = new Map<string, { total: number; done: number }>();
    s.todayTasks.forEach((t) => {
      const cat = t.category || 'Todolist';
      if (!allMap.has(cat)) allMap.set(cat, { total: 0, done: 0 });
      allMap.get(cat)!.total++;
      if (t.completed) allMap.get(cat)!.done++;
    });
    const section2 = Array.from(allMap.entries())
      .map(([cat, v]) => {
        const rate = Math.round((v.done / v.total) * 100);
        return `- ${cat} 分类：今日共纳入${v.total}项任务，已完成${v.done}项，完成占比${rate}%。`;
      })
      .join('\n');

    const section3 =
      s.pendingToday.length > 0
        ? s.pendingToday
            .map((t) => `- ${t.title}：该任务属于 ${t.category || 'Todolist'} 分类，目前仍处于未完成状态。明日需优先处理，确保整体进度不受影响。`)
            .join('\n')
        : '- 今日规划的任务已全部完成，暂无待跟进事项。';

    return `**📝 AI 工作日报**\n\n**一、 ✅ 今日完成与推进工作汇总**\n\n${section1}\n\n---\n\n**二、 📊 分类进度追踪**\n\n${section2}\n\n---\n\n**三、 📌 待跟进重点事项**\n\n${section3}`;
  }

  /** Data bundle & prompt to hand the model for the daily report. */
  function buildDataPrompt(): string {
    const s = stats.value;
    const workTasks = s.todayTasks.filter((t) => t.completed || t.gitUrl);
    const workSummaries = workTasks
      .map((t) => {
        let text = `${t.title} [分类: ${t.category || 'Todolist'}, 状态: ${t.completed ? '已完成' : '推进中/未完成'}]`;
        if (t.gitUrl && t.gitUrl.trim()) {
          const g = gitCommitsMap.value.get(t.id);
          if (g?.status === 'found' && g.commits) {
            const cleaned = g.commits.split('\n').filter(Boolean).map(cleanCommitSubject).join('\n');
            text += ` (配置的代码路径 ${t.gitUrl} 当日提交日志:\n${cleaned})`;
          } else if (g?.status === 'empty') {
            text += ` (已配置代码路径 ${t.gitUrl}，但今日未检索到提交日志)`;
          } else if (g?.status === 'error') {
            text += ` (配置的代码路径 ${t.gitUrl} 读取异常: ${g.msg})`;
          }
        }
        return text;
      })
      .join('; ');

    return [
      '你是一位专业的 AI 工作助手。请根据用户今天的 TodoList 任务数据及对应的 Git 代码提交记录（如有），写一份包含 3 个核心部分的【AI 工作日报】。不要在段落标题前添加任何 # 井号符号！标题与下文之间必须空一行换行！',
      '',
      '【今日任务数据】',
      `- 今日总任务数: ${s.todayTasks.length}`,
      `- 今日完成与推进任务 (${workTasks.length}项): ${workSummaries || '无'}`,
      `- 待跟进任务 (${s.pendingToday.length}项): ${s.pendingToday.map((t) => `${t.title} [分类: ${t.category || 'Todolist'}]`).join('; ') || '无'}`,
      `- 完成率: ${s.completionRate}%`,
      '',
      '【格式要求 (只包含一、二、三部分，请勿添加 # 井号)】',
      '**📝 AI 工作日报**',
      '',
      '**一、 ✅ 今日完成与推进工作汇总**',
      '',
      '[分类名称] 分类下完成/推进以下N项关键任务:',
      '- [任务名称]:',
      '  1. [若任务有 Git 代码提交记录，在此按 1. 2. 3. 序号逐条精准原样列出当天的提交说明内容，严禁在结尾追加任何 (无短Hash) 或短 Hash 等字符，也不要撰写任何描述性废话套话！]',
      '  (若任务无 Commit 提交，则简要总结成果说明)',
      '',
      '---',
      '',
      '**二、 📊 分类进度追踪**',
      '',
      '- [分类名称] 分类：今日共纳入X项任务，已完成Y项，完成占比Z%。',
      '',
      '---',
      '',
      '**三、 📌 待跟进重点事项**',
      '',
      '- [任务名称]：该任务属于 [分类名称] 分类，目前仍处于未完成状态。明日需优先处理，确保整体进度不受影响。',
    ].join('\n');
  }

  return {
    todayStr,
    gitCommitsMap,
    stats,
    fetchGitCommits,
    builtInSummary,
    buildDataPrompt,
  };
}
