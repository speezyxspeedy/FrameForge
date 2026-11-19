import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Search } from 'lucide-react';
import type { NavigationView } from '../../types/protocol';
import { DOCUMENTATION_TOPICS, type DocumentationTopic } from '../../data/examples';

interface DocumentationViewProps {
  onNavigate: (view: NavigationView) => void;
}

const CATEGORIES: Array<'All' | DocumentationTopic['category']> = [
  'All',
  'Fundamentals',
  'Data Encoding',
  'Framing & Layout',
  'Integrity & Checksums',
];

export const DocumentationView: React.FC<DocumentationViewProps> = ({ onNavigate }) => {
  const [selectedCategory, setSelectedCategory] = useState<'All' | DocumentationTopic['category']>('All');
  const [query, setQuery] = useState('');
  const [activeTopicId, setActiveTopicId] = useState<string>(DOCUMENTATION_TOPICS[0].id);

  const filteredTopics = useMemo(() => {
    const q = query.trim().toLowerCase();
    return DOCUMENTATION_TOPICS.filter((topic) => {
      if (selectedCategory !== 'All' && topic.category !== selectedCategory) {
        return false;
      }
      if (!q) return true;
      return (
        topic.title.toLowerCase().includes(q) ||
        topic.summary.toLowerCase().includes(q) ||
        topic.explanation.some((p) => p.toLowerCase().includes(q))
      );
    });
  }, [selectedCategory, query]);

  const activeTopic =
    filteredTopics.find((t) => t.id === activeTopicId) ?? filteredTopics[0] ?? null;

  const computedExample = useMemo(
    () => (activeTopic ? activeTopic.computeExample() : null),
    [activeTopic]
  );

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-5 space-y-4">
      {/* Header + Filter Controls */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Binary Engineering Reference
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Concise explanations of binary wire formats, IEEE 754 floats, bit fields, and CRC math—every example is calculated live by FrameForge’s engine.
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter topics..."
              className="w-full h-8 pl-8 pr-2.5 text-xs rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Topic Index (Left 4) | Active Article (Right 8) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-4 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-slate-100">
            Topics ({filteredTopics.length})
          </div>
          <div className="divide-y divide-slate-200/70 dark:divide-slate-800/70 max-h-[540px] overflow-y-auto">
            {filteredTopics.length === 0 ? (
              <div className="p-4 text-xs text-slate-500 dark:text-slate-400">
                No topics match "{query}".
              </div>
            ) : (
              filteredTopics.map((topic, idx) => {
                const isSelected = activeTopic?.id === topic.id;
                return (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => setActiveTopicId(topic.id)}
                    className={`w-full text-left px-4 py-2.5 transition-colors ${
                      isSelected
                        ? 'bg-cyan-500/10 dark:bg-cyan-500/15'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {String(idx + 1).padStart(2, '0')}. {topic.title}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {topic.category}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="lg:col-span-8 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-5">
          {activeTopic && computedExample ? (
            <article className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <div className="text-xs text-cyan-700 dark:text-cyan-400 font-medium">
                    {activeTopic.category}
                  </div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    {activeTopic.title}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {activeTopic.summary}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onNavigate(activeTopic.targetView)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-cyan-600 hover:bg-cyan-500 text-white whitespace-nowrap shrink-0"
                >
                  <span>{activeTopic.targetLabel}</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed max-w-3xl">
                {activeTopic.explanation.map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>

              {/* Live Calculated Example */}
              <div className="rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {activeTopic.exampleTitle}
                </div>
                <div className="text-xs font-mono text-slate-600 dark:text-slate-400">
                  Input: <span className="text-slate-900 dark:text-slate-200">{computedExample.input}</span>
                </div>
                <div className="text-xs font-mono text-cyan-700 dark:text-cyan-300 font-semibold break-all">
                  Output: {computedExample.output}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-800">
                  {computedExample.detail}
                </div>
              </div>

              {/* Practical Use Case */}
              <div className="pt-2 space-y-1">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Practical Systems Engineering Use Case
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {activeTopic.useCase}
                </p>
              </div>
            </article>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Select a topic from the list to view its documentation and live calculated example.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
