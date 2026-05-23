export type PcmChunkHandler = (bytes: Uint8Array) => void;

export type PcmRecorderStartOptions = {
  onChunk: PcmChunkHandler;
};

/**
 * 把 Float32 PCM 样本转换为 Int16 LE，clamp 到 [-1, 1] 区间。
 * 与 public/pcm-worklet.js 中的转换保持一致。
 */
export function float32ToInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    let sample = samples[i];
    if (sample > 1) sample = 1;
    else if (sample < -1) sample = -1;
    out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return out;
}

export class PcmRecorder {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private readonly workletUrl: string;

  constructor(workletUrl = "/pcm-worklet.js") {
    this.workletUrl = workletUrl;
  }

  get isRecording(): boolean {
    return this.context !== null;
  }

  async start(options: PcmRecorderStartOptions): Promise<void> {
    if (this.context) {
      throw new Error("PcmRecorder 已在运行。");
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("当前环境不支持麦克风采集。");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    let context: AudioContext;
    try {
      context = new AudioContext({ sampleRate: 16000 });
    } catch {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      throw new Error("无法以 16kHz 创建 AudioContext。");
    }

    try {
      await context.audioWorklet.addModule(this.workletUrl);
    } catch (error) {
      await context.close();
      for (const track of stream.getTracks()) {
        track.stop();
      }
      throw new Error(
        `加载 PCM AudioWorklet 失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const source = context.createMediaStreamSource(stream);
    const workletNode = new AudioWorkletNode(context, "pcm-collector");

    workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      options.onChunk(new Uint8Array(event.data));
    };

    source.connect(workletNode);

    this.stream = stream;
    this.context = context;
    this.source = source;
    this.workletNode = workletNode;
  }

  async stop(): Promise<void> {
    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
    if (this.context) {
      const closing = this.context.close();
      this.context = null;
      await closing;
    }
  }
}
