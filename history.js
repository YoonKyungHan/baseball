async function fetchHistory(limit = 50) {
  const res = await fetch(`/api/history?limit=${encodeURIComponent(limit)}`);
  if (!res.ok) throw new Error('히스토리 조회 실패');
  const data = await res.json();
  return Array.isArray(data.items) ? data.items : [];
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${hh}:${mm}`;
  } catch {
    return iso;
  }
}

function renderTimeline(items) {
  const timeline = document.getElementById('historyTimeline');
  const empty = document.getElementById('historyEmpty');
  if (!items.length) {
    timeline.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  timeline.innerHTML = items.map(item => {
    const dateStr = formatDate(item.at || item.timestamp);
    const winner = item.winnerName || '미상';
    const loser = item.loserName || '미상';
    const gameMode = item.gameMode === 'bestOf3' ? '🏆 3판 2승' : '🎯 단판';
    const room = item.roomName || '게임';
    return `
      <div class="timeline-item">
        <div class="time">${dateStr}</div>
        <div class="content">
          <div class="title">${room}</div>
          <div class="meta">${gameMode}</div>
          <div class="result-line">
            <span class="winner">${winner}</span>
            <span class="vs">승</span>
            <span class="loser">${loser}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function loadAndRender() {
  const limit = parseInt(document.getElementById('limitSelect').value, 10) || 50;
  try {
    const items = await fetchHistory(limit);
    renderTimeline(items);
  } catch (e) {
    console.error(e);
    alert('히스토리를 불러오지 못했습니다.');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('refreshHistoryBtn').addEventListener('click', loadAndRender);
  document.getElementById('limitSelect').addEventListener('change', loadAndRender);
  loadAndRender();
  // 실시간 업데이트를 위한 WebSocket 구독
  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}`;
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      // 히스토리 구독 등록 메시지를 서버로 보냅니다.
      ws.send(JSON.stringify({ type: 'subscribeHistory' }));
    };
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data && data.type === 'historyUpdate' && data.record) {
          // 새 기록이 오면 목록을 다시 로드합니다. (간단 구현)
          loadAndRender();
        }
      } catch {}
    };
  } catch (e) {
    console.warn('실시간 히스토리 구독 실패:', e);
  }
});


