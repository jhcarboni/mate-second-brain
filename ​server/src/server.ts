import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import dotenv from 'dotenv';
import { GeminiLiveAdapter } from './core/voice/gemini-live.adapter';

dotenv.config();

const server = Fastify({ logger: true });
server.register(fastifyWebsocket);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

server.register(async function (fastify) {
  fastify.get('/ws/mate', { websocket: true }, async (connection) => {
    server.log.info('Cliente conectado ao WebSocket.');

    const liveAdapter = new GeminiLiveAdapter(GEMINI_API_KEY);

    // Inicia a sessão com o Gemini e define os canais de retorno
    await liveAdapter.startSession({
      onAudioData: (audioBuffer) => {
        // Envia o áudio de volta ao cliente para alimentar o avatar e os altifalantes
        connection.socket.send(audioBuffer);
      },
      onTranscript: (text) => {
        connection.socket.send(JSON.stringify({ type: 'transcript', text }));
      },
      onToolCall: async (name, args) => {
        server.log.info({ name, args }, 'Tool Call disparada pelo Mate');
        // TODO: Executar rotinas na base de dados PostgreSQL
        return { status: 'success', executed: name };
      },
      onError: (err) => {
        server.log.error(err, 'Erro na sessão do Gemini Live');
      },
      onClose: () => {
        server.log.info('Sessão do Gemini Live encerrada.');
      }
    });

    // Recebe áudio do microfone do utilizador e envia para o Gemini
    connection.socket.on('message', async (message: Buffer) => {
      if (Buffer.isBuffer(message)) {
        await liveAdapter.sendAudioChunk(message);
      }
    });

    connection.socket.on('close', async () => {
      await liveAdapter.close();
      server.log.info('Conexão encerrada.');
    });
  });
});

server.listen({ port: 4000, host: '0.0.0.0' });
