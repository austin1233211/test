const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

const players = new Map(); // socketId -> player data
const matchmakingQueue = []; // Array of player IDs waiting for match
const matches = new Map(); // matchId -> match data
const playerToMatch = new Map(); // playerId -> matchId
const roundTimers = new Map(); // matchId -> timer reference
const rooms = new Map(); // roomCode -> { hostId, createdAt }

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function createPlayer(socket, name) {
  return {
    id: socket.id,
    name: name || `Player${Math.floor(Math.random() * 1000)}`,
    socketId: socket.id,
    connected: true,
    lastActivity: Date.now()
  };
}

function createMatch(player1, player2, roomCode = null) {
  const matchId = generateId();
  const match = {
    id: matchId,
    players: [player1.id, player2.id],
    playerData: {
      [player1.id]: {
        name: player1.name,
        score: 0,
        currentChoice: null,
        ready: false
      },
      [player2.id]: {
        name: player2.name,
        score: 0,
        currentChoice: null,
        ready: false
      }
    },
    round: 0,
    maxRounds: 3,
    phase: 'playing', // 'playing' or 'finished'
    roomCode: roomCode,
    createdAt: Date.now(),
    lastActivity: Date.now()
  };
  
  matches.set(matchId, match);
  playerToMatch.set(player1.id, matchId);
  playerToMatch.set(player2.id, matchId);
  
  return match;
}

function determineWinner(choice1, choice2) {
  if (choice1 === choice2) return 'tie';
  if (
    (choice1 === 'rock' && choice2 === 'scissors') ||
    (choice1 === 'paper' && choice2 === 'rock') ||
    (choice1 === 'scissors' && choice2 === 'paper')
  ) {
    return 'player1';
  }
  return 'player2';
}

function isValidChoice(choice) {
  return ['rock', 'paper', 'scissors'].includes(choice);
}

function getRandomChoice() {
  const choices = ['rock', 'paper', 'scissors'];
  return choices[Math.floor(Math.random() * choices.length)];
}

function clearRoundTimer(matchId) {
  const timer = roundTimers.get(matchId);
  if (timer) {
    clearTimeout(timer);
    roundTimers.delete(matchId);
  }
}

function startRoundTimer(matchId) {
  clearRoundTimer(matchId);
  
  const timer = setTimeout(() => {
    const match = matches.get(matchId);
    if (!match || match.phase !== 'playing') {
      return;
    }
    
    console.log(`[${new Date().toISOString()}] Round timer expired for match ${matchId}`);
    
    for (const playerId of match.players) {
      if (!match.playerData[playerId].ready) {
        const randomChoice = getRandomChoice();
        match.playerData[playerId].currentChoice = randomChoice;
        match.playerData[playerId].ready = true;
        
        console.log(`[${new Date().toISOString()}] Auto-assigned ${randomChoice} to ${match.playerData[playerId].name}`);
        
        io.to(playerId).emit('choice_auto_assigned', { choice: randomChoice });
      }
    }
    
    const bothReady = match.players.every(id => match.playerData[id].ready);
    
    if (bothReady) {
      match.round++;
      const roundResult = processRound(match);
      
      console.log(`[${new Date().toISOString()}] Round ${roundResult.round} complete (after timer) - Result: ${roundResult.result}`);
      
      io.to(matchId).emit('round_result', roundResult);
      
      if (match.phase === 'finished') {
        console.log(`[${new Date().toISOString()}] Match ${matchId} finished`);
        clearRoundTimer(matchId);
        setTimeout(() => cleanupMatch(matchId), 10000);
      } else {
        startRoundTimer(matchId);
      }
    }
  }, 15000);
  
  roundTimers.set(matchId, timer);
  io.to(matchId).emit('round_timer_started', { duration: 15 });
}

