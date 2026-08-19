require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');
const { startAnalyticsCron } = require('./jobs/analyticsCron');
const { startNewsCron } = require('./jobs/newsCron');
const { startWebinarNotifyCron } = require('./jobs/webinarNotifyCron');
const http = require('http');
const { Server } = require('socket.io');
const { registerChatSocket } = require('./sockets/chatSocket');

const PORT = process.env.PORT || 3002;

const startServer = async () => {
  try {
    await connectDB();
    startAnalyticsCron();
    startNewsCron();
    startWebinarNotifyCron();
    const server = http.createServer(app);

    const io = new Server(server, {
      path: process.env.SOCKET_IO_PATH || '/api/socket',
      cors: { origin: '*', methods: ['GET', 'POST'] },
    });

    registerChatSocket(io);

    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Socket.IO path: ${process.env.SOCKET_IO_PATH || '/api/socket'}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
};

startServer();

