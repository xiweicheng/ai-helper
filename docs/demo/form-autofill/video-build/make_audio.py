#!/usr/bin/env python3
"""合成演示视频音轨：中文旁白(macOS say) + 科技办公风 BGM + 音效，混音输出 mix.wav"""
import os
import subprocess
import sys
import wave

import numpy as np

TOTAL = float(sys.argv[1]) if len(sys.argv) > 1 else 66.9
LANG = sys.argv[2] if len(sys.argv) > 2 else "zh"

SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
AUDIO = os.path.join(HERE, "audio" if LANG == "zh" else f"audio-{LANG}")
os.makedirs(AUDIO, exist_ok=True)

# ---------------- 基础工具 ----------------

def tone(freq, dur, decay=4.0, harmonics=(1.0, 0.35, 0.12)):
    t = np.arange(int(dur * SR)) / SR
    s = sum(a * np.sin(2 * np.pi * freq * (i + 1) * t) for i, a in enumerate(harmonics))
    return s * np.exp(-decay * t)


def place(buf, sig, at, gain=1.0):
    i = int(at * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += gain * sig[: j - i]


def read_wav(path):
    with wave.open(path, "rb") as w:
        n = w.getnframes()
        raw = w.readframes(n)
        ch = w.getnchannels()
        sr = w.getframerate()
    data = np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768.0
    if ch == 2:
        data = data.reshape(-1, 2).mean(axis=1)
    if sr != SR:
        idx = np.linspace(0, len(data) - 1, int(len(data) * SR / sr)).astype(int)
        data = data[idx]
    return data


# ---------------- 旁白（macOS say：zh=婷婷 / en=Samantha） ----------------

VOICE = {"zh": ("Tingting", "205"), "en": ("Samantha", "185")}[LANG]

LINES = {
    "zh": [
        (0.3, "AI插件，自动批量录入表单。"),
        (3.5, "Excel是批量数据源，共三条，本次按要求录入前两条。"),
        (8.9, "插件启动后，自动跳转表单页面，逐行读取Excel内容。"),
        (24.0, "调用表单填写技能，自动填入每个字段，按步骤推进，全程无需手动操作。"),
        (45.0, "确认弹窗自动核对，一键提交。"),
        (58.8, "前两条数据准确提交完成，与Excel源数据完全一致。"),
        (62.6, "解放双手，效率翻倍，点赞收藏。"),
    ],
    "en": [
        (0.3, "AI plugin for automatic batch form filling."),
        (3.5, "The Excel sheet is the source: three rows, and we fill the first two."),
        (8.9, "Once launched, the plugin opens the form page and reads the Excel row by row."),
        (24.0, "It calls the form-filling skill, fills every field automatically, and advances step by step. No manual work at all."),
        (45.0, "The confirm dialog is checked automatically, then submitted with one click."),
        (58.8, "The first two rows are submitted accurately, matching the Excel source exactly."),
        (62.6, "Hands free, double efficiency. Like and save for later."),
    ],
}[LANG]

narr_buf = np.zeros(int((TOTAL + 1.5) * SR))
spans = []
prev_end = 0.0
for k, (start, text) in enumerate(LINES):
    aiff = os.path.join(AUDIO, f"vo{k}.aiff")
    wavp = os.path.join(AUDIO, f"vo{k}.wav")
    subprocess.run(["say", "-v", VOICE[0], "-r", VOICE[1], "-o", aiff, text], check=True)
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", aiff, "-ar", str(SR), "-ac", "1", wavp],
        check=True,
    )
    sig = read_wav(wavp)
    # 去掉尾部静音
    nz = np.nonzero(np.abs(sig) > 0.004)[0]
    if len(nz):
        sig = sig[: nz[-1] + int(0.15 * SR)]
    at = max(start, prev_end + 0.25)
    place(narr_buf, sig, at, gain=1.0)
    spans.append((at, at + len(sig) / SR))
    prev_end = at + len(sig) / SR
    print(f"VO{k} @{at:.2f}-{at + len(sig) / SR:.2f}  {text}")

# ---------------- BGM（科技办公风：和弦垫 + 拨弦琶音 + 轻鼓点） ----------------

