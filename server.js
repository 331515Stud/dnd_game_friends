const express = require('express');
const http = require('http');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
require('dotenv').config();

// ✅ Импортируем initSessionTable вместе с initDB
const { pool, initDB, initSessionTable } = require('./config/database');
const { sessionMiddleware } = require('./middleware/auth');
const { apiLimiter } = require('./middleware/rateLimiter');
const { setupSocket } = require('./config/socket');

const authRoutes = require('./routes/auth');
const characterRoutes = require('./routes/characters');
const campaignRoutes = require('./routes/campaigns');

const app = express();
const server = http.createServer(app);
const sessionRoutes = require('./routes/sessions');
// Helmet security
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-hashes'"],
      scriptSrcAttr: ["'self'", "'unsafe-inline'"],  // ✅ Разрешаем onclick и др.
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:']
    }
  }
}));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(sessionMiddleware);
app.use('/api', apiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/characters', characterRoutes);
app.use('/api/campaigns', campaignRoutes);

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/sessions', sessionRoutes);
// Home route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'unhealthy', error: err.message });
  }
});

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await initDB();
    // ✅ initSessionTable теперь вызывается внутри initDB(), эту строку можно удалить
    // await initSessionTable(); 
    const io = setupSocket(server, sessionMiddleware);
    
    server.listen(PORT, () => {
      console.log(`🎲 D&D Server running on http://localhost:${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    pool.end();
    process.exit(0);
  });
});

module.exports = { app, server };