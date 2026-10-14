// Adapted from dsh-slackoff's thinking/tool/awaiting/idle playback rules.
export function activityFor(sessionId, sessions, statuses, connected = true) {
  if (!connected) return { state: 'disconnected' };
  if (!sessionId) return { state: 'idle' };
  const related = new Set([sessionId]);
  let added;
  do {
    added = false;
    for (const row of Object.values(sessions.byId)) {
      // Forked conversations are independent; only actual subagents participate.
      if (row.origin === 'subagent' && related.has(row.parentId) && !related.has(row.id)) {
        related.add(row.id); added = true;
      }
    }
  } while (added);
  for (const id of related) {
    if (statuses.get(id)?.pendingInteraction) return { state: 'awaiting', attentionId: id };
  }
  return { state: [...related].some(id => statuses.get(id)?.running ?? sessions.byId[id]?.running) ? 'thinking' : 'idle' };
}

export function decisionFor(state) {
  return (state === 'thinking' || state === 'tool') ? 'play' : 'pause';
}
