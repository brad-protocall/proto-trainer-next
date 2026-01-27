import WebSocket from "ws";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { encodeWav, calculateDuration } from "./wav-encoder.js";
import { loadPrompt, getRealtimeCallerPromptFile } from "./prompts.js";

// Read env vars lazily (after dotenv has loaded)
const getApiKey = () => process.env.OPENAI_API_KEY;
const getRealtimeModel = () => process.env.REALTIME_MODEL || "gpt-4o-realtime-preview";
const getRealtimeVoice = () => process.env.REALTIME_VOICE || "shimmer";
const getApiUrl = () => process.env.NEXT_PUBLIC_API_URL || "http://localhost:3003";
const OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime";

// UUID v4 regex for validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ConnectionParams {
  userId: string;
  scenarioId?: string;
  assignmentId?: string;
  record?: boolean;
}

interface TranscriptTurn {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface OpenAIMessage {
  type: string;
  event_id?: string;
  session?: {
    id: string;
    model: string;
    voice: string;
    instructions?: string;
  };
  delta?: string;
  transcript?: string;
  audio?: string;
  error?: {
    type: string;
    code: string;
    message: string;
  };
  item?: {
    id: string;
    type: string;
    role?: string;
    content?: Array<{
      type: string;
      transcript?: string;
      text?: string;
    }>;
  };
  response?: {
    id: string;
    status: string;
  };
}

export class RealtimeSession {
  private clientWs: WebSocket;
  private openaiWs: WebSocket | null = null;
  private params: ConnectionParams;
  private sessionId: string | null = null;
  private dbSessionId: string | null = null;
  private transcripts: TranscriptTurn[] = [];
  private currentUserTranscript: string = "";
  private currentAssistantTranscript: string = "";
  private scenarioPrompt: string | null = null;

  // Audio recording
  private audioChunks: Buffer[] = [];
  private isRecording: boolean;

  constructor(clientWs: WebSocket, params: ConnectionParams) {
    this.clientWs = clientWs;
    this.params = params;
    this.isRecording = params.record === true;

    if (this.isRecording) {
      console.log("[Session] Recording enabled for this session");
    }
  }