bg = np.zeros(int((TOTAL + 3) * SR))
CHORDS = [
    (261.63, 329.63, 392.00),  # C
    (196.00, 246.94, 293.66),  # G
    (220.00, 261.63, 329.63),  # Am
    (174.61, 220.00, 261.63),  # F
]
BAR = 2.4
for bar in range(int(TOTAL / BAR) + 2):
    chord = CHORDS[bar % 4]
    t0 = bar * BAR
    # 和弦垫
    tt = np.arange(int(2.7 * SR)) / SR
    env = np.clip(tt / 0.5, 0, 1) * np.clip((2.7 - tt) / 0.8, 0, 1)
    for f in chord:
        pad = (0.5 * np.sin(2 * np.pi * f * tt) + 0.22 * np.sin(4 * np.pi * f * tt)
               + 0.08 * np.sin(6 * np.pi * f * tt))
        place(bg, pad * env, t0, gain=0.050)
    # 八分音符琶音拨弦
    seq = [chord[0] * 2, chord[1] * 2, chord[2] * 2, chord[1] * 2] * 2
    for k, f in enumerate(seq):
        place(bg, tone(f, 0.26, decay=7, harmonics=(1.0, 0.25)), t0 + 0.3 * k, gain=0.065)
    # 轻踩镲（反拍）
    for k in range(8):
        if k % 2 == 1:
            n = np.random.randn(int(0.045 * SR))
            hp = np.diff(np.concatenate(([0.0], n)))
            place(bg, hp * np.exp(-np.arange(len(hp)) / SR * 90), t0 + 0.3 * k, gain=0.020)
    # 柔和底鼓
    for b in range(4):
        tk = np.arange(int(0.13 * SR)) / SR
        f = 140 * np.exp(-tk * 28) + 52
        kick = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tk * 24)
        place(bg, kick, t0 + 0.6 * b, gain=0.085)

bg = bg[: int(TOTAL * SR)]
fi = int(0.8 * SR)
bg[:fi] *= np.linspace(0, 1, fi)
fo = int(2.2 * SR)
bg[-fo:] *= np.linspace(1, 0, fo)

# 旁白处自动闪避
duck = np.ones_like(bg)
for (s, e) in spans:
    i0, i1 = max(0, int((s - 0.1) * SR)), min(len(duck), int((e + 0.15) * SR))
    r = int(0.2 * SR)
    duck[i0:i1] = 0.45
    if i0 - r >= 0:
        duck[i0 - r:i0] = np.linspace(1, 0.45, r)
    if i1 + r <= len(duck):
        duck[i1:i1 + r] = np.linspace(0.45, 1, r)
bg *= duck

# ---------------- 音效 ----------------

sfx = np.zeros(int((TOTAL + 1.5) * SR))

# 片头 whoosh：带限噪声扫掠
wn = np.random.randn(int(1.3 * SR))
F = np.fft.rfft(wn)
fr = np.fft.rfftfreq(len(wn), 1 / SR)
mask = np.clip((fr - 250) / 350, 0, 1) * np.clip((5200 - fr) / 1800, 0, 1)
wn = np.fft.irfft(F * mask, len(wn))
env = np.sin(np.linspace(0, np.pi, len(wn))) ** 1.5
place(sfx, wn * env, 0.05, gain=0.22)

# 数据行高亮 tick
for at in (3.8, 5.2, 6.6):
    place(sfx, tone(1500, 0.06, decay=55, harmonics=(1.0, 0.2)), at, gain=0.20)

# 步骤切换 blip（上扬提示音）
for at in (17.4, 30.4, 43.4, 53.4):
    t = np.arange(int(0.12 * SR)) / SR
    f = 900 * np.exp(t * 6)
    blip = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 26)
    place(sfx, blip, at, gain=0.30)

# 提交成功 chime
for k, f in enumerate([659.25, 783.99, 1046.50]):
    place(sfx, tone(f, 1.0, decay=3.5, harmonics=(1.0, 0.4, 0.18)), 58.5 + k * 0.10, gain=0.26)

# 收尾 pop
t = np.arange(int(0.15 * SR)) / SR
f = 520 * np.exp(-t * 12) + 150
place(sfx, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 20), 63.1, gain=0.32)

# ---------------- 混音输出 ----------------

n = max(len(narr_buf), len(bg), len(sfx))
mix = np.zeros(n)
mix[: len(narr_buf)] += narr_buf * 0.95
mix[: len(bg)] += bg * 0.60
mix[: len(sfx)] += sfx
mix = mix[: int((TOTAL + 0.8) * SR)]
peak = np.max(np.abs(mix))
if peak > 0.89:
    mix *= 0.89 / peak

stereo = np.repeat(mix[:, None], 2, axis=1)
out = os.path.join(AUDIO, "mix.wav")
with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((stereo * 32767).astype(np.int16).tobytes())
print("written", out, f"{len(mix) / SR:.2f}s peak={peak:.2f}")
