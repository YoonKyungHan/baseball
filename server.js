const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const { Kafka } = require('kafkajs');

// Kafka 설정 test
// - 환경변수에서 브로커/클라이언트ID를 읽어 프로듀서를 초기화합니다.
// - Kafka가 없어도 서버는 동작하도록 설계되었으며, 연결 실패 시 경고만 출력합니다.
const kafkaBrokers = (process.env.KAFKA_BROKERS || 'localhost:9092')
  .split(',')
  .map(b => b.trim())
  .filter(Boolean);
const kafkaClientId = process.env.KAFKA_CLIENT_ID || 'baseball-game';
const kafka = new Kafka({ clientId: kafkaClientId, brokers: kafkaBrokers });
// 게임 종료 이벤트 토픽, 유저 이벤트 토픽
const kafkaTopicGameEvents = process.env.KAFKA_TOPIC_GAME_EVENTS || 'game-events';
const kafkaTopicUserEvents = process.env.KAFKA_TOPIC_USER_EVENTS || 'user-events';
let kafkaProducer;

// 히스토리 실시간 구독자(WebSocket) 목록
const historySubscribers = new Set();
function notifyHistorySubscribers(record) {
    const message = JSON.stringify({ type: 'historyUpdate', record });
    historySubscribers.forEach((socket) => {
        try {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(message);
            }
        } catch (e) {
            historySubscribers.delete(socket);
        }
    });
}

// 로컬 파일 히스토리 저장 경로
// - Kafka 외에도 최소 이력은 파일(JSONL)로 남깁니다.
const HISTORY_DIR = path.join(__dirname, 'data');
const HISTORY_FILE = path.join(HISTORY_DIR, 'game_history.jsonl');
const USER_HISTORY_FILE = path.join(HISTORY_DIR, 'user_history.jsonl');

async function ensureHistoryDir() {
    // data 디렉터리가 없으면 생성
    try {
        await fs.promises.mkdir(HISTORY_DIR, { recursive: true });
    } catch (e) {
        // ignore
    }
}

async function appendHistoryLine(record) {
    // 히스토리를 JSON Lines 포맷으로 한 줄씩 추가합니다.
    await ensureHistoryDir();
    const line = JSON.stringify(record) + '\n';
    await fs.promises.appendFile(HISTORY_FILE, line, 'utf-8');
}

async function appendUserHistoryLine(record) {
    await ensureHistoryDir();
    const line = JSON.stringify(record) + '\n';
    await fs.promises.appendFile(USER_HISTORY_FILE, line, 'utf-8');
}

async function initKafka() {
    // 애플리케이션 시작 시 프로듀서를 연결합니다.
    // 실패해도 게임 진행에는 영향이 없도록 try-catch로 감쌉니다.
    try {
        kafkaProducer = kafka.producer();
        await kafkaProducer.connect();
        console.log('✅ Kafka Producer 연결 완료:', kafkaBrokers.join(','));
    } catch (err) {
        console.error('⚠️ Kafka 초기화 실패(프로듀서). 서버는 계속 동작합니다:', err.message);
    }
}

initKafka();

// Kafka Consumer → WebSocket 브리지 (교육용 데모)
async function initKafkaConsumers() {
    try {
        const groupId = process.env.KAFKA_BRIDGE_GROUP_ID || 'baseball-ws-bridge';
        const consumer = kafka.consumer({ groupId });
        await consumer.connect();
        // 존재하지 않아도 무시하도록 try
        try { await consumer.subscribe({ topic: kafkaTopicGameEvents, fromBeginning: true }); } catch {}
        try { await consumer.subscribe({ topic: kafkaTopicUserEvents, fromBeginning: true }); } catch {}

        await consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                const raw = message.value ? message.value.toString() : '';
                let payload = null;
                try { payload = JSON.parse(raw); } catch { payload = { raw }; }
                const out = topic === kafkaTopicGameEvents
                    ? { type: 'kafkaGameEvent', event: payload }
                    : { type: 'kafkaUserEvent', event: payload };
                // 모든 웹소켓 클라이언트에 브로드캐스트
                try {
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify(out));
                        }
                    });
                } catch (e) {
                    console.error('WS 브로드캐스트 실패:', e);
                }
            }
        });

        console.log('✅ Kafka Consumer 브리지 실행 (groupId=%s)', groupId);
    } catch (err) {
        console.error('⚠️ Kafka Consumer 초기화 실패. 서버는 계속 동작합니다:', err.message);
    }
}

initKafkaConsumers();

