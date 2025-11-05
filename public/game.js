let socket = null;
let currentScreen = 'connectionScreen';
let playerId = null;
let playerName = null;
let currentMatch = null;
let playerStats = null;
let audioContext = null;

function initAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
        console.log('Web Audio API not supported');
    }
}

function playSound(frequency, duration, type = 'sine') {
    if (!audioContext) return;
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = frequency;
    oscillator.type = type;
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
}

function playWinSound() {
    playSound(523.25, 0.2);
    setTimeout(() => playSound(659.25, 0.2), 100);
    setTimeout(() => playSound(783.99, 0.3), 200);
}

function playLoseSound() {
    playSound(392, 0.2);
    setTimeout(() => playSound(349.23, 0.2), 100);
    setTimeout(() => playSound(293.66, 0.3), 200);
}

function playTieSound() {
    playSound(440, 0.3);
}

function playClickSound() {
    playSound(800, 0.1);
}

function playNotificationSound() {
    playSound(600, 0.15);
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
    currentScreen = screenId;
}

function connectToServer() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('Connected to server');
    });
    
    socket.on('joined', (data) => {
        playNotificationSound();
        playerId = data.playerId;
        playerName = data.playerName;
        playerStats = data.stats;
        
        document.getElementById('welcomeMessage').textContent = `Welcome, ${playerName}!`;
        showScreen('menuScreen');
    });
    
    socket.on('matchmaking_status', (data) => {
        console.log('Matchmaking status:', data.status);
    });
    
    socket.on('match_found', (matchState) => {
        playNotificationSound();
        currentMatch = matchState;
        startMatch(matchState);
    });
    
    socket.on('choice_recorded', (data) => {
        playClickSound();
        const buttons = document.querySelectorAll('.choice-btn');
        buttons.forEach(btn => {
            btn.disabled = true;
            if (btn.dataset.choice === data.choice) {
                btn.classList.add('selected');
            }
        });
        
        document.getElementById('gameStatus').innerHTML = '<p>Choice locked! Waiting for opponent...</p>';
        document.getElementById('choiceButtons').style.display = 'none';
        document.getElementById('waitingMessage').style.display = 'block';
    });
    
    socket.on('opponent_ready', () => {
        playNotificationSound();
        document.getElementById('waitingMessage').querySelector('p').textContent = 'Opponent is ready! Revealing results...';
    });
    
    socket.on('round_result', (result) => {
        handleRoundResult(result);
    });
    
    socket.on('chat_message', (message) => {
        displayChatMessage(message);
    });
    
    socket.on('opponent_disconnected', (data) => {
        playNotificationSound();
        document.getElementById('opponentStatus').textContent = '⚠️ Disconnected';
        document.getElementById('opponentStatus').className = 'connection-status disconnected';
        showStatus(data.message, 'error');
    });
    
    socket.on('opponent_reconnected', (data) => {
        playNotificationSound();
        document.getElementById('opponentStatus').textContent = '✓ Connected';
        document.getElementById('opponentStatus').className = 'connection-status connected';
        showStatus(data.message, 'success');
    });
    
    socket.on('opponent_forfeit', (data) => {
        playWinSound();
        showGameOver(true, data.message);
    });
    
    socket.on('rematch_requested', (data) => {
        playNotificationSound();
        document.getElementById('rematchStatus').textContent = `${data.playerName} wants a rematch!`;
        document.getElementById('rematchStatus').className = 'status-message success';
        
        const acceptButton = document.createElement('button');
        acceptButton.textContent = 'Accept Rematch';
        acceptButton.className = 'btn btn-primary';
        acceptButton.onclick = () => {
            socket.emit('accept_rematch');
            document.getElementById('rematchStatus').textContent = 'Starting rematch...';
        };
        document.getElementById('rematchStatus').appendChild(acceptButton);
    });
    
    socket.on('room_created', (data) => {
        playNotificationSound();
        document.getElementById('roomCodeTitle').textContent = 'Your Room Code';
        document.getElementById('roomCodeDisplay').textContent = data.roomCode;
        document.getElementById('roomCodeMessage').textContent = 'Share this code with your friend to play together. Waiting for opponent to join...';
        showScreen('roomCodeScreen');
    });
    
    socket.on('stats_update', (stats) => {
        playerStats = stats;
        updateStatsDisplay();
    });
    
    socket.on('reconnected', (matchState) => {
        playNotificationSound();
        currentMatch = matchState;
        startMatch(matchState);
        showStatus('Reconnected successfully!', 'success');
    });
    
    socket.on('matchmaking_cancelled', () => {
        showScreen('menuScreen');
    });
    
    socket.on('error', (data) => {
        playLoseSound();
        showStatus(data.message, 'error');
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        if (currentMatch && currentMatch.phase === 'playing') {
            setTimeout(() => {
                socket.emit('reconnect_to_match');
            }, 1000);
        }
    });
}