  /**
   * Create a database session at the start of the connection
   * This gives us a stable session ID to use for evaluation
   */
  private async createDbSession(): Promise<void> {
    try {
      const sessionBody = this.params.assignmentId
        ? {
            type: "assignment",
            assignmentId: this.params.assignmentId,
          }
        : {
            type: "free_practice",
            userId: this.params.userId,
            modelType: "phone",
            scenarioId: this.params.scenarioId,
          };

      const response = await fetch(`${getApiUrl()}/api/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": this.params.userId,
        },
        body: JSON.stringify(sessionBody),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok && data.data?.id) {
          this.dbSessionId = data.data.id;
          console.log(`[Session] Created DB session: ${this.dbSessionId}`);

          // Send DB session ID to client (this is what they should use for evaluation)
          this.sendToClient({
            type: "session.id",
            session_id: this.dbSessionId,
          });
        }
      } else if (response.status === 409 && this.params.assignmentId) {
        // Session already exists for this assignment - look it up and use it
        console.log(`[Session] Session already exists for assignment, fetching existing session...`);
        await this.fetchExistingSession();
      } else {
        console.error(`[Session] Failed to create DB session: ${response.status}`);
      }
    } catch (error) {
      console.error("[Session] Error creating DB session:", error);
    }
  }

  /**
   * Fetch existing session for this assignment when one already exists
   */
  private async fetchExistingSession(): Promise<void> {
    if (!this.params.assignmentId) return;

    try {
      // Fetch the assignment to get its existing session
      const response = await fetch(
        `${getApiUrl()}/api/assignments/${this.params.assignmentId}`,
        {
          headers: {
            "x-user-id": this.params.userId,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.ok && data.data?.sessionId) {
          this.dbSessionId = data.data.sessionId;
          console.log(`[Session] Using existing DB session: ${this.dbSessionId}`);

          // Send DB session ID to client
          this.sendToClient({
            type: "session.id",
            session_id: this.dbSessionId,
          });
        } else {
          console.error(`[Session] Assignment has no session ID`);
        }
      } else {
        console.error(`[Session] Failed to fetch assignment: ${response.status}`);
      }
    } catch (error) {
      console.error("[Session] Error fetching existing session:", error);
    }
  }

  /**
   * Validate and fetch the scenario prompt from the database
   * Returns null if validation fails or scenario doesn't exist
   */
  private async fetchScenarioPrompt(): Promise<string | null> {
    const { scenarioId } = this.params;

    // If no scenarioId provided, use free practice mode
    if (!scenarioId) {
      return null;
    }

    // Validate scenarioId format to prevent injection
    if (!UUID_REGEX.test(scenarioId)) {
      console.warn(`[Session] Invalid scenarioId format: ${scenarioId.substring(0, 50)}`);
      return null;
    }

    try {
      const response = await fetch(`${getApiUrl()}/api/scenarios/${scenarioId}`, {
        headers: {
          "x-user-id": this.params.userId,
        },
      });
      if (!response.ok) {
        console.warn(`[Session] Failed to fetch scenario ${scenarioId}: ${response.status}`);
        return null;
      }

      const data = await response.json();
      if (!data.ok || !data.data?.prompt) {
        console.warn(`[Session] Scenario ${scenarioId} not found or has no prompt`);
        return null;
      }

      console.log(`[Session] Loaded scenario: ${data.data.title}`);
      return data.data.prompt;
    } catch (error) {
      console.error(`[Session] Error fetching scenario:`, error);
      return null;
    }
  }

  async connect(): Promise<void> {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }

    // Fetch scenario prompt before connecting to OpenAI
    this.scenarioPrompt = await this.fetchScenarioPrompt();

    return new Promise((resolve, reject) => {
      const url = `${OPENAI_REALTIME_URL}?model=${getRealtimeModel()}`;

      this.openaiWs = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "OpenAI-Beta": "realtime=v1",
        },
      });

      this.openaiWs.on("open", async () => {
        console.log("[OpenAI] Connected to Realtime API");
        this.configureSession();

        // Create DB session immediately so client has the correct session ID
        await this.createDbSession();

        resolve();
      });

      this.openaiWs.on("message", (data: Buffer) => {
        this.handleOpenAIMessage(data);
      });

      this.openaiWs.on("error", (error) => {
        console.error("[OpenAI] WebSocket error:", error);
        reject(error);
      });

      this.openaiWs.on("close", (code, reason) => {
        console.log(
          `[OpenAI] Connection closed: ${code} - ${reason.toString()}`
        );
        // Notify client if OpenAI disconnects
        if (
          this.clientWs.readyState === WebSocket.OPEN
        ) {
          this.clientWs.send(
            JSON.stringify({
              type: "error",
              error: {
                type: "connection_closed",
                code: "openai_disconnected",
                message: "OpenAI Realtime API connection closed",
              },
            })
          );
        }
      });

      // Set up message forwarding from client to OpenAI
      this.clientWs.on("message", (data: Buffer) => {
        this.handleClientMessage(data);
      });
    });
  }

  private configureSession(): void {
    if (!this.openaiWs || this.openaiWs.readyState !== WebSocket.OPEN) {
      return;
    }

    // Build instructions based on scenario
    const instructions = this.buildInstructions();

    const sessionConfig = {
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        voice: getRealtimeVoice(),
        instructions,
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        input_audio_transcription: {
          model: "whisper-1",
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
      },
    };

    this.openaiWs.send(JSON.stringify(sessionConfig));
    console.log("[OpenAI] Session configured");
  }

  private buildInstructions(): string {
    // Use the fetched scenario prompt if available (overrides base instructions like original)
    if (this.scenarioPrompt) {
      return this.scenarioPrompt;
    }

    // Free practice mode - load base instructions from file
    // Fallback to hardcoded prompt if file not found (for resilience)
    const fallbackPrompt = "You are a crisis caller in a realistic roleplay training scenario for crisis counselors. Stay in character as someone experiencing emotional distress. Be responsive to the counselor's attempts to help, showing realistic emotional reactions. Do not break character or provide meta-commentary about the roleplay.";

    return loadPrompt(getRealtimeCallerPromptFile(), fallbackPrompt);
  }

  private handleOpenAIMessage(data: Buffer): void {
    try {
      const message: OpenAIMessage = JSON.parse(data.toString());

      // Log message type for debugging
      console.log(`[OpenAI] Received: ${message.type}`);

      switch (message.type) {
        case "session.created":
          this.sessionId = message.session?.id || null;
          console.log(`[OpenAI] Session created: ${this.sessionId}`);
          // Forward session info to client
          this.sendToClient({
            type: "session.created",
            session: {
              id: this.sessionId,
              model: message.session?.model,
              voice: message.session?.voice,
            },
          });
          break;

        case "session.updated":
          console.log("[OpenAI] Session updated");
          this.sendToClient(message);
          break;

        case "response.audio.delta":
          // Capture audio if recording is enabled
          if (this.isRecording && message.delta) {
            this.captureAudio(message.delta);
          }
          // Forward audio directly to client
          this.sendToClient({
            type: "response.audio.delta",
            delta: message.delta,
          });
          break;

        case "response.audio.done":
          this.sendToClient({ type: "response.audio.done" });
          break;

        case "response.audio_transcript.delta":
          // Accumulate assistant transcript
          if (message.delta) {
            this.currentAssistantTranscript += message.delta;
          }
          // Forward transcript delta to client
          this.sendToClient({
            type: "response.audio_transcript.delta",
            delta: message.delta,
          });
          break;

        case "response.audio_transcript.done":
          // Save completed assistant transcript
          if (this.currentAssistantTranscript) {
            this.transcripts.push({
              role: "assistant",
              content: this.currentAssistantTranscript,
              timestamp: new Date(),
            });
            console.log(
              `[Transcript] Assistant: ${this.currentAssistantTranscript.substring(0, 50)}...`
            );
          }
          this.currentAssistantTranscript = "";
          this.sendToClient({
            type: "response.audio_transcript.done",
            transcript: message.transcript,
          });
          break;

        case "conversation.item.input_audio_transcription.completed":
          // User's speech has been transcribed
          const userTranscript =
            (message as unknown as { transcript?: string }).transcript || "";
          if (userTranscript) {
            this.transcripts.push({
              role: "user",
              content: userTranscript,
              timestamp: new Date(),
            });
            console.log(
              `[Transcript] User: ${userTranscript.substring(0, 50)}...`
            );
          }
          this.sendToClient({
            type: "input_audio_transcription.completed",
            transcript: userTranscript,
          });
          break;

        case "error":
          console.error("[OpenAI] Error:", message.error);
          this.sendToClient({
            type: "error",
            error: message.error,
          });
          break;

        case "response.done":
          this.sendToClient({ type: "response.done" });
          break;

        default:
          // Forward other messages as-is
          this.sendToClient(message);
      }
    } catch (error) {
      console.error("[OpenAI] Failed to parse message:", error);
    }
  }

  private handleClientMessage(data: Buffer): void {
    if (!this.openaiWs || this.openaiWs.readyState !== WebSocket.OPEN) {
      console.warn("[Client] OpenAI WebSocket not ready, dropping message");
      return;
    }

    try {
      const message = JSON.parse(data.toString());

      // Handle special client messages
      if (message.type === "get_transcripts") {
        this.sendToClient({
          type: "transcripts",
          transcripts: this.transcripts,
        });
        return;
      }

      if (message.type === "request_evaluation") {
        // Send transcripts back to client for evaluation
        this.sendToClient({
          type: "evaluation_ready",
          transcripts: this.transcripts,
          sessionId: this.sessionId,
          assignmentId: this.params.assignmentId,
        });
        return;
      }

      // Capture user audio if recording is enabled
      if (this.isRecording && message.type === "input_audio_buffer.append" && message.audio) {
        this.captureAudio(message.audio);
      }

      // Forward all other messages to OpenAI
      console.log(`[Client] Forwarding: ${message.type}`);
      this.openaiWs.send(JSON.stringify(message));
    } catch (error) {
      console.error("[Client] Failed to parse message:", error);
    }
  }

  private sendToClient(message: object): void {
    if (this.clientWs.readyState === WebSocket.OPEN) {
      this.clientWs.send(JSON.stringify(message));
    }
  }

  /**
   * Capture audio chunk for recording
   */
  private captureAudio(base64Data: string): void {
    try {
      const audioBuffer = Buffer.from(base64Data, "base64");
      this.audioChunks.push(audioBuffer);
    } catch (error) {
      console.error("[Session] Failed to capture audio chunk:", error);
    }
  }

  /**
   * Save captured audio as WAV file and create recording in database
   */
  private async saveRecording(dbSessionId: string): Promise<void> {
    if (this.audioChunks.length === 0) {
      console.log("[Session] No audio chunks to save");
      return;
    }

    try {
      // Combine all audio chunks
      const totalSize = this.audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
      console.log(`[Session] Combining ${this.audioChunks.length} audio chunks (${totalSize} bytes)`);

      const combinedAudio = Buffer.concat(this.audioChunks);
      const wavBuffer = encodeWav(combinedAudio);
      const duration = calculateDuration(combinedAudio.length);

      // Create recordings directory
      const recordingsDir = path.join(process.cwd(), "..", "uploads", "recordings");
      await mkdir(recordingsDir, { recursive: true });

      // Save WAV file
      const filename = `${dbSessionId}.wav`;
      const filePath = path.join(recordingsDir, filename);
      await writeFile(filePath, wavBuffer);

      console.log(`[Session] Recording saved: ${filePath} (${wavBuffer.length} bytes, ${duration}s)`);

      // Create recording entry in database via API
      const response = await fetch(`${getApiUrl()}/api/recordings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: dbSessionId,
          filePath: `uploads/recordings/${filename}`,
          duration,
          fileSizeBytes: wavBuffer.length,
        }),
      });

