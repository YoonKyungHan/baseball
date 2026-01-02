// 게임 상태 관리
class BaseballGame {
    constructor() {
        this.myNumber = [];
        this.opponentNumber = [];
        this.gameHistory = {
            my: [],
            opponent: []
        };
        this.gamePhase = 'setting'; // setting, waiting, playing, finished
        this.isMyTurn = false;
        this.roomId = null;
        this.playerId = null;
        this.playerName = '';
        this.opponentName = '';

        // AI 모드 관련
        this.isSoloMode = false;
        this.aiPossibleNumbers = [];
        this.aiAttempts = 0;

        // 게임 모드 관련
        this.gameMode = 'single'; // 기본값: 단판
        this.myWins = 0;
        this.opponentWins = 0;
        this.currentRound = 1;
        this.maxRounds = 1;
        this.winsNeeded = 1;

        this.checkGameMode();
        this.initializeEventListeners();
        this.initializeEmojis();

        // 초기 UI 설정
        this.updateRoundInfo();
        this.updateWinIndicators();
    }

    // 게임 모드 확인 (솔로 vs 멀티플레이어)
    checkGameMode() {
        const urlParams = new URLSearchParams(window.location.search);
        const mode = urlParams.get('mode');
        const playerName = urlParams.get('player');

        if (mode === 'solo' && playerName) {
            this.isSoloMode = true;
            this.playerName = decodeURIComponent(playerName);
            this.opponentName = 'AI 상대';
            this.playerId = 'solo_player';

            // 솔로 모드에서는 단판을 디폴트로 설정
            this.setGameMode('single');

            console.log('AI 모드로 게임 시작 (단판)');

            // AI 모드 UI 초기화
            this.initializeSoloMode();
        } else {
            // 멀티플레이어 모드 - 단순화된 초기화
            this.isSoloMode = false;
            console.log('멀티플레이어 모드로 초기화됨');

            // URL에서 정보 가져오기
            const roomId = urlParams.get('room');
            let playerNameFromURL = urlParams.get('player');

            if (roomId) {
                this.roomId = roomId;
                console.log('Room ID:', roomId);
                document.getElementById('roomName').textContent = `방: ${roomId.slice(-4)}`;
            }

            if (playerNameFromURL) {
                this.playerName = decodeURIComponent(playerNameFromURL);
                document.getElementById('myName').textContent = this.playerName;
                console.log('플레이어:', this.playerName);
            } else {
                // localStorage에서 가져오기 시도
                const savedName = localStorage.getItem('playerName');
                if (savedName) {
                    this.playerName = savedName;
                    document.getElementById('myName').textContent = this.playerName;
                    console.log('플레이어 (localStorage):', this.playerName);
                } else {
                    this.playerName = '익명';
                    document.getElementById('myName').textContent = '익명';
                    console.warn('플레이어 이름을 찾을 수 없음');
                }
            }

            // 기본 UI 설정
            document.getElementById('gamePhase').textContent = '연결 중...';
            document.getElementById('opponentName').textContent = '상대방을 기다리는 중...';

            // 연결 상태 확인만 하고, 사용자가 직접 새로고침하도록 안내
            setTimeout(() => {
                if (window.gameClient && window.gameClient.isConnected) {
                    this.joinRoom();
                } else {
                    document.getElementById('gamePhase').textContent = '서버 연결이 필요합니다. 새로고침 해주세요.';
                }
            }, 1000);
        }
    }



    // 방 참가 시도
    joinRoom() {
        console.log('방 참가 시도...');
        if (!this.playerName || !this.roomId) {
            console.error('플레이어 이름 또는 방 ID 없음');
            document.getElementById('gamePhase').textContent = '정보 부족 - 로비에서 다시 시도해주세요';
            return;
        }

        try {
            // join 메시지 먼저 보내기
            window.gameClient.join(this.playerName);

            // 잠시 후 방 참가
            setTimeout(() => {
                if (window.gameClient.playerId) {
                    console.log('방 참가:', this.roomId);
                    window.gameClient.joinRoom(this.roomId);
                    document.getElementById('gamePhase').textContent = '방에 참가했습니다. 숫자를 설정해주세요.';
                } else {
                    console.log('playerId 아직 설정되지 않음');
                    document.getElementById('gamePhase').textContent = '연결 중... 잠시만 기다려주세요.';
                }
            }, 1000);
        } catch (error) {
            console.error('방 참가 오류:', error);
            document.getElementById('gamePhase').textContent = '오류 발생 - 로비에서 다시 시도해주세요';
        }
    }



    // 솔로 모드 초기화
    initializeSoloMode() {
        // 플레이어 정보 업데이트
        document.getElementById('myName').textContent = this.playerName;
        document.getElementById('opponentName').textContent = this.opponentName;
        document.getElementById('roomName').textContent = 'AI 대전';
        document.getElementById('playerCount').textContent = '플레이어: 2/2';

        // AI 비밀 숫자 생성
        this.generateAINumber();

        // 게임 상태 업데이트
        document.getElementById('gamePhase').textContent = '숫자를 설정해주세요';

        // AI가 추측할 수 있는 모든 가능한 숫자 조합 생성
        this.generateAIPossibleNumbers();
    }