document.getElementById('joinButton').addEventListener('click', () => {
    const nameInput = document.getElementById('playerNameInput');
    const name = nameInput.value.trim();
    
    if (name.length < 2) {
        showStatus('Please enter a name (at least 2 characters)', 'error', 'connectionStatus');
        return;
    }
    
    initAudio();
    connectToServer();
    
    socket.emit('join', { name: name });
    document.getElementById('connectionStatus').textContent = 'Connecting...';
});

document.getElementById('playerNameInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('joinButton').click();
    }
});

document.getElementById('findMatchButton').addEventListener('click', () => {
    playClickSound();
    socket.emit('find_match');
    showScreen('matchmakingScreen');
});

document.getElementById('createRoomButton').addEventListener('click', () => {
    playClickSound();
    socket.emit('create_room');
});

document.getElementById('joinRoomButton').addEventListener('click', () => {
    playClickSound();
    showScreen('joinRoomScreen');
});

document.getElementById('viewStatsButton').addEventListener('click', () => {
    playClickSound();
    socket.emit('get_stats');
    showScreen('statsScreen');
});

document.getElementById('joinRoomSubmitButton').addEventListener('click', () => {
    const roomCodeInput = document.getElementById('roomCodeInput');
    const roomCode = roomCodeInput.value.trim().toUpperCase();
    
    if (roomCode.length !== 6) {
        showStatus('Please enter a valid 6-character room code', 'error', 'joinRoomStatus');
        return;
    }
    
    playClickSound();
    socket.emit('join_room', { roomCode: roomCode });
    document.getElementById('joinRoomStatus').textContent = 'Joining room...';
});

document.getElementById('roomCodeInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('joinRoomSubmitButton').click();
    }
});

document.getElementById('cancelMatchmakingButton').addEventListener('click', () => {
    playClickSound();
    socket.emit('cancel_matchmaking');
});

document.getElementById('backToMenuButton').addEventListener('click', () => {
    playClickSound();
    showScreen('menuScreen');
});

document.getElementById('backToMenuButton2').addEventListener('click', () => {
    playClickSound();
    showScreen('menuScreen');
});

document.getElementById('backToMenuButton3').addEventListener('click', () => {
    playClickSound();
    showScreen('menuScreen');
});

document.getElementById('backToMenuButton4').addEventListener('click', () => {
    playClickSound();
    currentMatch = null;
    showScreen('menuScreen');
});

document.getElementById('rematchButton').addEventListener('click', () => {
    playClickSound();
    socket.emit('request_rematch');
    document.getElementById('rematchStatus').textContent = 'Rematch request sent...';
    document.getElementById('rematchStatus').className = 'status-message';
});

document.querySelectorAll('.choice-btn').forEach(button => {
    button.addEventListener('click', () => {
        const choice = button.dataset.choice;
        playClickSound();
        socket.emit('make_choice', { choice: choice });
    });
});

document.getElementById('sendChatButton').addEventListener('click', () => {
    sendChatMessage();
});

document.getElementById('chatInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendChatMessage();
    }
});

function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (message.length === 0) return;
    
    playClickSound();
    socket.emit('send_chat', { message: message });
    input.value = '';
}