// HTTP 서버 생성 (정적 파일 서빙 + 간단 API)
const server = http.createServer(async (req, res) => {
    // URL에서 쿼리 파라미터 제거
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    
    // 간단 API: 게임 히스토리/유저 히스토리 조회/추가
    // - GET /api/history: 최근 게임 기록을 최신순으로 반환
    // - POST /api/history: 클라이언트(예: 솔로 모드)가 직접 게임 기록을 추가
    // - GET /api/users: 최근 유저 접속 기록 반환
    if (pathname === '/api/history') {
        if (req.method === 'GET') {
            try {
                const limitParam = url.searchParams.get('limit');
                const limit = Math.max(1, Math.min(500, parseInt(limitParam || '50', 10)));
                let items = [];
                try {
                    const content = await fs.promises.readFile(HISTORY_FILE, 'utf-8');
                    const lines = content.split(/\r?\n/).filter(Boolean);
                    const selected = lines.slice(-limit);
                    items = selected.map(l => {
                        try { return JSON.parse(l); } catch { return null; }
                    }).filter(Boolean).reverse(); // 최신순
                } catch (readErr) {
                    // 파일이 없을 때는 빈 배열
                    if (readErr.code !== 'ENOENT') throw readErr;
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ items }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'failed_to_read_history', message: e.message }));
            }
            return;
        }
        if (req.method === 'POST') {
            // 클라이언트에서 간단한 결과(날짜/승자/패자 등)를 전송하면 파일로 저장합니다.
            try {
                const body = await new Promise((resolve, reject) => {
                    let data = '';
                    req.on('data', chunk => { data += chunk; if (data.length > 1e6) { reject(new Error('payload_too_large')); req.destroy(); } });
                    req.on('end', () => resolve(data));
                    req.on('error', reject);
                });
                let payload;
                try { payload = JSON.parse(body || '{}'); } catch { payload = {}; }
                const nowIso = new Date().toISOString();
                const record = {
                    at: payload.at || nowIso,
                    roomId: payload.roomId || null,
                    roomName: payload.roomName || 'AI 대전',
                    winnerName: payload.winnerName || null,
                    loserName: payload.loserName || null,
                    gameMode: payload.gameMode || 'single',
                    source: payload.source || 'solo'
                };
                await appendHistoryLine(record);
                // 실시간 구독자에게 푸시
                notifyHistorySubscribers(record);
                // Kafka 발행 시도 (가능할 때만)
                if (kafkaProducer) {
                    await kafkaProducer.send({
                        topic: kafkaTopicGameEvents,
                        messages: [{ key: 'gameEnded', value: JSON.stringify({ type: 'gameEnded', ...record }) }]
                    });
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'failed_to_write_history', message: e.message }));
            }
            return;
        }
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'method_not_allowed' }));
        return;
    }

    if (pathname === '/api/users') {
        if (req.method === 'GET') {
            try {
                const limitParam = url.searchParams.get('limit');
                const limit = Math.max(1, Math.min(500, parseInt(limitParam || '50', 10)));
                let items = [];
                try {
                    const content = await fs.promises.readFile(USER_HISTORY_FILE, 'utf-8');
                    const lines = content.split(/\r?\n/).filter(Boolean);
                    const selected = lines.slice(-limit);
                    items = selected.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).reverse();
                } catch (readErr) {
                    if (readErr.code !== 'ENOENT') throw readErr;
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ items }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'failed_to_read_user_history', message: e.message }));
            }
            return;
        }
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'method_not_allowed' }));
        return;
    }
    
    let filePath = path.join(__dirname, pathname === '/' ? '/lobby.html' : pathname);
    
    // 파일 확장자 확인
    const extname = path.extname(filePath);
    let contentType = 'text/html';
    
    switch (extname) {
        case '.js':
            contentType = 'text/javascript';
            break;
        case '.css':
            contentType = 'text/css';
            break;
        case '.json':
            contentType = 'application/json';
            break;
    }
    
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code == 'ENOENT') {
                res.writeHead(404);
                res.end('Page not found');
            } else {
                res.writeHead(500);
                res.end('Server error');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// 웹소켓 서버 생성
const wss = new WebSocket.Server({ server });

// 온라인 유저 목록 브로드캐스트
function broadcastOnlineUsers() {
    try {
        const users = Array.from(gameServer.players.values())
            .filter(p => p.ws && p.ws.readyState === WebSocket.OPEN)
            .map(p => ({ id: p.id, name: p.name }));
        const message = JSON.stringify({ type: 'onlineUsers', users });
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    } catch (e) {
        console.error('온라인 유저 브로드캐스트 실패:', e);
    }
}

// 게임 상태 관리
class GameServer {
    constructor() {
        this.rooms = new Map();
        this.players = new Map();
        this.playerCounter = 0;
    }

    // 새 플레이어 추가
    addPlayer(ws, playerName) {
        // 이미 같은 웹소켓에 플레이어가 등록되어 있는지 확인
        if (ws.playerId && this.players.has(ws.playerId)) {
            const existingPlayer = this.players.get(ws.playerId);
            console.log(`기존 플레이어 재사용: ${existingPlayer.name} (${existingPlayer.id})`);
            return existingPlayer;
        }
        
        // 같은 닉네임의 연결되지 않은 플레이어가 있는지 확인
        let existingPlayer = null;
        for (let player of this.players.values()) {
            if (player.name === playerName && player.ws.readyState !== WebSocket.OPEN) {
                existingPlayer = player;
                break;
            }
        }
        
        if (existingPlayer) {
            // 기존 플레이어의 웹소켓만 업데이트
            existingPlayer.ws = ws;
            ws.playerId = existingPlayer.id;
            console.log(`플레이어 재연결: ${playerName} (${existingPlayer.id})`);
            return existingPlayer;
        }
        
        const playerId = `player_${++this.playerCounter}`;
        const player = {
            id: playerId,
            name: playerName,
            ws: ws,
            roomId: null,
            secretNumber: null,
            isReady: false
        };
        
        this.players.set(playerId, player);
        ws.playerId = playerId;
        
        console.log(`새 플레이어 추가: ${playerName} (${playerId})`);
        return player;
    }

    // 플레이어 제거 (테스트용으로 5분 지연)
    removePlayer(playerId) {
        const player = this.players.get(playerId);
        if (player) {
            console.log(`플레이어 제거 시작: ${player.name} (${playerId}) - 20분 후 삭제 예약`);
            if (player.roomId) {
                console.log(`${player.name}이 방에서 나갑니다. (페이지 이동일 가능성 있음)`);
                this.leaveRoom(playerId);
            }
            
            // 테스트용: 20분 후에 플레이어 삭제
            setTimeout(() => {
                if (this.players.has(playerId)) {
                    const currentPlayer = this.players.get(playerId);
                    // WebSocket이 여전히 연결되어 있다면 삭제하지 않음
                    if (!currentPlayer.ws || currentPlayer.ws.readyState !== WebSocket.OPEN) {
                        this.players.delete(playerId);
                        console.log(`플레이어 제거 완료: ${playerId} (20분 후)`);
                    } else {
                        console.log(`플레이어 삭제 취소: ${currentPlayer.name} (재연결 확인됨)`);
                    }
                }
            }, 1200000); // 20분 = 1,200,000ms
            
            console.log(`플레이어 ${player.name} 연결 끊김 - 20분간 유지됩니다`);
        }
    }

    // 새 방 생성
    createRoom(hostId, roomName, gameMode = 'single') {
        const roomId = `room_${Date.now()}`;
        
        // 게임 모드에 따른 설정
        const isBestOf3 = gameMode === 'bestOf3';
        
        const room = {
            id: roomId,
            name: roomName,
            hostId: hostId,
            players: [hostId], // 호스트가 자동으로 참가 (1명으로 시작)
            gameState: 'waiting', // waiting, setting, playing, finished
            secretNumbers: new Map(),
            gameHistory: new Map(),
            currentTurn: null,
            maxPlayers: 2,
            gameMode: gameMode, // 게임 모드 저장
            // 3판 2승제 관련
            wins: new Map(), // playerId -> 승리 횟수
            currentRound: 1,
            maxRounds: isBestOf3 ? 3 : 1,
            winsNeeded: isBestOf3 ? 2 : 1
        };
        
        this.rooms.set(roomId, room);
        
        // 호스트 플레이어를 방에 배정
        const host = this.players.get(hostId);
        host.roomId = roomId;
        
        console.log(`방 생성: ${roomName} (${roomId}) by ${host.name} - 호스트 자동 참가 (1명)`);
        
        this.broadcastRoomList();
        return room;
    }

    // 방 참가
    joinRoom(playerId, roomId) {
        const room = this.rooms.get(roomId);
        const player = this.players.get(playerId);
        
        if (!room || !player) {
            return { success: false, message: '방 또는 플레이어를 찾을 수 없습니다.' };
        }
        
        // 이미 방에 참가했는지 확인
        if (player.roomId === roomId) {
            return { success: false, message: '이미 이 방에 참가해 있습니다.' };
        }
        
        // 다른 방에 참가해 있다면 나가기
        if (player.roomId) {
            this.leaveRoom(playerId);
        }
        
        if (room.players.length >= room.maxPlayers) {
            return { success: false, message: '방이 가득 찼습니다.' };
        }
        
        if (room.gameState !== 'waiting') {
            return { success: false, message: '게임이 진행 중입니다.' };
        }
        
        // 중복 참가 방지
        if (!room.players.includes(playerId)) {
            room.players.push(playerId);
        }
        player.roomId = roomId;
        
        // 3판 2승제 승리 횟수 초기화
        if (!room.wins.has(playerId)) {
            room.wins.set(playerId, 0);
        }
        
        console.log(`${player.name}이 방 ${room.name}에 참가`);
        
        // 방의 모든 플레이어에게 업데이트 전송
        this.broadcastToRoom(roomId, {
            type: 'playerJoined',
            player: {
                id: playerId,
                name: player.name
            },
            playerCount: room.players.length
        });
        
        // 게임이 시작 가능한지 확인 (2명이 되면)
        if (room.players.length === 2) {
            room.gameState = 'setting';
            this.broadcastToRoom(roomId, {
                type: 'gameStart',
                message: '게임을 시작할 수 있습니다!'
            });
        }
        
        this.broadcastRoomList();
        return { success: true, room };
    }

    // 방 나가기
    leaveRoom(playerId) {
        const player = this.players.get(playerId);
        if (!player || !player.roomId) return;
        
        const room = this.rooms.get(player.roomId);
        if (!room) {
            // 방이 없으면 플레이어 상태만 정리
            player.roomId = null;
            player.secretNumber = null;
            player.isReady = false;
            return;
        }
        
        // 방에서 플레이어 제거
        const initialPlayerCount = room.players.length;
        room.players = room.players.filter(id => id !== playerId);
        
        // 플레이어 상태 정리
        player.roomId = null;
        player.secretNumber = null;
        player.isReady = false;
        
        // 게임 관련 데이터 정리
        room.secretNumbers.delete(playerId);
        room.gameHistory.delete(playerId);
        
        console.log(`${player.name}이 방 ${room.name}을 나감 (${initialPlayerCount} -> ${room.players.length})`);
        
        if (room.players.length === 0) {
            // 페이지 이동으로 인한 임시 연결 끊김을 고려하여 5초 후 삭제
            console.log(`방 ${room.name}이 비어있음. 5초 후 삭제 예정...`);
            setTimeout(() => {
                // 5초 후에 다시 확인해서 여전히 비어있으면 삭제
                const currentRoom = this.rooms.get(room.id);
                if (currentRoom && currentRoom.players.length === 0) {
                    this.rooms.delete(room.id);
                    console.log(`방 삭제 완료: ${room.name} (5초 후 확인하여 삭제)`);
                    this.broadcastRoomList();
                } else if (currentRoom) {
                    console.log(`방 삭제 취소: ${room.name} (플레이어 재참가 확인됨)`);
                }
            }, 5000); // 5초 대기
        } else {
            // 남은 플레이어들에게 알림
            this.broadcastToRoom(room.id, {
                type: 'playerLeft',
                playerId: playerId,
                playerName: player.name,
                playerCount: room.players.length
            });
            
            // 호스트가 나간 경우 새 호스트 지정
            if (room.hostId === playerId && room.players.length > 0) {
                room.hostId = room.players[0];
                console.log(`새 호스트 지정: ${this.players.get(room.hostId).name}`);
            }
            
            // 게임 중단 (대기 상태가 아닌 경우)
            if (room.gameState !== 'waiting') {
                room.gameState = 'waiting';
                room.currentTurn = null;
                
                // 남은 플레이어들의 준비 상태 초기화
                room.players.forEach(pid => {
                    const p = this.players.get(pid);
                    if (p) p.isReady = false;
                });
                
                this.broadcastToRoom(room.id, {
                    type: 'gameInterrupted',
                    message: '플레이어가 나가서 게임이 중단되었습니다.'
                });
            }
        }
        
        // 방 목록 즉시 업데이트
        this.broadcastRoomList();
    }

    // 비밀 숫자 설정
    setSecretNumber(playerId, numbers) {
        console.log(`setSecretNumber 호출: playerId=${playerId}, players.size=${this.players.size}`);
        
        const player = this.players.get(playerId);
        if (!player) {
            console.error(`플레이어를 찾을 수 없음: ${playerId}`);
            console.log('현재 플레이어 목록:', Array.from(this.players.keys()));
            return { success: false, message: '플레이어를 찾을 수 없습니다.' };
        }
        
        if (!player.roomId) {
            console.error(`플레이어가 방에 참가하지 않음: ${player.name} (${playerId})`);
            return { success: false, message: '먼저 방에 참가해야 합니다.' };
        }
        
        const room = this.rooms.get(player.roomId);
        
        if (!room || room.gameState !== 'setting') {
            return { success: false, message: '게임 상태가 올바르지 않습니다.' };
        }
        
        // 숫자 유효성 검사
        if (!this.isValidNumber(numbers)) {
            return { success: false, message: '올바르지 않은 숫자입니다.' };
        }
        
        room.secretNumbers.set(playerId, numbers);
        player.isReady = true;
        
        console.log(`${player.name}의 비밀 숫자 설정: ${numbers.join('')}`);
        
        // 방의 다른 플레이어에게 준비 상태 알림
        this.broadcastToRoom(room.id, {
            type: 'playerReady',
            playerId: playerId,
            playerName: player.name
        }, playerId);
        
        // 모든 플레이어가 준비되었는지 확인 (비밀 숫자도 모두 설정되었는지 함께 체크)
        const allReady = room.players.every(id => this.players.get(id).isReady) && room.secretNumbers.size === room.players.length;
        
        if (allReady && room.players.length === 2) {
            this.startGame(room.id);
        }
        
        return { success: true };
    }

    // 게임 시작
    startGame(roomId) {
        const room = this.rooms.get(roomId);
        room.gameState = 'playing';
        room.currentTurn = room.players[0]; // 첫 번째 플레이어부터 시작
        room.gameHistory.clear();
        
        console.log(`게임 시작: 방 ${room.name}`);
        
        room.players.forEach(playerId => {
            const player = this.players.get(playerId);
            const isMyTurn = playerId === room.currentTurn;
            
            player.ws.send(JSON.stringify({
                type: 'gameStarted',
                isMyTurn: isMyTurn,
                opponentName: this.getOpponentName(roomId, playerId),
                gameMode: room.gameMode
            }));
        });
    }

    // 추측하기
    makeGuess(playerId, guessNumbers) {
        const player = this.players.get(playerId);
        const room = this.rooms.get(player.roomId);
        
        if (!room || room.gameState !== 'playing') {
            return { success: false, message: '게임 상태가 올바르지 않습니다.' };
        }
        
        if (room.currentTurn !== playerId) {
            return { success: false, message: '당신의 턴이 아닙니다.' };
        }
        
        // 숫자 유효성 검사
        if (!this.isValidNumber(guessNumbers)) {
            return { success: false, message: '올바르지 않은 숫자입니다.' };
        }
        
        // 상대방 찾기
        const opponentId = room.players.find(id => id !== playerId);
        const opponentSecretNumber = room.secretNumbers.get(opponentId);
        
        // 스트라이크/볼 계산
        const result = this.calculateResult(guessNumbers, opponentSecretNumber);
        const isHomeRun = result.strikes === 4;
        
        console.log(`${player.name}의 추측: ${guessNumbers.join('')} -> ${result.strikes}S ${result.balls}B`);
        
        // 게임 히스토리에 추가
        if (!room.gameHistory.has(playerId)) {
            room.gameHistory.set(playerId, []);
        }
        room.gameHistory.get(playerId).push({
            guess: guessNumbers,
            result: result,
            isHomeRun: isHomeRun,
            timestamp: new Date()
        });
        
        // 모든 플레이어에게 결과 브로드캐스트
        this.broadcastToRoom(room.id, {
            type: 'guessResult',
            playerId: playerId,
            playerName: player.name,
            guess: guessNumbers,
            result: result,
            isHomeRun: isHomeRun
        });
        
        // 홈런이면 라운드 승리 처리
        if (isHomeRun) {
            this.handleRoundWin(room.id, playerId);
        } else {
            // 턴 변경
            this.changeTurn(room.id);
        }
        
        return { success: true, result, isHomeRun };
    }

    // 턴 변경
    changeTurn(roomId) {
        const room = this.rooms.get(roomId);
        const currentIndex = room.players.indexOf(room.currentTurn);
        const nextIndex = (currentIndex + 1) % room.players.length;
        room.currentTurn = room.players[nextIndex];
        
        this.broadcastToRoom(roomId, {
            type: 'turnChanged',
            currentTurn: room.currentTurn
        });
    }

    // 라운드 승리 처리 (3판 2승제)
    handleRoundWin(roomId, winnerId) {
        const room = this.rooms.get(roomId);
        const winner = this.players.get(winnerId);
        
        // 승리 횟수 증가
        const currentWins = room.wins.get(winnerId) || 0;
        room.wins.set(winnerId, currentWins + 1);
        
        console.log(`라운드 ${room.currentRound} 승리: ${winner.name} (${currentWins + 1}승)`);
        
        // 라운드 승리 알림
        this.broadcastToRoom(roomId, {
            type: 'roundWin',
            winner: winnerId,
            winnerName: winner.name,
            currentRound: room.currentRound,
            wins: Object.fromEntries(room.wins)
        });
        
        // 최종 승부 확인 (2승 먼저 달성)
        if (room.wins.get(winnerId) >= room.winsNeeded) {
            // 최종 게임 종료
            setTimeout(() => {
                this.endFinalGame(roomId, winnerId);
            }, 2000);
        } else {
            // 다음 라운드 준비
            room.currentRound++;
            setTimeout(() => {
                this.prepareNextRound(roomId);
            }, 3000);
        }
    }
    
    // 다음 라운드 준비
    prepareNextRound(roomId) {
        const room = this.rooms.get(roomId);
        
        if (!room) return;
        
        console.log(`라운드 ${room.currentRound} 시작 준비`);
        
        // 게임 상태 초기화
        room.gameState = 'setting';
        room.secretNumbers.clear();
        room.gameHistory.clear();
        room.currentTurn = null;
        // 플레이어 준비 상태 초기화
        room.players.forEach(playerId => {
            const p = this.players.get(playerId);
            if (p) p.isReady = false;
        });
        
        // 다음 라운드 시작 알림
        this.broadcastToRoom(roomId, {
            type: 'nextRound',
            currentRound: room.currentRound,
            wins: Object.fromEntries(room.wins)
        });
    }
    
    // 최종 게임 종료
    endFinalGame(roomId, winnerId) {
        const room = this.rooms.get(roomId);
        room.gameState = 'finished';
        
        const winner = this.players.get(winnerId);
        console.log(`최종 게임 종료: ${winner.name} 승리 (3판 2승제)`);
        
        // 모든 비밀 숫자 공개
        const secretNumbers = {};
        room.players.forEach(playerId => {
            secretNumbers[playerId] = room.secretNumbers.get(playerId);
        });
        
        this.broadcastToRoom(roomId, {
            type: 'gameEnded',
            winnerId: winnerId,
            winnerName: winner.name,
            secretNumbers: secretNumbers,
            finalWins: Object.fromEntries(room.wins),
            totalRounds: room.currentRound
        });

        // 최종 결과를 파일과 Kafka로 기록합니다.
        // - 목적: 사후 분석/통계, 외부 소비자(알림/대시보드)가 구독할 수 있도록 이벤트 발행
        const loserId = room.players.find(id => id !== winnerId) || null;
        const loser = loserId ? this.players.get(loserId) : null;
        const eventPayload = {
            type: 'gameEnded',
            timestamp: new Date().toISOString(),
            roomId: room.id,
            roomName: room.name,
            gameMode: room.gameMode,
            winnerId: winnerId,
            winnerName: winner ? winner.name : null,
            loserId: loserId,
            loserName: loser ? loser.name : null,
            finalWins: Object.fromEntries(room.wins),
            totalRounds: room.currentRound
        };

        // 파일 기록은 Kafka 유무와 무관하게 항상 수행
        appendHistoryLine({
            at: eventPayload.timestamp,
            roomId: eventPayload.roomId,
            roomName: eventPayload.roomName,
            winnerName: eventPayload.winnerName,
            loserName: eventPayload.loserName,
            gameMode: eventPayload.gameMode
        }).catch(err => console.error('히스토리 파일 기록 실패:', err));

        // Kafka 발행은 가능할 때만 시도 (프로듀서가 연결되어 있는 경우)
        if (kafkaProducer) {
            kafkaProducer.send({
                topic: kafkaTopicGameEvents,
                messages: [{ key: 'gameEnded', value: JSON.stringify(eventPayload) }]
            }).catch(err => console.error('Kafka 전송 실패:', err));
        }
    }
    
    // 단일 게임 종료 (기존 함수는 유지 - 호환성용)
    endGame(roomId, winnerId) {
        this.handleRoundWin(roomId, winnerId);
    }

    // 게임 재시작
    restartGame(roomId) {
        const room = this.rooms.get(roomId);
        room.gameState = 'setting';
        room.secretNumbers.clear();
        room.gameHistory.clear();
        room.currentTurn = null;
        
        // 3판 2승제 초기화
        room.wins.clear();
        room.currentRound = 1;
        
        // 모든 플레이어 준비 상태 초기화 및 승리 횟수 초기화
        room.players.forEach(playerId => {
            const player = this.players.get(playerId);
            player.isReady = false;
            room.wins.set(playerId, 0);
        });
        
        this.broadcastToRoom(roomId, {
            type: 'gameRestarted'
        });
        
        console.log(`게임 재시작: 방 ${room.name}`);
    }

    // 스트라이크/볼 계산
    calculateResult(guess, secret) {
        let strikes = 0;
        let balls = 0;
        
        // 스트라이크 계산
        for (let i = 0; i < 4; i++) {
            if (guess[i] === secret[i]) {
                strikes++;
            }
        }
        
        // 볼 계산
        for (let i = 0; i < 4; i++) {
            if (guess[i] !== secret[i] && secret.includes(guess[i])) {
                balls++;
            }
        }
        
        return { strikes, balls };
    }

    // 숫자 유효성 검사
    isValidNumber(numbers) {
        if (!Array.isArray(numbers) || numbers.length !== 4) {
            return false;
        }
        
        // 모든 값이 0-9 사이의 정수인지 확인
        if (numbers.some(n => !Number.isInteger(n) || n < 0 || n > 9)) {
            return false;
        }
        
        // 중복 숫자가 없는지 확인
        return new Set(numbers).size === 4;
    }

    // 상대방 이름 가져오기
    getOpponentName(roomId, playerId) {
        const room = this.rooms.get(roomId);
        const opponentId = room.players.find(id => id !== playerId);
        const opponent = this.players.get(opponentId);
        return opponent ? opponent.name : null;
    }

    // 방 목록 브로드캐스트
    broadcastRoomList() {
        const roomList = Array.from(this.rooms.values()).map(room => {
            // 유효한 플레이어만 카운트
            const validPlayers = room.players.filter(playerId => this.players.has(playerId));
            if (validPlayers.length !== room.players.length) {
                room.players = validPlayers;
                console.log(`방 ${room.name}의 플레이어 목록 정리: ${room.players.length}명`);
            }
            
            return {
                id: room.id,
                name: room.name,
                playerCount: room.players.length,
                maxPlayers: room.maxPlayers,
                gameState: room.gameState,
                gameMode: room.gameMode
            };
        });
        
        console.log(`방 목록 브로드캐스트: ${roomList.length}개 방`);
        
        this.players.forEach(player => {
            try {
                if (player.ws.readyState === WebSocket.OPEN && !player.roomId) {
                    player.ws.send(JSON.stringify({
                        type: 'roomList',
                        rooms: roomList
                    }));
                }
            } catch (error) {
                console.error(`방 목록 전송 오류 (${player.name}):`, error);
            }
        });
    }

    // 특정 방에 메시지 브로드캐스트
    broadcastToRoom(roomId, message, excludePlayerId = null) {
        const room = this.rooms.get(roomId);
        if (!room) return;
        
        room.players.forEach(playerId => {
            if (playerId !== excludePlayerId) {
                const player = this.players.get(playerId);
                if (player && player.ws.readyState === WebSocket.OPEN) {
                    player.ws.send(JSON.stringify(message));
                }
            }
        });
    }

    // 모든 플레이어에게 브로드캐스트
    broadcast(message, excludePlayerId = null) {
        this.players.forEach(player => {
            if (player.id !== excludePlayerId && player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(JSON.stringify(message));
            }
        });
    }
    
    // 이모티콘 처리
    handleEmoji(senderId, emoji, message) {
        const sender = this.players.get(senderId);
        if (!sender || !sender.roomId) {
            console.log('이모티콘 전송 실패: 플레이어 또는 방 정보 없음');
            return;
        }
        
        const room = this.rooms.get(sender.roomId);
        if (!room) {
            console.log('이모티콘 전송 실패: 방을 찾을 수 없음');
            return;
        }
        
        console.log(`이모티콘 전송: ${sender.name} -> ${emoji} (${message})`);
        
        // 같은 방의 다른 플레이어들에게 이모티콘 전송
        room.players.forEach(playerId => {
            if (playerId !== senderId) {
                const player = this.players.get(playerId);
                if (player && player.ws.readyState === WebSocket.OPEN) {
                    player.ws.send(JSON.stringify({
                        type: 'emojiReceived',
                        emoji: emoji,
                        message: message,
                        senderName: sender.name,
                        senderId: senderId
                    }));
                }
            }
        });
    }
}

// 게임 서버 인스턴스 생성
const gameServer = new GameServer();

// 웹소켓 연결 처리
wss.on('connection', (ws) => {
    console.log('새 클라이언트 연결');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('받은 메시지:', data);

            switch (data.type) {
                case 'subscribeHistory':
                    // 히스토리 실시간 구독 등록
                    historySubscribers.add(ws);
                    ws.send(JSON.stringify({ type: 'historySubscribed' }));
                    break;
                case 'join':
                    const newPlayer = gameServer.addPlayer(ws, data.playerName);
                    ws.send(JSON.stringify({
                        type: 'joined',
                        playerId: newPlayer.id,
                        playerName: newPlayer.name
                    }));
                    // 유저 접속 기록 (파일 + Kafka)
                    try {
                        const record = {
                            at: new Date().toISOString(),
                            event: 'join',
                            playerId: newPlayer.id,
                            playerName: newPlayer.name
                        };
                        appendUserHistoryLine(record).catch(() => {});
                        if (kafkaProducer) {
                            kafkaProducer.send({
                                topic: kafkaTopicUserEvents,
                                messages: [{ key: 'join', value: JSON.stringify(record) }]
                            }).catch(() => {});
                        }
                    } catch {}
                    // 접속자 목록 브로드캐스트
                    broadcastOnlineUsers();
                    gameServer.broadcastRoomList();
                    break;

                case 'createRoom':
                    const room = gameServer.createRoom(ws.playerId, data.roomName, data.gameMode);
                    ws.send(JSON.stringify({
                        type: 'roomCreated',
                        room: {
                            id: room.id,
                            name: room.name,
                            gameMode: room.gameMode,
                            playerCount: room.players.length
                        }
                    }));
                    break;

                case 'joinRoom':
                    const joinResult = gameServer.joinRoom(ws.playerId, data.roomId);
                    ws.send(JSON.stringify({
                        type: 'joinRoomResult',
                        ...joinResult
                    }));
                    break;

                case 'setNumber':
                    const setResult = gameServer.setSecretNumber(ws.playerId, data.numbers);
                    ws.send(JSON.stringify({
                        type: 'setNumberResult',
                        ...setResult
                    }));
                    break;

                case 'makeGuess':
                    const guessResult = gameServer.makeGuess(ws.playerId, data.numbers);
                    ws.send(JSON.stringify({
                        type: 'guessResult',
                        ...guessResult
                    }));
                    break;

                case 'leaveRoom':
                    gameServer.leaveRoom(ws.playerId);
                    // 유저 퇴장 기록 (파일 + Kafka)
                    try {
                        const player = gameServer.players.get(ws.playerId);
                        const record = {
                            at: new Date().toISOString(),
                            event: 'leave',
                            playerId: ws.playerId,
                            playerName: player ? player.name : null
                        };
                        appendUserHistoryLine(record).catch(() => {});
                        if (kafkaProducer) {
                            kafkaProducer.send({
                                topic: kafkaTopicUserEvents,
                                messages: [{ key: 'leave', value: JSON.stringify(record) }]
                            }).catch(() => {});
                        }
                    } catch {}
                    // 접속자 목록 브로드캐스트
                    broadcastOnlineUsers();
                    break;

                case 'restartGame':
                    const restartPlayer = gameServer.players.get(ws.playerId);
                    if (restartPlayer && restartPlayer.roomId) {
                        gameServer.restartGame(restartPlayer.roomId);
                    }
                    break;
                    
                case 'sendEmoji':
                    gameServer.handleEmoji(ws.playerId, data.emoji, data.message);
                    break;

                case 'getRooms':
                    gameServer.broadcastRoomList();
                    break;

                default:
                    console.log('알 수 없는 메시지 타입:', data.type);
            }
        } catch (error) {
            console.error('메시지 처리 오류:', error);
        }
    });

    ws.on('close', () => {
        console.log('클라이언트 연결 종료');
        // 히스토리 구독자 목록에서 제거
        if (historySubscribers.has(ws)) {
            historySubscribers.delete(ws);
        }
        // 유저 퇴장 기록 (홈페이지 닫힘 포함)
        try {
            if (ws.playerId) {
                const player = gameServer.players.get(ws.playerId);
                const record = {
                    at: new Date().toISOString(),
                    event: 'leave',
                    playerId: ws.playerId,
                    playerName: player ? player.name : null
                };
                appendUserHistoryLine(record).catch(() => {});
                if (kafkaProducer) {
                    kafkaProducer.send({
                        topic: kafkaTopicUserEvents,
                        messages: [{ key: 'leave', value: JSON.stringify(record) }]
                    }).catch(() => {});
                }
            }
        } catch {}
        if (ws.playerId) {
            // 명시적으로 방에서 나가기 처리
            const player = gameServer.players.get(ws.playerId);
            if (player && player.roomId) {
                gameServer.leaveRoom(ws.playerId);
            }
            gameServer.removePlayer(ws.playerId);
            gameServer.broadcastRoomList();
            // 접속자 목록 브로드캐스트
            broadcastOnlineUsers();
        }
    });

    ws.on('error', (error) => {
        console.error('웹소켓 오류:', error);
    });
});

// 서버 시작
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🎮 야구게임 서버가 포트 ${PORT}에서 실행 중입니다!`);
    console.log(`http://localhost:${PORT} 에서 게임을 시작하세요.`);
}); 