    // AI 비밀 숫자 생성
    generateAINumber() {
        const numbers = [];
        while (numbers.length < 4) {
            const num = Math.floor(Math.random() * 10);
            if (!numbers.includes(num)) {
                numbers.push(num);
            }
        }
        this.opponentNumber = numbers;
        console.log('AI의 비밀 숫자:', this.opponentNumber.join(''));
    }

    // AI가 추측 가능한 모든 숫자 조합 생성
    generateAIPossibleNumbers() {
        this.aiPossibleNumbers = [];

        // 0-9 중에서 4개의 서로 다른 숫자 조합 생성
        for (let a = 0; a <= 9; a++) {
            for (let b = 0; b <= 9; b++) {
                if (b === a) continue;
                for (let c = 0; c <= 9; c++) {
                    if (c === a || c === b) continue;
                    for (let d = 0; d <= 9; d++) {
                        if (d === a || d === b || d === c) continue;
                        this.aiPossibleNumbers.push([a, b, c, d]);
                    }
                }
            }
        }

        console.log(`AI 가능한 조합 수: ${this.aiPossibleNumbers.length}`);
    }

    initializeEventListeners() {
        // 숫자 입력 필드 이벤트
        this.setupNumberInputs();

        // 버튼 이벤트
        document.getElementById('setNumberBtn').addEventListener('click', () => this.setMyNumber());
        document.getElementById('guessBtn').addEventListener('click', () => this.makeGuess());
        document.getElementById('leaveRoomBtn').addEventListener('click', () => this.leaveRoom());
        document.getElementById('restartBtn').addEventListener('click', () => this.restartGame());

        // 모달 이벤트
        document.getElementById('playAgainBtn').addEventListener('click', () => this.playAgain());
        document.getElementById('goLobbyBtn').addEventListener('click', () => this.goToLobby());
    }

    setupNumberInputs() {
        // 숫자 설정 입력 필드
        const numberInputs = document.querySelectorAll('.number-input');
        numberInputs.forEach((input, index) => {
            input.addEventListener('input', (e) => {
                this.handleNumberInput(e, index, numberInputs);
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !e.target.value && index > 0) {
                    numberInputs[index - 1].focus();
                }
            });
        });

