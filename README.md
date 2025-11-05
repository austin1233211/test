# Rock Paper Scissors - Multiplayer Game

A real-time multiplayer rock-paper-scissors game built with Node.js, Express, and Socket.IO.

## Features

- ✅ **Best of 3 rounds** - First player to win 2 rounds wins the match
- ✅ **Automatic Matchmaking** - Find random opponents instantly
- ✅ **Private Room Codes** - Create/join private rooms to play with friends
- ✅ **Real-time Chat** - Chat with your opponent during the game
- ✅ **Player Statistics** - Track your wins, losses, and performance
- ✅ **Sound Effects** - Audio feedback for game events
- ✅ **30-second Reconnection** - Reconnect if disconnected, or opponent wins after timeout
- ✅ **Rematch System** - Request and accept rematches after games

## Tech Stack

- **Backend**: Node.js, Express, Socket.IO
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Deployment**: Docker, Railway

## Quick Start

### Local Development

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open http://localhost:3000 in two browser windows to test multiplayer

### Deploy to Railway

1. Fork this repository
2. Go to [Railway](https://railway.app)
3. Click "New Project" → "Deploy from GitHub repo"
4. Select this repository
5. Railway will auto-detect the Dockerfile and deploy
6. Get your public URL and share with friends!

## How to Play

1. **Enter your name** to join the game
2. **Choose game mode**:
   - Find Random Match - Get matched with any available player
   - Create Private Room - Get a room code to share with friends
   - Join Private Room - Enter a room code to join a friend's game
3. **Make your choice** - Rock, Paper, or Scissors
4. **Win rounds** - First to 2 round wins takes the match!
5. **Chat and rematch** - Use the chat sidebar and request rematches

## Game Rules

- Rock beats Scissors
- Scissors beats Paper
- Paper beats Rock
- Best of 3 rounds wins the match

## Project Structure

```
rock-paper-scissors-multiplayer/
├── server.js           # Socket.IO server with game logic
├── public/
│   ├── index.html     # Client UI
│   ├── game.js        # Client-side game logic
│   └── styles.css     # Styling and animations
├── package.json       # Dependencies
├── Dockerfile         # Docker configuration
└── README.md          # This file
```

## License

MIT
