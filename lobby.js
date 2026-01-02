// 로비 관리
class LobbyManager {
    constructor() {
        this.playerName = '';
        this.rooms = [];
        this.isWaitingForConnection = false; // 연결 대기 중 여부
        this.connectionCheckInterval = null; // 연결 상태 체크 인터벌
        this.initializeEventListeners();
        this.loadPlayerName();
    }

    initializeEventListeners() {
        // 플레이어 이름 입력
        const playerNameInput = document.getElementById('playerName');
        playerNameInput.addEventListener('change', () => {
            this.setPlayerName(playerNameInput.value.trim());
        });

        playerNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.setPlayerName(playerNameInput.value.trim());
            }
        });

        // 방 생성 버튼
        document.getElementById('createRoomBtn').addEventListener('click', () => {
            this.showCreateRoomModal();
        });

        // 새로고침 버튼
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.refreshRooms();
        });

        // 혼자하기 버튼
        document.getElementById('soloGameBtn').addEventListener('click', () => {
            this.startSoloGame();
        });

        // 방 생성 모달
        document.getElementById('confirmCreateBtn').addEventListener('click', () => {
            this.createRoom();
        });

        document.getElementById('cancelCreateBtn').addEventListener('click', () => {
            this.hideCreateRoomModal();
        });

        // 방 이름 입력에서 Enter 키
        document.getElementById('roomName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.createRoom();
            }
        });

        // 모달 외부 클릭 시 닫기
        const modal = document.getElementById('createRoomModal');
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.hideCreateRoomModal();
            }
        });
    }

    // 온라인 유저 목록 업데이트
    updateOnlineUsers(users) {
        const list = document.getElementById('onlineUsers');
        if (!list) return;
        if (!Array.isArray(users) || users.length === 0) {
            list.innerHTML = '<li>현재 접속자가 없습니다</li>';
            return;
        }
        list.innerHTML = users.map(u => `<li>${this.escapeHtml(u.name)}<span style="opacity:.6; font-size:12px;"> (${u.id.slice(-4)})</span></li>`).join('');
    }

    // 로컬 스토리지에서 플레이어 이름 로드
    loadPlayerName() {
        // URL 파라미터에서 플레이어 이름 확인
        const urlParams = new URLSearchParams(window.location.search);
        const urlPlayerName = urlParams.get('player');
        
        let playerName = '';
        if (urlPlayerName) {
            playerName = decodeURIComponent(urlPlayerName);
        } else {
            playerName = localStorage.getItem('baseballGamePlayerName') || '';
        }
        
        if (playerName) {
            const input = document.getElementById('playerName');
            input.value = playerName;
            this.setPlayerName(playerName);
        }
    }

    // 플레이어 이름 설정
    setPlayerName(name) {
        if (!name) return;
        
        // 같은 이름으로 이미 설정된 경우 중복 방지
        if (this.playerName === name) {
            console.log('이미 같은 이름으로 설정되어 있습니다.');
            return;
        }
        
        this.playerName = name;
        localStorage.setItem('baseballGamePlayerName', name);
        
        // 이미 등록되어 있는지 확인
        const isRegistered = sessionStorage.getItem('playerRegistered') === 'true';
        const savedPlayerName = sessionStorage.getItem('playerName');
        
        if (isRegistered && savedPlayerName === name && window.gameClient && window.gameClient.playerId) {
            console.log('이미 등록된 플레이어입니다.');
            return;
        }
        
        // 웹소켓이 연결되어 있으면 서버에 등록 (한 번만)
        if (window.gameClient && window.gameClient.isConnected) {
            window.gameClient.join(name);
        } else if (!this.isWaitingForConnection) {
            // 연결 대기 중이 아닐 때만 대기 시작
            this.isWaitingForConnection = true;
            this.waitForConnectionAndJoin(name);
        }
    }

    // 연결을 기다렸다가 등록 (중복 방지)
    waitForConnectionAndJoin(name) {
        let attempts = 0;
        const maxAttempts = 30; // 3초 대기
        
        const checkConnection = () => {
            attempts++;
            
            if (window.gameClient && window.gameClient.isConnected) {
                this.isWaitingForConnection = false;
                window.gameClient.join(name);
            } else if (attempts >= maxAttempts) {
                this.isWaitingForConnection = false;
                console.log('연결 대기 시간 초과');
            } else {
                setTimeout(checkConnection, 100);
            }
        };
        
        checkConnection();
    }

    // 방 목록 업데이트
    updateRoomList(rooms) {
        this.rooms = rooms;
        const roomsList = document.getElementById('roomsList');
        
        if (rooms.length === 0) {
            roomsList.innerHTML = `
                <div style="text-align: center; color: #666; padding: 50px;">
                    <p>현재 활성화된 방이 없습니다.</p>
                    <p>새 방을 만들어 게임을 시작하세요!</p>
                </div>
            `;
            return;
        }
        
        roomsList.innerHTML = rooms.map(room => `
            <div class="room-item" data-room-id="${room.id}">
                <div class="room-info">
                    <h4>${this.escapeHtml(room.name)}</h4>
                    <p>플레이어: ${room.playerCount}/${room.maxPlayers}</p>
                    <p>모드: ${this.getGameModeText(room.gameMode)}</p>
                    <p>상태: ${this.getRoomStateText(room.gameState)}</p>
                </div>
                <div class="room-actions">
                    ${this.getRoomActionButton(room)}
                </div>
            </div>
        `).join('');
        
        // 방 참가 버튼 이벤트 리스너 추가
        roomsList.querySelectorAll('.join-room-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const roomId = e.target.getAttribute('data-room-id');
                this.joinRoom(roomId);
            });
        });
    }

    // 게임 모드 텍스트
    getGameModeText(gameMode) {
        switch (gameMode) {
            case 'single': return '🎯 단판';
            case 'bestOf3': return '🏆 3판 2승제';
            default: return '🎯 단판';
        }
    }

    // 방 상태 텍스트
    getRoomStateText(gameState) {
        switch (gameState) {
            case 'waiting': return '대기 중';
            case 'setting': return '준비 중';
            case 'playing': return '게임 진행 중';
            case 'finished': return '게임 종료';
            default: return '알 수 없음';
        }
    }

    // 방 액션 버튼
    getRoomActionButton(room) {
        if (room.playerCount >= room.maxPlayers) {
            return '<button class="btn btn-secondary" disabled>가득 참</button>';
        }
        
        if (room.gameState !== 'waiting') {
            return '<button class="btn btn-secondary" disabled>진행 중</button>';
        }
        
        return `<button class="btn btn-primary join-room-btn" data-room-id="${room.id}">참가</button>`;
    }

    // HTML 이스케이프
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 방 생성 모달 표시
    showCreateRoomModal() {
        if (!this.playerName) {
            alert('먼저 닉네임을 입력해주세요!');
            document.getElementById('playerName').focus();
            return;
        }
        
        const modal = document.getElementById('createRoomModal');
        const roomNameInput = document.getElementById('roomName');
        
        roomNameInput.value = '';
        modal.classList.add('show');
        roomNameInput.focus();
    }

    // 방 생성 모달 숨기기
    hideCreateRoomModal() {
        const modal = document.getElementById('createRoomModal');
        modal.classList.remove('show');
    }

    // 방 생성
    createRoom() {
        const roomNameInput = document.getElementById('roomName');
        const roomName = roomNameInput.value.trim();
        
        if (!roomName) {
            alert('방 이름을 입력해주세요!');
            roomNameInput.focus();
            return;
        }
        
        if (roomName.length > 20) {
            alert('방 이름은 20자 이하로 입력해주세요!');
            roomNameInput.focus();
            return;
        }
        
        // 선택된 게임 모드 가져오기
        const selectedGameMode = document.querySelector('input[name="gameMode"]:checked').value;
        
        // 웹소켓으로 방 생성 요청
        if (window.gameClient && window.gameClient.isConnected) {
            window.gameClient.createRoom(roomName, selectedGameMode);
            this.hideCreateRoomModal();
        } else {
            alert('서버에 연결되지 않았습니다. 잠시 후 다시 시도해주세요.');
        }
    }

    // 방 참가
    joinRoom(roomId) {
        if (!this.playerName) {
            alert('먼저 닉네임을 입력해주세요!');
            document.getElementById('playerName').focus();
            return;
        }
        
        const room = this.rooms.find(r => r.id === roomId);
        if (!room) {
            alert('방을 찾을 수 없습니다.');
            this.refreshRooms();
            return;
        }
        
        if (room.playerCount >= room.maxPlayers) {
            alert('방이 가득 찼습니다.');
            this.refreshRooms();
            return;
        }
        
        if (room.gameState !== 'waiting') {
            alert('게임이 진행 중입니다.');
            this.refreshRooms();
            return;
        }
        
        // 웹소켓으로 방 참가 요청
        if (window.gameClient && window.gameClient.isConnected) {
            window.gameClient.joinRoom(roomId);
        } else {
            alert('서버에 연결되지 않았습니다. 잠시 후 다시 시도해주세요.');
        }
    }

    // 방 목록 새로고침
    refreshRooms() {
        if (window.gameClient && window.gameClient.isConnected) {
            window.gameClient.getRooms();
        }
    }

    // 혼자하기 게임 시작
    startSoloGame() {
        if (!this.playerName) {
            alert('먼저 닉네임을 입력해주세요!');
            document.getElementById('playerName').focus();
            return;
        }
        
        // AI 상대와 게임하기 위해 특별한 URL 파라미터로 이동
        window.location.href = `game.html?mode=solo&player=${encodeURIComponent(this.playerName)}`;
    }

    // 연결 상태 변경 처리
    onConnectionChanged(isConnected) {
        const createBtn = document.getElementById('createRoomBtn');
        const soloBtn = document.getElementById('soloGameBtn');
        const refreshBtn = document.getElementById('refreshBtn');
        
        createBtn.disabled = !isConnected;
        refreshBtn.disabled = !isConnected;
        // 혼자하기는 서버 연결과 상관없이 가능
        soloBtn.disabled = false;
        
        // 연결되었을 때 한 번만 플레이어 등록
        if (isConnected && this.playerName && !window.gameClient.playerId) {
            window.gameClient.join(this.playerName);
        }
    }

    // 연결 상태 모니터링 시작 (최적화된 버전)
    startConnectionMonitoring() {
        // 이미 모니터링 중이면 중복 실행 방지
        if (this.connectionCheckInterval) {
            return;
        }
        
        this.connectionCheckInterval = setInterval(() => {
            if (window.gameClient) {
                this.onConnectionChanged(window.gameClient.isConnected);
            }
        }, 2000); // 2초마다 체크 (기존 1초에서 줄임)
    }

    // 연결 상태 모니터링 중지
    stopConnectionMonitoring() {
        if (this.connectionCheckInterval) {
            clearInterval(this.connectionCheckInterval);
            this.connectionCheckInterval = null;
        }
    }
}

// 전역 함수로 방 목록 업데이트 (클라이언트에서 호출)
function updateRoomList(rooms) {
    if (window.lobbyManager) {
        window.lobbyManager.updateRoomList(rooms);
    }
}

// 로비 매니저 초기화
document.addEventListener('DOMContentLoaded', () => {
    if (!window.lobbyManager) {
        window.lobbyManager = new LobbyManager();
        
        // 웹소켓 연결 상태 모니터링 시작 (최적화된 버전)
        window.lobbyManager.startConnectionMonitoring();
    }
});

// 페이지 종료 시 정리
window.addEventListener('beforeunload', (e) => {
    // 모니터링 정리
    if (window.lobbyManager) {
        window.lobbyManager.stopConnectionMonitoring();
    }
    
    // 게임 중인 경우 경고 표시
    if (window.gameClient && window.gameClient.roomId) {
        e.preventDefault();
        e.returnValue = '게임을 나가시겠습니까?';
    }
}); 