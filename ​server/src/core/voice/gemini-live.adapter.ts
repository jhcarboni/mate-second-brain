import { GoogleGenAI } from '@google/genai';
import { WebSocket } from 'ws';

export interface LiveSessionCallbacks {
  onAudioData: (data: Buffer) => void;
  onTranscript: (text: string) => void;
  onToolCall: (name: string, args: Record<string, any>) => Promise<Record<string, any>>;
  onError: (error: any) => void;
  onClose: () => void;
}

export class GeminiLiveAdapter {
  private ai: GoogleGenAI;
  private session: any = null;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async startSession(callbacks: LiveSessionCallbacks) {
    try {
      // Inicializa a sessão interativa multimodal em tempo real
      this.session = await this.ai.aio.liveStream({
        model: 'gemini-2.5-flash',
        config: {
          generationConfig: {
            responseModalities: ['audio'], // Devolve fala sintetizada nativa
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: 'Puck' // Voz dinâmica e conversacional
                }
              }
            }
          },
          systemInstruction: {
            parts: [
              {
                text: `És o Mate, um segundo cérebro inteligente, técnico e com respostas concisas no estilo Jarvis. 
                       Regista ideias, tarefas e compromissos com precisão. Interage em tom natural.`
              }
            ]
          }
        }
      });

      // Escuta os eventos devolvidos pelo modelo
      (async () => {
        for await (const message of this.session.receive()) {
          if (message.serverContent?.modelTurn?.parts) {
            for (const part of message.serverContent.modelTurn.parts) {
              // Áudio de resposta devolvido pelo Gemini
              if (part.inlineData?.mimeType?.startsWith('audio/') && part.inlineData.data) {
                const audioBuffer = Buffer.from(part.inlineData.data, 'base64');
                callbacks.onAudioData(audioBuffer);
              }

              // Transcrição de texto auxiliar
              if (part.text) {
                callbacks.onTranscript(part.text);
              }

              // Execução de ferramentas estruturadas
              if (part.functionCall) {
                const { name, args } = part.functionCall;
                const result = await callbacks.onToolCall(name, args);

                // Devolve a resposta da tool ao Gemini para conclusão do fluxo
                await this.session.send({
                  toolResponse: {
                    functionResponses: [
                      {
                        name,
                        response: { output: result }
                      }
                    ]
                  }
                });
              }
            }
          }
        }
      })().catch(callbacks.onError);

    } catch (err) {
      callbacks.onError(err);
    }
  }

  // Envia fragmentos de áudio capturados pelo microfone (PCM 16-bit ou 24-bit)
  async sendAudioChunk(chunk: Buffer) {
    if (!this.session) return;

    await this.session.send({
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: 'audio/pcm;rate=16000',
            data: chunk.toString('base64')
          }
        ]
      }
    });
  }

  async close() {
    if (this.session) {
      await this.session.close();
      this.session = null;
    }
  }
}