function getMatchState(match, playerId) {
  const opponentId = match.players.find(id => id !== playerId);
  const opponentConnected = players.has(opponentId) && players.get(opponentId).connected;
  return {
    matchId: match.id,
    round: match.round,
    maxRounds: match.maxRounds,
    phase: match.phase,
    myScore: match.playerData[playerId].score,
    opponentScore: match.playerData[opponentId].score,
    myName: match.playerData[playerId].name,
    opponentName: match.playerData[opponentId].name,
    myChoice: match.playerData[playerId].currentChoice,
    opponentChoice: match.playerData[opponentId].currentChoice,
    bothPlayersReady: match.playerData[playerId].ready && match.playerData[opponentId].ready,
    roomCode: match.roomCode || null,
    opponentConnected: opponentConnected
  };
}

function processRound(match) {
  const [player1Id, player2Id] = match.players;
  const choice1 = match.playerData[player1Id].currentChoice;
  const choice2 = match.playerData[player2Id].currentChoice;
  
  const result = determineWinner(choice1, choice2);
  
  let roundResult = {
    round: match.round,
    player1: {
      id: player1Id,
      name: match.playerData[player1Id].name,
      choice: choice1,
      score: match.playerData[player1Id].score
    },
    player2: {
      id: player2Id,
      name: match.playerData[player2Id].name,
      choice: choice2,
      score: match.playerData[player2Id].score
    },
    result: result
  };
  
  if (result === 'player1') {
    match.playerData[player1Id].score++;
    roundResult.winner = player1Id;
  } else if (result === 'player2') {
    match.playerData[player2Id].score++;
    roundResult.winner = player2Id;
  } else {
    roundResult.winner = null;
  }
  
  roundResult.player1.score = match.playerData[player1Id].score;
  roundResult.player2.score = match.playerData[player2Id].score;
  
  match.playerData[player1Id].currentChoice = null;
  match.playerData[player2Id].currentChoice = null;
  match.playerData[player1Id].ready = false;
  match.playerData[player2Id].ready = false;
  
  if (match.round >= match.maxRounds) {
    match.phase = 'finished';
    const finalScore1 = match.playerData[player1Id].score;
    const finalScore2 = match.playerData[player2Id].score;
    
    if (finalScore1 > finalScore2) {
      roundResult.matchWinner = player1Id;
    } else if (finalScore2 > finalScore1) {
      roundResult.matchWinner = player2Id;
    } else {
      roundResult.matchWinner = null; // tie
    }
  }
  
  return roundResult;
}

function cleanupMatch(matchId) {
  const match = matches.get(matchId);
  if (!match) return;
  
  clearRoundTimer(matchId);
  
  for (const playerId of match.players) {
    playerToMatch.delete(playerId);
  }
  
  matches.delete(matchId);
}

