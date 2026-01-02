// 웹소켓 클라이언트
class GameClient {
    constructor() {
        this.ws = null;
        this.playerId = null;
        this.playerName = '';
        this.roomId = null;
        this.gameMode = 'single'; // 기본값: 단판
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 2;
        this.shouldReconnect = true; // 재연결 허용 여부
        this.isDestroyed = false; // 클라이언트 종료 여부
        this.isPlayerInitialized = false; // 플레이어 초기화 완료 여부
        this.lastJoinRequest = null; // 마지막 join 요청 시간
        this.lastRoomsRequest = 0; // 마지막 방 목록 요청 시간
    }

    // 서버에 연결
    connect() {
        // 이미 연결된 경우 중복 연결 방지
        if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log('이미 연결되어 있습니다.');
            return;
        }
        
        // 연결 중인 경우 대기
        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
            console.log('연결 중입니다. 잠시 기다려주세요.');
            return;
        }
        
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}`;
        
        console.log(`웹소켓 서버 연결 시도: ${wsUrl}`);
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('웹소켓 연결 성공');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.updateConnectionStatus('연결됨', true);
        };
        
        this.ws.onmessage = (event) => {
            try {
                if (!event.data || typeof event.data !== 'string') {
                    console.warn('유효하지 않은 메시지 데이터:', event.data);
                    return;
                }
                
                const data = JSON.parse(event.data);
                if (!data || typeof data !== 'object') {
                    console.warn('유효하지 않은 메시지 구조:', data);
                    return;
                }
                
                this.handleMessage(data);
            } catch (error) {
                console.error('메시지 파싱 오류:', error, '원본 데이터:', event.data);
            }
        };
        
        this.ws.onclose = (event) => {
            console.log('웹소켓 연결 종료:', event.code, event.reason);
            this.isConnected = false;
            this.updateConnectionStatus('연결 끊김', false);
            
            // 의도적인 종료가 아니고, 재연결이 허용된 경우에만 재연결 시도
            if (this.shouldReconnect && !this.isDestroyed && event.code !== 1000) {
                this.attemptReconnect();
            }
        };
        
        this.ws.onerror = (error) => {
            console.error('웹소켓 오류:', error);
            this.updateConnectionStatus('연결 오류', false);
        };
    }

    // 재연결 시도
    attemptReconnect() {
        if (!this.shouldReconnect || this.isDestroyed) {
            console.log('재연결 시도 중단됨 (shouldReconnect:', this.shouldReconnect, ', isDestroyed:', this.isDestroyed, ')');
            return;
        }
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            this.updateConnectionStatus(`재연결 시도 중... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`, false);
            
            const delay = Math.min(1000 * this.reconnectAttempts, 5000); // 최대 5초 대기
            setTimeout(() => {
                if (this.shouldReconnect && !this.isDestroyed) {
                    this.connect();
                }
            }, delay);
        } else {
            this.updateConnectionStatus('연결 실패 - 새로고침 해주세요', false);
            this.shouldReconnect = false; // 더 이상 재연결 시도하지 않음
        }
    }

    // 연결 상태 업데이트
    updateConnectionStatus(status, isConnected) {
        const statusEl = document.getElementById('connectionStatus');
        if (statusEl) {
            statusEl.textContent = status;
            statusEl.className = `connection-status ${isConnected ? 'connected' : 'disconnected'}`;
        }
    }

    // 메시지 처리
    handleMessage(data) {
        console.log('받은 메시지:', data);
        
        switch (data.type) {
            case 'joined':
                this.playerId = data.playerId;
                this.playerName = data.playerName;
                this.onJoined();
                break;
                
            case 'roomList':
                this.onRoomListUpdate(data.rooms);
                break;
            case 'onlineUsers':
                if (window.lobbyManager && Array.isArray(data.users)) {
                    window.lobbyManager.updateOnlineUsers(data.users);
                }
                break;
                
            case 'roomCreated':
                this.onRoomCreated(data.room);
                break;
                
            case 'joinRoomResult':
                this.onJoinRoomResult(data);
                break;
                
            case 'playerJoined':
                this.onPlayerJoined(data);
                break;
                
            case 'playerLeft':
                this.onPlayerLeft(data);
                break;
                
            case 'gameStart':
                this.onGameStart(data);
                break;
                
            case 'playerReady':
                this.onPlayerReady(data);
                break;
                
            case 'gameStarted':
                this.onGameStarted(data);
                break;
                
            case 'guessResult':
                this.onGuessResult(data);
                break;
                
            case 'turnChanged':
                this.onTurnChanged(data);
                break;
                
            case 'gameEnded':
                this.onGameEnded(data);
                break;
                
            case 'gameRestarted':
                this.onGameRestarted(data);
                break;
            case 'emojiReceived':
                this.onEmojiReceived(data);
                break;
            
            case 'roundWin':
                this.onRoundWin(data);
                break;
            
            case 'nextRound':
                this.onNextRound(data);
                break;
                
            case 'gameInterrupted':
                this.onGameInterrupted(data);
                break;
                
            default:
                console.log('알 수 없는 메시지 타입:', data.type);
        }
    }

    // 서버로 메시지 전송
    send(message) {
        if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            console.warn('웹소켓이 연결되지 않았습니다.');
        }
    }

    // 플레이어 등록 (중복 방지)
    join(playerName) {
        // 이미 등록된 경우 중복 요청 방지
        if (this.playerId) {
            console.log('이미 등록된 플레이어입니다:', this.playerId);
            return;
        }
        
        // 같은 이름으로 최근에 요청한 경우 방지
        if (this.lastJoinRequest && 
            this.lastJoinRequest.name === playerName && 
            Date.now() - this.lastJoinRequest.time < 2000) {
            console.log('최근에 join 요청을 보냈습니다. 잠시 기다려주세요.');
            return;
        }
        
        this.lastJoinRequest = { name: playerName, time: Date.now() };
        
        this.send({
            type: 'join',
            playerName: playerName
        });
    }

    // 방 생성
    createRoom(roomName, gameMode = 'single') {
        this.send({
            type: 'createRoom',
            roomName: roomName,
            gameMode: gameMode
        });
    }

    // 방 참가
    joinRoom(roomId) {
        this.send({
            type: 'joinRoom',
            roomId: roomId
        });
    }

    // 방 나가기
    leaveRoom() {
        this.send({
            type: 'leaveRoom'
        });
    }

    // 비밀 숫자 설정
    setNumber(numbers) {
        this.send({
            type: 'setNumber',
            numbers: numbers
        });
    }

    // 추측하기
    makeGuess(numbers) {
        this.send({
            type: 'makeGuess',
            numbers: numbers
        });
    }

    // 게임 재시작
    restartGame() {
        this.send({
            type: 'restartGame'
        });
    }
    
    // 이모티콘 전송
    sendEmoji(emoji, message) {
        this.send({
            type: 'sendEmoji',
            emoji: emoji,
            message: message
        });
    }

    // 방 목록 요청 (중복 방지)
    getRooms() {
        // 최근에 요청한 경우 방지 (1초 내)
        if (this.lastRoomsRequest && Date.now() - this.lastRoomsRequest < 1000) {
            console.log('최근에 방 목록을 요청했습니다. 잠시 기다려주세요.');
            return;
        }
        
        this.lastRoomsRequest = Date.now();
        
        this.send({
            type: 'getRooms'
        });
    }

    // 클라이언트 정리
    destroy() {
        console.log('GameClient 정리 중...');
        this.isDestroyed = true;
        this.shouldReconnect = false;
        
        if (this.ws) {
            this.ws.close(1000, 'Client shutting down');
            this.ws = null;
        }
        
        this.isConnected = false;
        this.playerId = null;
        this.playerName = '';
        this.roomId = null;
    }

    // === 이벤트 핸들러들 ===

    onJoined() {
        console.log(`플레이어로 등록됨: ${this.playerName} (${this.playerId})`);
        
        // 이미 처리된 경우 중복 처리 방지
        if (this.isPlayerInitialized) {
            console.log('이미 초기화된 플레이어입니다.');
            return;
        }
        
        this.isPlayerInitialized = true;
        
        // 현재 페이지에 따라 처리 (한 번만)
        if (window.location.pathname.includes('lobby.html') || window.location.pathname === '/') {
            // 로비에서만 방 목록 요청
            setTimeout(() => this.getRooms(), 100); // 약간의 지연으로 중복 방지
        } else if (window.location.pathname.includes('game.html')) {
            // 게임 페이지에서 playerId를 게임 객체에 설정
            if (window.game) {
                window.game.playerId = this.playerId;
                console.log('게임 객체에 playerId 설정:', this.playerId);
            }
        }
        
        // 등록 상태 저장
        sessionStorage.setItem('playerRegistered', 'true');
        sessionStorage.setItem('playerId', this.playerId);
        sessionStorage.setItem('playerName', this.playerName);
    }

    onRoomListUpdate(rooms) {
        if (typeof updateRoomList === 'function') {
            updateRoomList(rooms);
        }
    }

    onRoomCreated(room) {
        console.log('방이 생성되었습니다:', room);
        this.roomId = room.id;
        
        // 서버 상태 안정화를 위해 약간 지연 후 게임 화면으로 이동
        setTimeout(() => {
            window.location.href = `game.html?room=${room.id}&player=${encodeURIComponent(this.playerName)}`;
        }, 500); // 0.5초 지연
    }

    onJoinRoomResult(data) {
        if (data.success) {
            console.log('방 참가 성공');
            this.roomId = data.room.id;
            
            // 이미 게임 페이지에 있으면 이동하지 않고 UI만 업데이트
            if (window.location.pathname.includes('game.html')) {
                console.log('이미 게임 페이지에 있음 - UI만 업데이트');
                if (window.game) {
                    // 방 정보 업데이트
                    document.getElementById('roomName').textContent = data.room.name || `방: ${data.room.id.slice(-4)}`;
                    document.getElementById('playerCount').textContent = `플레이어: ${data.room.playerCount}/2`;
                    document.getElementById('gamePhase').textContent = '방에 참가했습니다. 숫자를 설정해주세요.';
                }
            } else {
                // 로비에서 방 참가한 경우에만 게임 페이지로 이동
                console.log('게임 페이지로 이동');
                window.location.href = `game.html?room=${data.room.id}&player=${encodeURIComponent(this.playerName)}`;
            }
        } else {
            alert(data.message);
        }
    }

    onPlayerJoined(data) {
        console.log('플레이어 참가:', data.player.name, '현재 인원:', data.playerCount);
        
        // 게임 화면에서 플레이어 정보 업데이트
        if (window.game) {
            if (data.player.id !== this.playerId) {
                window.game.updatePlayerInfo(this.playerName, data.player.name);
            }
            
            // 방 인원수만 업데이트 (방 이름은 그대로 유지)
            if (data.playerCount) {
                document.getElementById('playerCount').textContent = `플레이어: ${data.playerCount}/2`;
                console.log('방 인원수 업데이트 완료:', data.playerCount);
            }
        }
    }

    onPlayerLeft(data) {
        console.log('플레이어가 나감:', data.playerId, '현재 인원:', data.playerCount);
        
        if (window.game) {
            window.game.updatePlayerInfo(this.playerName, '상대방을 기다리는 중...');
            
            // 방 인원수만 업데이트 (방 이름은 그대로 유지)
            if (data.playerCount !== undefined) {
                document.getElementById('playerCount').textContent = `플레이어: ${data.playerCount}/2`;
                console.log('방 인원수 업데이트 완료:', data.playerCount);
            }
        }
    }

    onGameStart(data) {
        console.log('게임 시작 가능:', data.message);
        
        if (window.game) {
            window.game.showMessage(data.message, 'info');
        }
    }

    onPlayerReady(data) {
        console.log(`${data.playerName}이 준비됨`);
        
        if (window.game) {
            window.game.showMessage(`${data.playerName}이 준비되었습니다!`, 'info');
        }
    }

    onGameStarted(data) {
        console.log('게임이 시작되었습니다');
        
        // 게임 모드 저장
        if (data.gameMode) {
            this.gameMode = data.gameMode;
        }
        
        if (window.game) {
            window.game.updateGameState({
                phase: 'playing',
                isMyTurn: data.isMyTurn,
                gameMode: this.gameMode
            });
            
            if (data.opponentName) {
                window.game.updatePlayerInfo(this.playerName, data.opponentName);
            }
            
            window.game.showMessage('게임이 시작되었습니다!', 'success');
        }
    }

    onGuessResult(data) {
        console.log('추측 결과:', data);
        
        if (!window.game || !data || !data.guess || !data.result) {
            console.error('추측 결과 데이터가 유효하지 않습니다:', data);
            return;
        }
        
        const isMyGuess = data.playerId === this.playerId;
        const player = isMyGuess ? 'my' : 'opponent';
        
        // 추측 결과를 히스토리에 추가
        window.game.addToHistory(player, data.guess, data.result, data.isHomeRun);
        
        // 상대방의 추측인 경우 메시지 표시
        if (!isMyGuess && data.playerName && Array.isArray(data.guess)) {
            window.game.showMessage(`${data.playerName}이 ${data.guess.join('')}로 추측했습니다! (${data.result.strikes}S ${data.result.balls}B)`, 'info');
        }
    }

    onTurnChanged(data) {
        console.log('턴 변경:', data.currentTurn);
        
        if (window.game) {
            window.game.updateGameState({
                phase: 'playing',
                isMyTurn: data.currentTurn === this.playerId,
                gameMode: this.gameMode
            });
        }
    }

    onGameEnded(data) {
        console.log('게임 종료:', data);
        
        if (window.game) {
            // 상대방의 비밀 숫자 저장
            const opponentId = Object.keys(data.secretNumbers).find(id => id !== this.playerId);
            if (opponentId) {
                window.game.opponentNumber = data.secretNumbers[opponentId];
            }
            
            window.game.updateGameState({
                phase: 'finished',
                winner: data.winnerId,
                gameMode: this.gameMode
            });
        }
    }

    onGameRestarted() {
        console.log('게임이 재시작되었습니다');
        
        if (window.game) {
            window.game.restartGame();
        }
    }
    
    onEmojiReceived(data) {
        console.log('이모티콘 수신:', data);
        
        if (window.game && data.emoji && data.senderName && data.message) {
            window.game.receiveEmoji(data.emoji, data.senderName, data.message);
        }
    }
    
    // 라운드 승리 처리
    onRoundWin(data) {
        console.log('라운드 승리:', data);
        
        if (window.game) {
            // 승리 횟수 업데이트
            for (const [playerId, wins] of Object.entries(data.wins)) {
                if (playerId === window.game.playerId) {
                    window.game.myWins = wins;
                } else {
                    window.game.opponentWins = wins;
                }
            }
            
            // 라운드 정보 업데이트
            window.game.currentRound = data.currentRound;
            
            // UI 업데이트
            window.game.updateWinIndicators();
            window.game.updateRoundInfo();
            
            // 라운드 승리 메시지 표시
            const isMyWin = data.winner === window.game.playerId;
            const message = isMyWin ? `라운드 ${data.currentRound} 승리! 🎉` : `라운드 ${data.currentRound} 패배...`;
            const type = isMyWin ? 'success' : 'warning';
            window.game.showMessage(message, type);
        }
    }
    
    // 다음 라운드 시작
    onNextRound(data) {
        console.log('다음 라운드:', data);
        
        if (window.game) {
            // 승리 횟수 업데이트
            for (const [playerId, wins] of Object.entries(data.wins)) {
                if (playerId === window.game.playerId) {
                    window.game.myWins = wins;
                } else {
                    window.game.opponentWins = wins;
                }
            }
            
            // 라운드 정보 업데이트
            window.game.currentRound = data.currentRound;
            
            // 다음 라운드 준비
            setTimeout(() => {
                window.game.prepareNextRound();
            }, 500);
        }
    }
    
    // 다음 라운드 요청 (서버에 다음 라운드 준비 완료 알림)
    nextRound() {
        this.send({
            type: 'nextRound'
        });
    }

    onGameInterrupted(data) {
        console.log('게임이 중단되었습니다:', data.message);
        
        if (window.game) {
            window.game.showMessage(data.message, 'warning');
            window.game.updateGameState({
                phase: 'setting',
                isMyTurn: false,
                gameMode: this.gameMode
            });
        }
    }
}

// 전역 클라이언트 인스턴스 생성
const gameClient = new GameClient();
window.gameClient = gameClient;

// 페이지 로드 시 자동 연결 (중복 방지)
let isConnectionInitialized = false;

window.addEventListener('load', () => {
    if (isConnectionInitialized) {
        console.log('이미 연결이 초기화되었습니다.');
        return;
    }
    
    isConnectionInitialized = true;
    console.log('웹소켓 연결 초기화 시작');
    gameClient.connect();
});

// 페이지 종료 시 연결 정리
window.addEventListener('beforeunload', () => {
    gameClient.destroy();
});

window.addEventListener('unload', () => {
    gameClient.destroy();
});

// 페이지 숨김 시 재연결 중단만 처리 (불필요한 자동 재연결 제거)
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('페이지가 숨겨짐 - 재연결 중단');
        gameClient.shouldReconnect = false;
    }
    // 페이지가 다시 보여도 자동 연결하지 않음 (사용자가 새로고침 해야 함)
}); 