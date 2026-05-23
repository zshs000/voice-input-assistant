// AudioWorklet processor: 收集 16kHz Float32 mono 输入，按 100ms (1600 samples / 3200 bytes)
// 分块转为 Int16 LE 并 postMessage 出去。
//
// 调用方必须使用 new AudioContext({ sampleRate: 16000 })，硬件采样率由浏览器代为重采样。
const TARGET_FRAMES = 1600;

class PcmCollectorProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Int16Array(TARGET_FRAMES);
    this.offset = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }
    const channel = input[0];
    if (!channel) {
      return true;
    }

    for (let i = 0; i < channel.length; i++) {
      let sample = channel[i];
      if (sample > 1) sample = 1;
      else if (sample < -1) sample = -1;
      this.buffer[this.offset++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;

      if (this.offset >= this.buffer.length) {
        const chunk = new Int16Array(this.buffer);
        this.port.postMessage(chunk.buffer, [chunk.buffer]);
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-collector", PcmCollectorProcessor);
