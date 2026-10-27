// side_panel/voice-capture-worklet.js - 录音采集 AudioWorklet 处理器
//
// 职责：收 Float32 输入 → 累积 1600 样本（@16k ≈ 100ms）→ 转 Int16 → 转移所有权回主线程。
// 说明：
//   - 该文件不参与 esbuild 打包，由 scripts/fix-build.js 直接复制到 dist/ 根；
//     面板按 ['voice-capture-worklet.js', 'dist/voice-capture-worklet.js'] 依次探测
//     （安装形态不同，扩展根也不同：装 dist 时在根，源码形态下在 dist/ 子目录），
//     加载走 chrome.runtime.getURL（CSP 禁止 blob:）；
//   - 顺带算 RMS 回传，供录音条波形与「没有听到声音」判定使用，避免主线程重复遍历。

class VoiceCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frameSize = 1600; // 100ms @ 16kHz
    this.buf = new Float32Array(this.frameSize);
    this.n = 0;
    this.rmsAcc = 0;
  }

  process(inputs) {
    const input = inputs[0];
    const channel = input && input[0];
    if (!channel || channel.length === 0) return true;

    for (let i = 0; i < channel.length; i++) {
      const sample = channel[i];
      this.rmsAcc += sample * sample;
      this.buf[this.n++] = sample;

      if (this.n >= this.frameSize) {
        const pcm = new Int16Array(this.frameSize);
        for (let j = 0; j < this.frameSize; j++) {
          const v = this.buf[j] < -1 ? -1 : this.buf[j] > 1 ? 1 : this.buf[j];
          pcm[j] = v < 0 ? v * 0x8000 : v * 0x7fff;
        }
        const rms = Math.sqrt(this.rmsAcc / this.frameSize);
        this.rmsAcc = 0;
        this.n = 0;
        const buf = pcm.buffer;
        this.port.postMessage({ type: 'chunk', pcm: buf, rms }, [buf]);
      }
    }
    return true;
  }
}

registerProcessor('voice-capture', VoiceCaptureProcessor);