io.on('connection', (socket) => {
  console.log(`[${new Date().toISOString()}] Player connected: ${socket.id}`);
  
  socket.on('join', (data) => {
    const playerName = data?.name || `Player${Math.floor(Math.random() * 1000)}`;
    const player = createPlayer(socket, playerName);
    players.set(socket.id, player);
    
    console.log(`[${new Date().toISOString()}] Player joined: ${player.name} (${socket.id})`);
    
    socket.emit('joined', {
      playerId: player.id,
      playerName: player.name
    });
  });
  
  socket.on('find_match', () => {
    const player = players.get(socket.id);
    if (!player) {
      socket.emit('error', { message: 'Player not found. Please rejoin.' });
      return;
    }
    
    if (matchmakingQueue.includes(player.id)) {
      socket.emit('error', { message: 'Already in matchmaking queue' });
      return;
    }
    
    if (playerToMatch.has(player.id)) {
      socket.emit('error', { message: 'Already in a match' });
      return;
    }
    
    console.log(`[${new Date().toISOString()}] Player ${player.name} looking for match...`);
    
    if (matchmakingQueue.length > 0) {
      const opponentId = matchmakingQueue.shift();
      const opponent = players.get(opponentId);
      
      if (!opponent || !opponent.connected) {
        socket.emit('matchmaking_status', { status: 'searching' });
        matchmakingQueue.push(player.id);
        return;
      }
      
      const match = createMatch(player, opponent);
      
      console.log(`[${new Date().toISOString()}] Match created: ${match.id} - ${player.name} vs ${opponent.name}`);
      
      socket.join(match.id);
      io.sockets.sockets.get(opponentId)?.join(match.id);
      
      socket.emit('match_found', getMatchState(match, player.id));
      io.to(opponentId).emit('match_found', getMatchState(match, opponent.id));
      
      startRoundTimer(match.id);
      
    } else {
      matchmakingQueue.push(player.id);
      socket.emit('matchmaking_status', { status: 'searching' });
      console.log(`[${new Date().toISOString()}] Player ${player.name} added to queue`);
    }
  });
  
  socket.on('create_room', () => {
    const player = players.get(socket.id);
    if (!player) {
      socket.emit('error', { message: 'Player not found. Please rejoin.' });
      return;
    }
    
    if (playerToMatch.has(player.id)) {
      socket.emit('error', { message: 'Already in a match' });
      return;
    }
    
    const queueIndex = matchmakingQueue.indexOf(player.id);
    if (queueIndex > -1) {
      matchmakingQueue.splice(queueIndex, 1);
    }
    
    for (const [roomCode, room] of rooms.entries()) {
      if (room.hostId === player.id) {
        rooms.delete(roomCode);
      }
    }
    
    let roomCode;
    do {
      roomCode = generateRoomCode();
    } while (rooms.has(roomCode));
    
    rooms.set(roomCode, {
      hostId: player.id,
      createdAt: Date.now()
    });
    
    console.log(`[${new Date().toISOString()}] Player ${player.name} created room ${roomCode}`);
    
    socket.emit('room_created', { roomCode: roomCode });
  });
  
  socket.on('join_room', (data) => {
    const player = players.get(socket.id);
    if (!player) {
      socket.emit('error', { message: 'Player not found. Please rejoin.' });
      return;
    }
    
    if (playerToMatch.has(player.id)) {
      socket.emit('error', { message: 'Already in a match' });
      return;
    }
    
    const queueIndex = matchmakingQueue.indexOf(player.id);
    if (queueIndex > -1) {
      matchmakingQueue.splice(queueIndex, 1);
    }
    
    const roomCode = data?.roomCode?.trim().toUpperCase();
    
    if (!roomCode || !/^[A-Z0-9]{6}$/.test(roomCode)) {
      socket.emit('error', { message: 'Invalid room code format' });
      return;
    }
    
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    
    if (room.hostId === player.id) {
      socket.emit('error', { message: 'Cannot join your own room' });
      return;
    }
    
    const host = players.get(room.hostId);
    if (!host || !host.connected) {
      rooms.delete(roomCode);
      socket.emit('error', { message: 'Room no longer available' });
      return;
    }
    
    if (playerToMatch.has(host.id)) {
      rooms.delete(roomCode);
      socket.emit('error', { message: 'Host is already in a match' });
      return;
    }
    
    rooms.delete(roomCode);
    
    const match = createMatch(host, player, roomCode);
    
    console.log(`[${new Date().toISOString()}] Match created from room ${roomCode}: ${match.id} - ${host.name} vs ${player.name}`);
    
    socket.join(match.id);
    io.sockets.sockets.get(host.id)?.join(match.id);
    
    socket.emit('match_found', getMatchState(match, player.id));
    io.to(host.id).emit('match_found', getMatchState(match, host.id));
    
    startRoundTimer(match.id);
  });
  
  socket.on('make_choice', (data) => {
    const player = players.get(socket.id);
    if (!player) {
      socket.emit('error', { message: 'Player not found' });
      return;
    }
    
    const matchId = playerToMatch.get(player.id);
    if (!matchId) {
      socket.emit('error', { message: 'Not in a match' });
      return;
    }
    
    const match = matches.get(matchId);
    if (!match || match.phase !== 'playing') {
      socket.emit('error', { message: 'Match not active' });
      return;
    }
    
    if (!isValidChoice(data.choice)) {
      socket.emit('error', { message: 'Invalid choice' });
      return;
    }
    
    if (match.playerData[player.id].currentChoice) {
      socket.emit('error', { message: 'Already made choice this round' });
      return;
    }
    
    match.playerData[player.id].currentChoice = data.choice;
    match.playerData[player.id].ready = true;
    match.lastActivity = Date.now();
    
    console.log(`[${new Date().toISOString()}] ${player.name} chose ${data.choice}`);
    
    socket.emit('choice_recorded', { choice: data.choice });
    
    const opponentId = match.players.find(id => id !== player.id);
    io.to(opponentId).emit('opponent_ready');
    
    const bothReady = match.players.every(id => match.playerData[id].ready);
    
    if (bothReady) {
      clearRoundTimer(matchId);
      match.round++;
      
      const roundResult = processRound(match);
      
      console.log(`[${new Date().toISOString()}] Round ${roundResult.round} complete - Result: ${roundResult.result}`);
      
      io.to(matchId).emit('round_result', roundResult);
      
      if (match.phase === 'finished') {
        console.log(`[${new Date().toISOString()}] Match ${matchId} finished`);
        setTimeout(() => cleanupMatch(matchId), 10000);
      } else {
        startRoundTimer(matchId);
      }
    }
  });
  
  socket.on('cancel_matchmaking', () => {
    const player = players.get(socket.id);
    if (!player) return;
    
    const index = matchmakingQueue.indexOf(player.id);
    if (index > -1) {
      matchmakingQueue.splice(index, 1);
      socket.emit('matchmaking_cancelled');
      console.log(`[${new Date().toISOString()}] ${player.name} cancelled matchmaking`);
    }
  });
  
  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    if (!player) return;
    
    console.log(`[${new Date().toISOString()}] Player disconnected: ${player.name} (${socket.id})`);
    
    const queueIndex = matchmakingQueue.indexOf(player.id);
    if (queueIndex > -1) {
      matchmakingQueue.splice(queueIndex, 1);
    }
    
    for (const [roomCode, room] of rooms.entries()) {
      if (room.hostId === player.id) {
        rooms.delete(roomCode);
        console.log(`[${new Date().toISOString()}] Deleted room ${roomCode} (host disconnected)`);
      }
    }
    
    const matchId = playerToMatch.get(player.id);
    if (matchId) {
      const match = matches.get(matchId);
      if (match) {
        const opponentId = match.players.find(id => id !== player.id);
        if (opponentId) {
          io.to(opponentId).emit('opponent_disconnected', {
            message: 'Your opponent disconnected. You win by forfeit!'
          });
        }
        
        cleanupMatch(matchId);
      }
    }
    
    players.delete(socket.id);
  });
  
  socket.on('ping', () => {
    const player = players.get(socket.id);
    if (player) {
      player.lastActivity = Date.now();
    }
    socket.emit('pong');
  });
});

setInterval(() => {
  const now = Date.now();
  const MATCH_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  const ROOM_TIMEOUT = 10 * 60 * 1000; // 10 minutes
  
  for (const [matchId, match] of matches.entries()) {
    if (now - match.lastActivity > MATCH_TIMEOUT) {
      console.log(`[${new Date().toISOString()}] Cleaning up inactive match: ${matchId}`);
      cleanupMatch(matchId);
    }
  }
  
  for (const [roomCode, room] of rooms.entries()) {
    if (now - room.createdAt > ROOM_TIMEOUT) {
      console.log(`[${new Date().toISOString()}] Cleaning up expired room: ${roomCode}`);
      rooms.delete(roomCode);
    }
  }
}, 60000); // Check every minute

httpServer.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Rock Paper Scissors server running on port ${PORT}`);
  console.log(`[${new Date().toISOString()}] Open http://localhost:${PORT} in your browser`);
});
