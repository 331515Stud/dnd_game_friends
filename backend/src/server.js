require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const path = require('path');

const db = require('./config/database');
const setupSocketHandlers = require('./socket/handlers');
const authController = require('./controllers/authController');
const characterController = require('./controllers/characterController');
const campaignController = require('./controllers/campaignController');
const { authLimiter, requireAuth } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true
  }
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"],
    },
  },
}));

app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session configuration
const sessionMiddleware = session({
  store: new pgSession({
    pool: db.pool,
    tableName: 'user_sessions',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  name: 'sessionId',
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
});

app.use(sessionMiddleware);

// Share session with Socket.IO
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// Auth routes
app.post('/api/auth/register', authLimiter, authController.register);
app.post('/api/auth/login', authLimiter, authController.login);
app.post('/api/auth/logout', requireAuth, authController.logout);
app.get('/api/auth/me', requireAuth, authController.me);

// Character routes
app.get('/api/characters', requireAuth, characterController.getMyCharacters);
app.get('/api/characters/:id', requireAuth, characterController.getCharacter);
app.post('/api/characters', requireAuth, characterController.createCharacter);
app.put('/api/characters/:id', requireAuth, characterController.updateCharacter);
app.delete('/api/characters/:id', requireAuth, characterController.deleteCharacter);

// Campaign routes
app.get('/api/campaigns', requireAuth, campaignController.getMyCampaigns);
app.get('/api/campaigns/:id', requireAuth, campaignController.getCampaignDetails);
app.post('/api/campaigns', requireAuth, campaignController.createCampaign);
app.post('/api/campaigns/join', requireAuth, campaignController.joinCampaign);
app.put('/api/campaigns/:id/map', requireAuth, campaignController.updateMap);
app.delete('/api/campaigns/:id', requireAuth, campaignController.deleteCampaign);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Setup Socket.IO
setupSocketHandlers(io);

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Что-то пошло не так!' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});