        // 추측 입력 필드
        const guessInputs = document.querySelectorAll('.guess-digit');
        guessInputs.forEach((input, index) => {
            input.addEventListener('input', (e) => {
                this.handleNumberInput(e, index, guessInputs);
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.makeGuess();
                } else if (e.key === 'Backspace' && !e.target.value && index > 0) {
                    guessInputs[index - 1].focus();
                }
            });
        });
    }

    handleNumberInput(event, index, inputs) {
        const value = event.target.value;

        // 한 자리 숫자만 허용
        if (value.length > 1) {
            event.target.value = value.slice(-1);
        }

        // 숫자가 입력되면 다음 필드로 이동
        if (event.target.value && index < inputs.length - 1) {
            inputs[index + 1].focus();
        }

        // 중복 체크 (실시간)
        this.checkDuplicates(inputs);
    }

    checkDuplicates(inputs) {
        const values = Array.from(inputs).map(input => input.value).filter(v => v !== '');
        const uniqueValues = [...new Set(values)];

        inputs.forEach(input => {
            if (values.filter(v => v === input.value).length > 1 && input.value !== '') {
                input.style.borderColor = '#ff6b6b';
                input.style.backgroundColor = '#ffebee';
            } else {
                input.style.borderColor = '#ddd';
                input.style.backgroundColor = 'white';
            }
        });

        return values.length === uniqueValues.length && values.length === 4;
    }

    setMyNumber() {
        const inputs = document.querySelectorAll('.number-input');
        const numbers = Array.from(inputs).map(input => parseInt(input.value));

        // 유효성 검사
        if (numbers.some(isNaN) || numbers.length !== 4) {
            this.showMessage('4자리 숫자를 모두 입력해주세요!', 'error');
            return;
        }

        if (new Set(numbers).size !== 4) {
            this.showMessage('중복된 숫자는 사용할 수 없습니다!', 'error');
            return;
        }

        this.myNumber = numbers;

        if (this.isSoloMode) {
            // AI 모드에서는 즉시 게임 시작
            this.gamePhase = 'playing';
            this.isMyTurn = true;

            // UI 업데이트
            document.getElementById('setNumberBtn').disabled = true;
            inputs.forEach(input => input.disabled = true);
            document.getElementById('gamePhase').textContent = '게임 진행 중';
            document.getElementById('guessArea').style.display = 'block';

            // 이모티콘 버튼 표시
            this.updateEmojiVisibility();

            // 라운드 정보 업데이트
            this.updateRoundInfo();

            this.showMessage('숫자가 설정되었습니다! 게임 시작!', 'success');
            this.updateTurnIndicator();
        } else {
            // 멀티플레이어 모드
            this.gamePhase = 'waiting';

            // UI 업데이트
            document.getElementById('setNumberBtn').disabled = true;
            inputs.forEach(input => input.disabled = true);
            document.getElementById('gamePhase').textContent = '상대방을 기다리는 중...';

            this.showMessage('숫자가 설정되었습니다!', 'success');

            // 웹소켓으로 서버에 전송
            if (window.gameClient && window.gameClient.playerId) {
                console.log('setNumber 호출: playerId =', window.gameClient.playerId);
                window.gameClient.setNumber(numbers);
            } else {
                console.log('playerId가 아직 설정되지 않음. 잠시 후 다시 시도...');
                // playerId가 설정될 때까지 대기
                const waitForPlayerId = () => {
                    if (window.gameClient && window.gameClient.playerId) {
                        console.log('playerId 설정 완료. setNumber 호출:', window.gameClient.playerId);
                        window.gameClient.setNumber(numbers);
                    } else {
                        setTimeout(waitForPlayerId, 100);
                    }
                };
                waitForPlayerId();
            }
        }
    }

    makeGuess() {
        if (!this.isMyTurn) {
            this.showMessage('상대방의 턴입니다!', 'warning');
            return;
        }

        const inputs = document.querySelectorAll('.guess-digit');
        const guessNumbers = Array.from(inputs).map(input => parseInt(input.value));

        // 유효성 검사
        if (guessNumbers.some(isNaN) || guessNumbers.length !== 4) {
            this.showMessage('4자리 숫자를 모두 입력해주세요!', 'error');
            return;
        }

        if (new Set(guessNumbers).size !== 4) {
            this.showMessage('중복된 숫자는 사용할 수 없습니다!', 'error');
            return;
        }

        if (this.isSoloMode) {
            // AI 모드에서는 로컬에서 게임 진행
            this.processSoloGuess(guessNumbers);

            // 솔로 모드에서는 즉시 턴 변경
            inputs.forEach(input => {
                input.value = '';
                input.disabled = true;
            });
            this.isMyTurn = false;
            this.updateTurnIndicator();
        } else {
            // 웹소켓으로 추측 전송
            if (window.gameClient && window.gameClient.playerId) {
                console.log('makeGuess 호출: playerId =', window.gameClient.playerId);
                window.gameClient.makeGuess(guessNumbers);

                // 추측을 보냈으니 일단 입력 필드는 비활성화하고 초기화
                inputs.forEach(input => {
                    input.value = '';
                    input.disabled = true;
                });

                // 하지만 턴 변경은 서버에서 turnChanged 이벤트를 받을 때까지 기다림
                this.showMessage('추측을 전송했습니다. 결과를 기다리는 중...', 'info');

            } else {
                console.log('playerId가 설정되지 않음. 연결을 확인해주세요.');
                this.showMessage('서버 연결에 문제가 있습니다.', 'error');
            }
        }
    }

    // 야구게임 핵심 로직: 스트라이크/볼 계산
    calculateResult(guess, secret) {
        let strikes = 0;
        let balls = 0;

        // 스트라이크 계산 (같은 위치의 같은 숫자)
        for (let i = 0; i < 4; i++) {
            if (guess[i] === secret[i]) {
                strikes++;
            }
        }

        // 볼 계산 (다른 위치의 같은 숫자)
        for (let i = 0; i < 4; i++) {
            if (guess[i] !== secret[i] && secret.includes(guess[i])) {
                balls++;
            }
        }

        return { strikes, balls };
    }

    // 솔로 모드에서의 추측 처리
    processSoloGuess(guessNumbers) {
        // 디버깅: AI 비밀 숫자 확인
        console.log(`AI의 현재 비밀 숫자: [${this.opponentNumber.join(', ')}]`);
        console.log(`내 추측: [${guessNumbers.join(', ')}]`);

        // 내 추측 결과 계산
        const result = this.calculateResult(guessNumbers, this.opponentNumber);
        const isHomeRun = result.strikes === 4;

        console.log(`결과: ${result.strikes}S ${result.balls}B`);

        // 히스토리에 추가
        this.addToHistory('my', guessNumbers, result, isHomeRun);

        if (isHomeRun) {
            // 내가 승리
            this.showGameResult(this.playerId);
            return;
        }

        // AI 턴 처리 (약간의 지연 후)
        setTimeout(() => {
            this.processAITurn();
        }, 1500);
    }

    // AI 턴 처리
    processAITurn() {
        this.aiAttempts++;

        // AI 추측 생성
        const aiGuess = this.generateAIGuess();
        console.log(`AI 추측: ${aiGuess.join('')}`);

        // AI 추측 결과 계산
        const result = this.calculateResult(aiGuess, this.myNumber);
        const isHomeRun = result.strikes === 4;

        // 히스토리에 추가
        this.addToHistory('opponent', aiGuess, result, isHomeRun);

        if (isHomeRun) {
            // AI 승리
            setTimeout(() => {
                this.showGameResult('ai');
            }, 1000);
            return;
        }

        // AI가 학습: 가능한 숫자 조합에서 불가능한 것들 제거
        this.updateAIPossibleNumbers(aiGuess, result);

        // 다시 내 턴
        setTimeout(() => {
            this.isMyTurn = true;
            this.updateTurnIndicator();
        }, 2000);
    }

    // AI 추측 생성
    generateAIGuess() {
        if (this.aiPossibleNumbers.length === 0) {
            // 가능한 조합이 없으면 랜덤 생성
            return this.generateRandomNumber();
        }

        if (this.aiAttempts <= 2) {
            // 초기에는 랜덤하게 선택
            const randomIndex = Math.floor(Math.random() * this.aiPossibleNumbers.length);
            return [...this.aiPossibleNumbers[randomIndex]];
        } else {
            // 나중에는 더 전략적으로 선택
            // 가장 많은 정보를 얻을 수 있는 추측 선택
            return this.chooseBestAIGuess();
        }
    }

    // 랜덤 숫자 생성
    generateRandomNumber() {
        const numbers = [];
        while (numbers.length < 4) {
            const num = Math.floor(Math.random() * 10);
            if (!numbers.includes(num)) {
                numbers.push(num);
            }
        }
        return numbers;
    }

    // 최적의 AI 추측 선택
    chooseBestAIGuess() {
        if (this.aiPossibleNumbers.length <= 50) {
            // 후보가 적으면 랜덤 선택
            const randomIndex = Math.floor(Math.random() * this.aiPossibleNumbers.length);
            return [...this.aiPossibleNumbers[randomIndex]];
        } else {
            // 후보가 많으면 중간값들 선택
            const midIndex = Math.floor(this.aiPossibleNumbers.length / 2);
            return [...this.aiPossibleNumbers[midIndex]];
        }
    }

    // AI 가능 숫자 업데이트 (결과 기반 필터링)
    updateAIPossibleNumbers(aiGuess, actualResult) {
        this.aiPossibleNumbers = this.aiPossibleNumbers.filter(candidate => {
            const simulatedResult = this.calculateResult(aiGuess, candidate);
            return simulatedResult.strikes === actualResult.strikes &&
                simulatedResult.balls === actualResult.balls;
        });

        console.log(`AI 학습 후 가능한 조합: ${this.aiPossibleNumbers.length}개`);
    }

    // 게임 결과를 히스토리에 추가
    addToHistory(player, guess, result, isHomeRun = false) {
        // 데이터 유효성 검사
        if (!guess || !Array.isArray(guess) || guess.length !== 4) {
            console.error('유효하지 않은 추측 데이터:', guess);
            return;
        }

        if (!result || typeof result.strikes !== 'number' || typeof result.balls !== 'number') {
            console.error('유효하지 않은 결과 데이터:', result);
            return;
        }

        if (!this.gameHistory[player]) {
            console.error('유효하지 않은 플레이어:', player);
            return;
        }

        const historyItem = {
            guess: [...guess], // 안전한 복사
            strikes: result.strikes,
            balls: result.balls,
            isHomeRun: isHomeRun,
            timestamp: new Date().toLocaleTimeString()
        };

        this.gameHistory[player].push(historyItem);
        this.displayHistory();

        // 임팩트 효과 적용
        setTimeout(() => {
            const lastItem = document.querySelector(`#${player}History .history-item:last-child`);
            if (lastItem) {
                this.applyImpactEffect(lastItem, result, isHomeRun);
            }
        }, 100);
    }

    // 임팩트 효과 적용
    applyImpactEffect(element, result, isHomeRun) {
        if (isHomeRun) {
            element.classList.add('home-run-effect');
        } else if (result.strikes >= 2) {
            element.classList.add('strike-effect');
        } else if (result.balls >= 2) {
            element.classList.add('ball-effect');
        } else {
            element.classList.add('out-effect');
        }

        // 효과 제거 (재사용을 위해)
        setTimeout(() => {
            element.classList.remove('home-run-effect', 'strike-effect', 'ball-effect', 'out-effect');
        }, 1500);
    }

    // 히스토리 표시
    displayHistory() {
        const myHistoryEl = document.getElementById('myHistory');
        const opponentHistoryEl = document.getElementById('opponentHistory');

        myHistoryEl.innerHTML = this.generateHistoryHTML(this.gameHistory.my);
        opponentHistoryEl.innerHTML = this.generateHistoryHTML(this.gameHistory.opponent);

        // 스크롤을 최하단으로
        myHistoryEl.scrollTop = myHistoryEl.scrollHeight;
        opponentHistoryEl.scrollTop = opponentHistoryEl.scrollHeight;
    }

    generateHistoryHTML(history) {
        return history.map(item => `
            <div class="history-item">
                <span class="guess-numbers">${item.guess.join('')}</span>
                <span class="result ${item.isHomeRun ? 'home-run' : (item.strikes > 0 ? 'strike' : (item.balls > 0 ? 'ball' : 'out'))}">
                    ${item.isHomeRun ? 'HOME RUN!' : `${item.strikes}S ${item.balls}B`}
                </span>
            </div>
        `).join('');
    }

    // 턴 표시 업데이트
    updateTurnIndicator() {
        const turnEl = document.getElementById('currentTurn');
        const guessInputs = document.querySelectorAll('.guess-digit');

        if (this.gamePhase === 'playing') {
            if (this.isMyTurn) {
                turnEl.textContent = '내 턴';
                turnEl.style.color = '#4CAF50';
                guessInputs.forEach(input => input.disabled = false);
            } else {
                turnEl.textContent = '상대방 턴';
                turnEl.style.color = '#ff6b6b';
                guessInputs.forEach(input => input.disabled = true);
            }
        }
    }

    // 게임 상태 업데이트
    updateGameState(state) {
        this.gamePhase = state.phase;
        this.isMyTurn = state.isMyTurn;

        // 게임 모드 설정 (처음 받을 때만)
        if (state.gameMode && state.gameMode !== this.gameMode) {
            this.setGameMode(state.gameMode);
        } else if (!state.gameMode && this.gameMode === 'single' && !this.isSoloMode) {
            // 멀티플레이어 모드인데 게임 모드가 설정되지 않았다면 기본값으로 설정
            this.setGameMode('single');
        }

        const phaseEl = document.getElementById('gamePhase');
        const guessArea = document.getElementById('guessArea');

        switch (state.phase) {
            case 'waiting':
                phaseEl.textContent = '상대방을 기다리는 중...';
                break;
            case 'playing':
                phaseEl.textContent = '게임 진행 중';
                guessArea.style.display = 'block';
                break;
            case 'finished':
                phaseEl.textContent = '게임 종료';
                this.showGameResult(state.winner);
                break;
        }

        // 이모티콘 가시성 업데이트
        this.updateEmojiVisibility();

        this.updateTurnIndicator();
    }

    // 게임 모드 설정
    setGameMode(gameMode) {
        this.gameMode = gameMode;

        if (gameMode === 'bestOf3') {
            this.maxRounds = 3;
            this.winsNeeded = 2;
        } else {
            this.maxRounds = 1;
            this.winsNeeded = 1;
        }

        // UI 업데이트 (DOM이 준비된 상태에서만)
        setTimeout(() => {
            this.updateRoundInfo();
            this.updateWinIndicators();
        }, 0);

        console.log(`게임 모드 설정: ${gameMode === 'bestOf3' ? '🏆 3판 2승제' : '🎯 단판'}`);
    }

    // 게임 결과 표시
    showGameResult(winner) {
        if (this.gameMode === 'bestOf3') {
            // 3판 2승제에서는 라운드 승리 처리
            this.handleRoundWin(winner);
        } else {
            // 단판에서는 즉시 최종 결과 표시
            this.showFinalGameResult(winner);
        }
    }

    // 내 추측 히스토리 HTML 생성
    generateMyGuessesHTML() {
        if (this.gameHistory.my.length === 0) {
            return '<div class="my-guesses"><h4>내 추측 기록이 없습니다.</h4></div>';
        }

        const guessesHTML = this.gameHistory.my.map((item, index) => `
            <div class="guess-summary-item ${item.isHomeRun ? 'homerun' : ''}">
                <span class="guess-number">${index + 1}회차</span>
                <span class="guess-value">${item.guess.join('')}</span>
                <span class="guess-result ${item.isHomeRun ? 'home-run' : (item.strikes > 0 ? 'strike' : (item.balls > 0 ? 'ball' : 'out'))}">
                    ${item.isHomeRun ? 'HOME RUN!' : `${item.strikes}S ${item.balls}B`}
                </span>
            </div>
        `).join('');

        return `
            <div class="my-guesses">
                <h4>🎯 내 추측 기록 상대방 숫자: ${this.opponentNumber.join(', ')}</h4>
                <div class="guess-summary-list">
                    ${guessesHTML}
                </div>
            </div>
        `;
    }

    // 메시지 표시
    showMessage(message, type = 'info') {
        const messageEl = document.createElement('div');
        messageEl.className = `message message-${type}`;
        messageEl.textContent = message;
        messageEl.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            padding: 15px 25px;
            border-radius: 8px;
            color: white;
            font-weight: bold;
            z-index: 10000;
            animation: slideDown 0.3s ease;
        `;

        switch (type) {
            case 'success':
                messageEl.style.background = 'linear-gradient(45deg, #4CAF50, #45a049)';
                break;
            case 'error':
                messageEl.style.background = 'linear-gradient(45deg, #ff6b6b, #ee5a24)';
                break;
            case 'warning':
                messageEl.style.background = 'linear-gradient(45deg, #FF9800, #F57C00)';
                break;
            default:
                messageEl.style.background = 'linear-gradient(45deg, #2196F3, #1976D2)';
        }

        document.body.appendChild(messageEl);

        setTimeout(() => {
            messageEl.style.animation = 'slideUp 0.3s ease';
            setTimeout(() => messageEl.remove(), 300);
        }, 3000);
    }

    // 게임 재시작
    restartGame() {
        this.myNumber = [];
        this.opponentNumber = [];
        this.gameHistory = { my: [], opponent: [] };
        this.gamePhase = 'setting';
        this.isMyTurn = false;

        // 승부 변수 초기화 (게임 모드는 유지)
        this.myWins = 0;
        this.opponentWins = 0;
        this.currentRound = 1;

        // 솔로 모드인 경우 AI 관련 변수 초기화
        if (this.isSoloMode) {
            this.aiAttempts = 0;
            this.aiPossibleNumbers = [];

            // AI 비밀 숫자 다시 생성
            this.generateAINumber();
            this.generateAIPossibleNumbers();

            console.log('AI 재시작: 새로운 비밀 숫자 생성됨');
        }

        // UI 초기화
        document.querySelectorAll('.number-input, .guess-digit').forEach(input => {
            input.value = '';
            input.disabled = false;
            input.style.borderColor = '#ddd';
            input.style.backgroundColor = 'white';
        });

        document.getElementById('setNumberBtn').disabled = false;
        document.getElementById('guessArea').style.display = 'none';
        document.getElementById('gamePhase').textContent = '숫자를 설정해주세요';
        document.getElementById('currentTurn').textContent = '';

        // 3판 2승제 UI 초기화
        this.updateWinIndicators();
        this.updateRoundInfo();

        // 최종 승자 하이라이트 제거
        document.querySelector('.my-area').classList.remove('final-winner');
        document.querySelector('.opponent-area').classList.remove('final-winner');

        this.displayHistory();

        // 모달 닫기
        const modal = document.getElementById('gameResultModal');
        modal.classList.remove('show', 'victory-modal', 'defeat-modal');

        // 멀티플레이어 모드에서만 웹소켓으로 재시작 요청
        if (!this.isSoloMode && window.gameClient) {
            window.gameClient.restartGame();
        }
    }

    playAgain() {
        this.restartGame();
    }

    goToLobby() {
        if (this.isSoloMode) {
            // 솔로 모드에서는 플레이어 이름과 함께 로비로
            window.location.href = `lobby.html?player=${encodeURIComponent(this.playerName)}`;
        } else {
            window.location.href = 'lobby.html';
        }
    }

    leaveRoom() {
        if (confirm('정말로 방을 나가시겠습니까?')) {
            if (window.gameClient) {
                window.gameClient.leaveRoom();
            }
            window.location.href = 'lobby.html';
        }
    }

    // 플레이어 정보 업데이트
    updatePlayerInfo(myName, opponentName) {
        this.playerName = myName;
        this.opponentName = opponentName;

        document.getElementById('myName').textContent = myName;
        document.getElementById('opponentName').textContent = opponentName || '상대방을 기다리는 중...';
    }

    // 방 정보 업데이트
    updateRoomInfo(roomName, playerCount) {
        document.getElementById('roomName').textContent = roomName;
        document.getElementById('playerCount').textContent = `플레이어: ${playerCount}/2`;
    }

    // 이모티콘 기능 초기화
    initializeEmojis() {
        const toggleBtn = document.getElementById('toggleEmojiBtn');
        const emojiPanel = document.getElementById('emojiPanel');
        const emojiButtons = document.querySelectorAll('.emoji-btn');

        if (!toggleBtn || !emojiPanel) return;

        // 이모티콘 패널 토글
        toggleBtn.addEventListener('click', () => {
            const isVisible = emojiPanel.style.display !== 'none';
            emojiPanel.style.display = isVisible ? 'none' : 'block';
            toggleBtn.textContent = isVisible ? '😊 감정표현' : '❌ 닫기';
        });

        // 이모티콘 버튼 클릭 이벤트
        emojiButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const emoji = btn.dataset.emoji;
                const title = btn.getAttribute('title');
                this.sendEmoji(emoji, title);

                // 패널 닫기
                emojiPanel.style.display = 'none';
                toggleBtn.textContent = '😊 감정표현';
            });
        });

        // 게임 진행 중에만 이모티콘 표시
        this.updateEmojiVisibility();
    }

    // 이모티콘 가시성 업데이트
    updateEmojiVisibility() {
        const emojiSection = document.querySelector('.emoji-section');
        if (emojiSection) {
            const isPlaying = this.gamePhase === 'playing';
            // emojiSection.style.display = isPlaying ? 'block' : 'none';
        }
    }

    // 이모티콘 전송
    sendEmoji(emoji, message) {
        if (this.isSoloMode) {
            // 솔로 모드에서는 자신에게만 표시하고 AI 반응
            this.showEmojiAnimation(emoji, `나: ${message}`);
            setTimeout(() => {
                this.generateAIEmojiResponse(emoji);
            }, 1000);
        } else if (window.gameClient && window.gameClient.isConnected) {
            // 멀티플레이어 모드에서는 서버로 전송
            window.gameClient.sendEmoji(emoji, message);
            this.showEmojiAnimation(emoji, `나: ${message}`);
        }
    }

    // 이모티콘 애니메이션 표시
    showEmojiAnimation(emoji, message) {
        this.createFloatingEmoji(emoji);
        this.showEmojiMessage(message);
    }

    // 떠오르는 이모티콘 생성
    createFloatingEmoji(emoji) {
        const animationArea = document.getElementById('emojiAnimationArea');
        if (!animationArea) return;

        const floatingEmoji = document.createElement('div');
        floatingEmoji.className = 'floating-emoji';
        floatingEmoji.textContent = emoji;

        // 랜덤 위치에서 시작
        floatingEmoji.style.left = Math.random() * (window.innerWidth - 100) + 'px';
        floatingEmoji.style.bottom = '0px';

        animationArea.appendChild(floatingEmoji);

        // 애니메이션 완료 후 제거
        setTimeout(() => {
            floatingEmoji.remove();
        }, 2500);
    }

    // 이모티콘 메시지 표시
    showEmojiMessage(message) {
        const existingMessage = document.querySelector('.emoji-message');
        if (existingMessage) {
            existingMessage.remove();
        }

        const messageElement = document.createElement('div');
        messageElement.className = 'emoji-message';
        messageElement.textContent = message;

        document.body.appendChild(messageElement);

        // 3초 후 제거
        setTimeout(() => {
            messageElement.remove();
        }, 3000);
    }

    // AI 이모티콘 반응 생성
    generateAIEmojiResponse(playerEmoji) {
        const responses = {
            '😤': ['🥺', '😅', '⚡'],
            '👏': ['😊', '💪', '🔥'],
            '😅': ['😂', '🤔', '👏'],
            '🔥': ['💪', '😎', '👍'],
            '💪': ['🔥', '👏', '😎'],
            '🤔': ['💡', '😊', '🤷'],
            '😂': ['😄', '👏', '😊'],
            '🥺': ['😊', '👍', '💪'],
            '😎': ['😂', '👏', '🔥'],
            '💀': ['😂', '😅', '🥺']
        };

        const possibleResponses = responses[playerEmoji] || ['😊', '🤔', '👍'];
        const randomEmoji = possibleResponses[Math.floor(Math.random() * possibleResponses.length)];

        const messages = {
            '🥺': '부탁해~',
            '😅': '당황중..',
            '⚡': '빨리빨리!',
            '😊': '좋아!',
            '💪': '화이팅!',
            '🔥': '열정적이다!',
            '😂': 'ㅋㅋㅋ',
            '🤔': '흠...',
            '👏': '굿!',
            '😎': '멋져!',
            '👍': '오케이!',
            '💡': '아하!',
            '🤷': '몰라',
            '😄': '재밌네!'
        };

        const message = messages[randomEmoji] || '반응중...';
        this.showEmojiAnimation(randomEmoji, `AI: ${message}`);
    }

    // 상대방 이모티콘 수신
    receiveEmoji(emoji, senderName, message) {
        this.showEmojiAnimation(emoji, `${senderName}: ${message}`);
    }

    // 승리 표시 업데이트
    updateWinIndicators() {
        // 단판 모드에서는 승리 표시 동그라미 숨기기
        const myWinIndicators = document.querySelector('.my-area .win-indicators');
        const opponentWinIndicators = document.querySelector('.opponent-area .win-indicators');

        if (this.gameMode === 'single') {
            // 단판 모드: 승리 동그라미 완전히 숨김
            if (myWinIndicators) {
                myWinIndicators.style.display = 'none';
                myWinIndicators.style.visibility = 'hidden';
            }
            if (opponentWinIndicators) {
                opponentWinIndicators.style.display = 'none';
                opponentWinIndicators.style.visibility = 'hidden';
            }
            return;
        } else {
            // 3판 2승제: 승리 동그라미 표시
            if (myWinIndicators) {
                myWinIndicators.style.display = 'flex';
                myWinIndicators.style.visibility = 'visible';
            }
            if (opponentWinIndicators) {
                opponentWinIndicators.style.display = 'flex';
                opponentWinIndicators.style.visibility = 'visible';
            }
        }

        // 3판 2승제 모드에서만 동그라미 업데이트
        // 내 승리 표시 업데이트
        for (let i = 1; i <= this.winsNeeded; i++) {
            const myCircle = document.getElementById(`myWin${i}`);
            if (myCircle) {
                if (i <= this.myWins) {
                    myCircle.classList.add('won');
                } else {
                    myCircle.classList.remove('won');
                }
            }
        }

        // 상대방 승리 표시 업데이트
        for (let i = 1; i <= this.winsNeeded; i++) {
            const opponentCircle = document.getElementById(`opponentWin${i}`);
            if (opponentCircle) {
                if (i <= this.opponentWins) {
                    opponentCircle.classList.add('won');
                } else {
                    opponentCircle.classList.remove('won');
                }
            }
        }

        // 최종 승자 하이라이트
        if (this.myWins >= this.winsNeeded) {
            document.querySelector('.my-area').classList.add('final-winner');
        } else if (this.opponentWins >= this.winsNeeded) {
            document.querySelector('.opponent-area').classList.add('final-winner');
        }
    }

    updateRoundInfo() {
        const roundInfo = document.getElementById('roundInfo');
        if (roundInfo) {
            if (this.gameMode === 'bestOf3') {
                if (this.gamePhase === 'playing') {
                    roundInfo.textContent = `${this.currentRound}라운드 (${this.myWins}-${this.opponentWins})`;
                } else {
                    roundInfo.textContent = '🏆 3판 2승제';
                }
            } else {
                // 단판 모드
                if (this.gamePhase === 'playing') {
                    roundInfo.textContent = '단판 승부';
                } else {
                    roundInfo.textContent = '🎯 단판 모드';
                }
            }
        }
    }

    // 라운드 승리 처리
    handleRoundWin(winner) {
        if (winner === this.playerId) {
            this.myWins++;
            this.showMessage(`라운드 ${this.currentRound} 승리! 🎉`, 'success');
        } else {
            this.opponentWins++;
            const opponentName = this.isSoloMode ? 'AI' : '상대방';
            this.showMessage(`라운드 ${this.currentRound} 패배... ${opponentName}이 승리했습니다.`, 'warning');
        }

        this.updateWinIndicators();
        this.updateRoundInfo();

        // 최종 승부 확인
        if (this.myWins >= this.winsNeeded || this.opponentWins >= this.winsNeeded) {
            // 최종 게임 종료
            setTimeout(() => {
                this.showFinalGameResult(this.myWins >= this.winsNeeded ? this.playerId : 'opponent');
            }, 2000);
        } else {
            // 다음 라운드 준비
            this.currentRound++;
            setTimeout(() => {
                this.prepareNextRound();
            }, 3000);
        }
    }

    // 다음 라운드 준비
    prepareNextRound() {
        // 게임 상태 초기화
        this.myNumber = [];
        this.opponentNumber = [];
        this.gameHistory = { my: [], opponent: [] };
        this.gamePhase = 'setting';
        this.isMyTurn = false;

        // UI 초기화
        document.querySelectorAll('.number-input, .guess-digit').forEach(input => {
            input.value = '';
            input.disabled = false;
            input.style.borderColor = '#ddd';
            input.style.backgroundColor = 'white';
        });

        document.getElementById('setNumberBtn').disabled = false;
        document.getElementById('guessArea').style.display = 'none';
        document.getElementById('gamePhase').textContent = '숫자를 설정해주세요';
        document.getElementById('currentTurn').textContent = '';

        this.updateRoundInfo();
        this.displayHistory();

        this.showMessage(`라운드 ${this.currentRound} 시작!`, 'info');

        // 멀티플레이어 모드에서만 서버에 다음 라운드 알림
        if (!this.isSoloMode && window.gameClient) {
            window.gameClient.nextRound();
        } else if (this.isSoloMode) {
            // 솔로 모드에서는 새로운 AI 숫자 생성
            this.generateAINumber();
            this.generateAIPossibleNumbers();
        }
    }

    // 최종 게임 결과 표시 (3판 2승제 전용)
    showFinalGameResult(winner) {
        const modal = document.getElementById('gameResultModal');
        const content = document.getElementById('resultContent');

        // 내 추측 히스토리 생성
        const myGuessesHTML = this.generateMyGuessesHTML();

        if (winner === this.playerId) {
            if (this.gameMode === 'bestOf3') {
                modal.classList.add('victory-modal');
                const opponentName = this.isSoloMode ? 'AI' : '상대방';
                content.innerHTML = `
                <h2>🏆 최종 승리!</h2>
                <p>축하합니다! 3판 2승제에서 승리했습니다!</p>
                <div class="final-score">
                    <div class="score-display">
                        <span class="score-number">${this.myWins}</span> - <span class="score-number">${this.opponentWins}</span>
                    </div>
                    <p class="score-label">최종 스코어</p>
                </div>
                <div class="final-numbers">
                    <p><strong>총 라운드:</strong> ${this.currentRound}라운드</p>
                    <p><strong>승리 라운드:</strong> ${this.myWins}회</p>
                </div>
                ${myGuessesHTML}
            `;
            } else {
                modal.classList.add('victory-modal');
                const opponentName = this.isSoloMode ? 'AI' : '상대방';
                content.innerHTML = `
                <h2>🏆 최종 승리!</h2>
                <p>축하합니다! 단판 승부에서 승리했습니다!</p>
                <div class="final-score">
                    <div class="score-display">
                        <span class="score-number">${this.myWins}</span>
                    </div>
                    <p class="score-label">최종 스코어</p>
                </div>
                <div class="final-numbers">
                    <p><strong>상대방 숫자:</strong> ${this.opponentNumber.join(', ')}</p>
                </div>
                ${myGuessesHTML}
            `;
            }

        } else {
            if (this.gameMode === 'bestOf3') {
                modal.classList.add('defeat-modal');
                const opponentName = this.isSoloMode ? 'AI' : '상대방';
                content.innerHTML = `
                <h2>😢 최종 패배</h2>
                <p>아쉽네요. ${opponentName}이 3판 2승제에서 승리했습니다!</p>
                <div class="final-score">
                    <div class="score-display">
                        <span class="score-number">${this.myWins}</span> - <span class="score-number">${this.opponentWins}</span>
                    </div>
                    <p class="score-label">최종 스코어 <strong>상대방 숫자:</strong> ${this.opponentNumber.join(', ')}</p>
                </div>
                <div class="final-numbers">
                    <p><strong>총 라운드:</strong> ${this.currentRound}라운드</p>
                    <p><strong>승리 라운드:</strong> ${this.myWins}회</p>
                </div>
                ${myGuessesHTML}
            `;
            } else {
                modal.classList.add('defeat-modal');
                const opponentName = this.isSoloMode ? 'AI' : '상대방';
                content.innerHTML = `
                <h2>😢 최종 패배</h2>
                <p>아쉽네요. ${opponentName}이 단판 승부에서 승리했습니다!</p>
                <div class="final-score">
                    <div class="score-display">
                        <span class="score-number">${this.myWins}</span>
                    </div>
                    <p class="score-label">최종 스코어</p>
                </div>
                <div class="final-numbers">
                    <p><strong>상대방 숫자:</strong> ${this.opponentNumber.join(', ')}</p>
                </div>
                ${myGuessesHTML}
            `;
            }

        }

        // 솔로 모드일 때 서버에 간단 이력 저장
        if (this.isSoloMode) {
            const playerName = this.playerName || '플레이어';
            const aiName = 'AI';
            const winnerName = winner === this.playerId ? playerName : aiName;
            const loserName = winner === this.playerId ? aiName : playerName;
            this.saveSoloHistory(winnerName, loserName);
        }

        modal.classList.add('show');
    }

    // 솔로 모드 히스토리 저장 API 호출
    async saveSoloHistory(winnerName, loserName) {
        try {
            await fetch('/api/history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomName: 'AI 대전',
                    winnerName,
                    loserName,
                    gameMode: this.gameMode || 'single',
                    source: 'solo'
                })
            });
        } catch (err) {
            console.error('솔로 히스토리 저장 실패:', err);
        }
    }
}

// CSS 애니메이션 추가
const style = document.createElement('style');
style.textContent = `
    @keyframes slideDown {
        from {
            opacity: 0;
            transform: translate(-50%, -20px);
        }
        to {
            opacity: 1;
            transform: translate(-50%, 0);
        }
    }
    
    .message {
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
    }
`;
document.head.appendChild(style);

// 게임 인스턴스 생성
const game = new BaseballGame();
window.game = game; 