function displayChatMessage(message) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${message.playerId === playerId ? 'own' : 'other'}`;
    
    const nameDiv = document.createElement('div');
    nameDiv.className = 'chat-message-name';
    nameDiv.textContent = message.playerName;
    
    const textDiv = document.createElement('div');
    textDiv.className = 'chat-message-text';
    textDiv.textContent = message.text;
    
    messageDiv.appendChild(nameDiv);
    messageDiv.appendChild(textDiv);
    chatMessages.appendChild(messageDiv);
    
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function startMatch(matchState) {
    currentMatch = matchState;
    
    document.getElementById('playerName').textContent = matchState.myName;
    document.getElementById('opponentName').textContent = matchState.opponentName;
    document.getElementById('playerScore').textContent = matchState.myScore;
    document.getElementById('opponentScore').textContent = matchState.opponentScore;
    document.getElementById('roundDisplay').textContent = `Round ${matchState.round}/${matchState.maxRounds}`;
    
    if (matchState.roomCode) {
        document.getElementById('roomCodeBadge').textContent = `Room: ${matchState.roomCode}`;
        document.getElementById('roomCodeBadge').style.display = 'block';
    }
    
    document.getElementById('opponentStatus').textContent = matchState.opponentConnected ? '✓ Connected' : '⚠️ Disconnected';
    document.getElementById('opponentStatus').className = `connection-status ${matchState.opponentConnected ? 'connected' : 'disconnected'}`;
    
    document.getElementById('chatMessages').innerHTML = '';
    if (matchState.chatMessages) {
        matchState.chatMessages.forEach(msg => displayChatMessage(msg));
    }
    
    resetRound();
    showScreen('gameScreen');
}

function resetRound() {
    document.getElementById('gameStatus').innerHTML = '<p>Make your choice!</p>';
    document.getElementById('choiceButtons').style.display = 'flex';
    document.getElementById('waitingMessage').style.display = 'none';
    document.getElementById('roundResult').style.display = 'none';
    
    const buttons = document.querySelectorAll('.choice-btn');
    buttons.forEach(btn => {
        btn.disabled = false;
        btn.classList.remove('selected');
    });
}

function handleRoundResult(result) {
    currentMatch.round = result.round;
    currentMatch.myScore = result.player1.id === playerId ? result.player1.score : result.player2.score;
    currentMatch.opponentScore = result.player1.id === playerId ? result.player2.score : result.player1.score;
    
    document.getElementById('playerScore').textContent = currentMatch.myScore;
    document.getElementById('opponentScore').textContent = currentMatch.opponentScore;
    document.getElementById('roundDisplay').textContent = `Round ${currentMatch.round}/${currentMatch.maxRounds}`;
    
    const myChoice = result.player1.id === playerId ? result.player1.choice : result.player2.choice;
    const opponentChoice = result.player1.id === playerId ? result.player2.choice : result.player1.choice;
    
    document.getElementById('yourChoiceDisplay').textContent = getChoiceIcon(myChoice);
    document.getElementById('opponentChoiceDisplay').textContent = getChoiceIcon(opponentChoice);
    
    let resultTitle = '';
    let resultClass = '';
    
    if (result.winner === playerId) {
        resultTitle = '🎉 You Won This Round!';
        resultClass = 'win';
        playWinSound();
    } else if (result.winner === null) {
        resultTitle = '🤝 It\'s a Tie!';
        resultClass = 'tie';
        playTieSound();
    } else {
        resultTitle = '😔 You Lost This Round';
        resultClass = 'lose';
        playLoseSound();
    }
    
    document.getElementById('resultTitle').textContent = resultTitle;
    document.getElementById('resultTitle').className = resultClass;
    
    document.getElementById('waitingMessage').style.display = 'none';
    document.getElementById('roundResult').style.display = 'block';
    
    if (result.matchWinner !== undefined) {
        setTimeout(() => {
            showGameOver(result.matchWinner === playerId, result);
        }, 2000);
    } else {
        document.getElementById('nextRoundButton').onclick = () => {
            playClickSound();
            resetRound();
        };
    }
}

function showGameOver(won, result) {
    if (typeof result === 'string') {
        document.getElementById('gameOverTitle').textContent = 'Game Over!';
        document.getElementById('gameOverResult').textContent = result;
        document.getElementById('gameOverResult').className = 'game-over-result win';
        document.getElementById('finalPlayerScore').textContent = '-';
        document.getElementById('finalOpponentScore').textContent = '-';
    } else {
        const myScore = result.player1.id === playerId ? result.player1.score : result.player2.score;
        const opponentScore = result.player1.id === playerId ? result.player2.score : result.player1.score;
        
        document.getElementById('finalPlayerName').textContent = currentMatch.myName;
        document.getElementById('finalOpponentName').textContent = currentMatch.opponentName;
        document.getElementById('finalPlayerScore').textContent = myScore;
        document.getElementById('finalOpponentScore').textContent = opponentScore;
        
        if (won) {
            document.getElementById('gameOverTitle').textContent = '🎉 Victory!';
            document.getElementById('gameOverResult').textContent = 'Congratulations! You won the match!';
            document.getElementById('gameOverResult').className = 'game-over-result win';
            playWinSound();
        } else if (result.matchWinner === null) {
            document.getElementById('gameOverTitle').textContent = '🤝 Draw!';
            document.getElementById('gameOverResult').textContent = 'The match ended in a tie!';
            document.getElementById('gameOverResult').className = 'game-over-result tie';
            playTieSound();
        } else {
            document.getElementById('gameOverTitle').textContent = '😔 Defeat';
            document.getElementById('gameOverResult').textContent = 'Better luck next time!';
            document.getElementById('gameOverResult').className = 'game-over-result lose';
            playLoseSound();
        }
    }
    
    document.getElementById('rematchStatus').textContent = '';
    document.getElementById('rematchStatus').className = 'status-message';
    
    showScreen('gameOverScreen');
}

function getChoiceIcon(choice) {
    const icons = {
        'rock': '✊',
        'paper': '✋',
        'scissors': '✌️'
    };
    return icons[choice] || '❓';
}

function updateStatsDisplay() {
    if (!playerStats) return;
    
    document.getElementById('statGamesPlayed').textContent = playerStats.gamesPlayed;
    document.getElementById('statGamesWon').textContent = playerStats.gamesWon;
    document.getElementById('statGamesLost').textContent = playerStats.gamesLost;
    document.getElementById('statGamesTied').textContent = playerStats.gamesTied;
    document.getElementById('statRoundsWon').textContent = playerStats.roundsWon;
    document.getElementById('statRoundsLost').textContent = playerStats.roundsLost;
}

function showStatus(message, type, elementId = null) {
    const statusElement = elementId ? document.getElementById(elementId) : document.getElementById('connectionStatus');
    statusElement.textContent = message;
    statusElement.className = `status-message ${type}`;
    
    setTimeout(() => {
        statusElement.textContent = '';
        statusElement.className = 'status-message';
    }, 5000);
}

console.log('Rock Paper Scissors Multiplayer - Ready!');
