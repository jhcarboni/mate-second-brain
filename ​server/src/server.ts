import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import dotenv from 'dotenv';

dotenv.config();

const server = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
});

// Registo do plugin de WebSockets
server.register(fastifyWebsocket);

// Rota de Health Check
server.get('/health', async () => {
  return { status: 'online', system: 'mate-second-brain', timestamp: new Date().toISOString() };
});

// Gateway WebSocket para streaming de voz e comandos do Mate
server.register(async function (fastify) {
  fastify.get('/ws/mate', { websocket: true }, (connection, req) => {
    server.log.info('Cliente conectado ao WebSocket do Mate.');

    connection.socket.on('message', async (message: Buffer) => {
      try {
        // Identifica se a mensagem é payload binário (áudio PCM) ou texto de comando (JSON)
        if (Buffer.isBuffer(message) && message.length > 0) {
          server.log.info(`Recebido buffer de áudio: ${message.length} bytes`);
          // TODO: Encaminhar para o adaptador da Gemini Live API
        } else {
          const parsed = JSON.parse(message.toString());
          server.log.info({ parsed }, 'Comando recebido via JSON');
        }
      } catch (err) {
        server.log.error(err, 'Erro ao processar mensagem recebida pelo WebSocket');
      }
    });

    connection.socket.on('close', () => {
      server.log.info('Cliente desconectado do Mate.');
    });

    connection.socket.on('error', (err) => {
      server.log.error(err, 'Erro no canal WebSocket do cliente');
    });
  });
});

const start = async () => {
  const PORT = Number(process.env.PORT) || 4000;
  try {
    await server.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`\n🚀 Mate Second Brain API rodando em http://localhost:${PORT}`);
    console.log(`🎙️  WebSocket Endpoint ativo em ws://localhost:${PORT}/ws/mate\n`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