      if (!response.ok) {
        console.error(`[Session] Failed to create recording entry: ${response.status}`);
      } else {
        console.log(`[Session] Recording entry created in database`);
      }
    } catch (error) {
      console.error("[Session] Failed to save recording:", error);
    }
  }

  async disconnect(): Promise<void> {
    console.log("[Session] Disconnecting...");

    // Flush any in-flight transcript
    if (this.currentAssistantTranscript) {
      this.transcripts.push({
        role: "assistant",
        content: this.currentAssistantTranscript,
        timestamp: new Date(),
      });
      this.currentAssistantTranscript = "";
    }
    if (this.currentUserTranscript) {
      this.transcripts.push({
        role: "user",
        content: this.currentUserTranscript,
        timestamp: new Date(),
      });
      this.currentUserTranscript = "";
    }

    // Log final transcript count
    console.log(
      `[Session] Total transcript turns captured: ${this.transcripts.length}`
    );

    // Persist transcripts if we have any (supports both assignment and free practice)
    if (this.transcripts.length > 0) {
      await this.persistTranscripts();
    }

    // Save recording if enabled and we have a session
    if (this.isRecording && this.dbSessionId) {
      await this.saveRecording(this.dbSessionId);
    }

    // Clear audio chunks to free memory
    this.audioChunks = [];

    if (this.openaiWs) {
      this.openaiWs.close();
      this.openaiWs = null;
    }
  }

  private async persistTranscripts(): Promise<void> {
    // Use the session created at connection time
    if (!this.dbSessionId) {
      console.error("[Session] No DB session ID available for persisting transcripts");
      return;
    }

    try {
      console.log(`[Session] Persisting ${this.transcripts.length} transcript turns to session ${this.dbSessionId}...`);

      // Save each transcript turn to the existing session
      for (let i = 0; i < this.transcripts.length; i++) {
        const turn = this.transcripts[i];
        const turnResponse = await fetch(`${getApiUrl()}/api/sessions/${this.dbSessionId}/message`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": this.params.userId,
          },
          body: JSON.stringify({
            role: turn.role,
            content: turn.content,
            turnOrder: i,
          }),
        });

        if (!turnResponse.ok) {
          console.warn(`[Session] Failed to save turn ${i}: ${turnResponse.status}`);
        }
      }

      console.log(`[Session] Transcripts persisted to session ${this.dbSessionId}`);
    } catch (error) {
      console.error("[Session] Failed to persist transcripts:", error);
    }
  }

  getTranscripts(): TranscriptTurn[] {
    return [...this.transcripts];
  }

  getSessionId(): string | null {
    return this.sessionId;
  }
}
