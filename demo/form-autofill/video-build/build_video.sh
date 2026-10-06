#!/bin/bash
# 合成「AI插件自动批量录入表单」演示视频：5 段画面 + 拼接 + 混音输出 MP4
# 用法: bash build_video.sh [zh|en]   （默认 zh）
set -e
cd "$(dirname "$0")/.."
VB=video-build
VDIR="../../docs/videos"
mkdir -p "$VDIR"
MOV="商品表单录入自动化.mov"
XLS="商品录入数据.png"
ENC="-r 30 -pix_fmt yuv420p -c:v libx264 -preset fast -crf 18"
LANG=${1:-zh}

if [ "$LANG" = "en" ]; then
  FONT="/System/Library/Fonts/Helvetica.ttc"
  OUT="$VDIR/form-autofill-demo-en.mp4"; ADIR="$VB/audio-en"
  T0_TAG='AI HELPER · OFFICE AUTOMATION DEMO'; T0_TITLE='AI Auto-Fills Forms in Batch'; T0_SUB='No more manual repetition · One sentence done'
  FS0T=64; FS0S=36
  T1_TAG='STEP 1 · DATA PREP'
  CAP1_X=135; CAP1_W=1650; CAP1_FS=26; CAP1_T='Batch form data source · 3 rows · This demo fills the first 2'
  P2_X=310; P2_W=1300; P2_FS=30
  T_P1='1. Launch · Parse form page'; T_P2='2. Read Excel rows · Auto-fill fields'; T_P3='3. Advance steps · Price, stock, tags'; T_P4='4. Auto-check confirm · One-click submit'; T_P5='5. Verified · First 2 rows recorded'
  BADGE3_W=300; T_BADGE3='Submitted'; T_XL3='Excel source · 3 rows'
  NAME_FS=26; T_N1='Wireless BT Headphones'; T_N2='Cotton Crew-Neck Tee'; T_N3='Organic Nuts Gift Box'
  PILL_X=1695; PILL_W=160; PILL_FS=22; T_DONE='Done'; X_DONE=1731; T_SKIP='Skipped'; X_SKIP=1698
  CAP3_X=310; CAP3_W=1300; CAP3_FS=28; CAP3_T='First 2 rows submitted · Matches Excel source'
  T4_MAIN='Hands Free. Efficiency Doubled.'; FS4M=60; T4_SUB='↑ Like · Save · Easy replay'; T4_FOOT='AI Helper · Web Smart Assistant'
else
  FONT="/System/Library/Fonts/Hiragino Sans GB.ttc"
  OUT="$VDIR/form-autofill-demo-zh.mp4"; ADIR="$VB/audio"
  T0_TAG='AI HELPER · 办公自动化演示'; T0_TITLE='AI插件自动批量录入表单'; T0_SUB='告别手动重复操作 · 一句话完成'
  FS0T=92; FS0S=44
  T1_TAG='① 数据准备'
  CAP1_X=410; CAP1_W=1100; CAP1_FS=32; CAP1_T='待录入的批量表单数据源 · 共3条 · 本次演示录入前2条'
  P2_X=520; P2_W=880; P2_FS=34
  T_P1='① 启动插件 · 解析目标表单页'; T_P2='② 逐行读取Excel · 自动填入字段'; T_P3='③ 按步骤推进 · 价格库存标签填写'; T_P4='④ 确认弹窗自动核对 · 一键提交'; T_P5='⑤ 结果校验 · 前2条录入完成'
  BADGE3_W=220; T_BADGE3='提交成功'; T_XL3='Excel源数据 · 3条'
  NAME_FS=34; T_N1='无线蓝牙降噪耳机'; T_N2='纯棉圆领印花T恤'; T_N3='有机混合坚果礼盒'
  PILL_X=1700; PILL_W=150; PILL_FS=26; T_DONE='已录入'; X_DONE=1735; T_SKIP='本次未录入'; X_SKIP=1710
  CAP3_X=510; CAP3_W=900; CAP3_FS=36; CAP3_T='前2条数据准确提交 · 与Excel源一致'
  T4_MAIN='解放双手  批量办公效率翻倍'; FS4M=76; T4_SUB='↑ 点赞 · 收藏 · 方便回看'; T4_FOOT='AI Helper · 网页智能助手'
fi

# 成功定格帧（t=79 执行结果汇总画面）
ffmpeg -y -loglevel error -ss 79 -i "$MOV" -frames:v 1 "$VB/freeze.png"

# ---------- S0 片头 3.2s：蓝白渐变数据流 + 标题 ----------
ffmpeg -y -loglevel error -f lavfi -i "gradients=s=1920x1080:d=3.2:speed=0.035:n=4:c0=0x071A33:c1=0x0D47A1:c2=0x1E88E5:c3=0x90CAF9" \
 -vf "drawgrid=w=96:h=96:color=white@0.05:t=1,\
drawbox=x=0:y=0:w=1920:h=1080:color=0x071A33@0.5:t=fill,\
drawbox=x='mod(t*700,2400)-240':y=0:w=180:h=1080:color=white@0.10:t=fill,\
drawbox=x='mod(t*700+1200,2400)-240':y=0:w=90:h=1080:color=white@0.07:t=fill,\
drawtext=fontfile=$FONT:text='$T0_TAG':fontcolor=0x80D8FF:fontsize=30:x=(w-text_w)/2:y=336:alpha='clip(t/0.4,0,1)',\
drawtext=fontfile=$FONT:text='$T0_TITLE':fontcolor=white:fontsize=$FS0T:x=(w-text_w)/2:y=430:shadowcolor=0x0D47A1@0.7:shadowx=0:shadowy=6:alpha='clip(t/0.4,0,1)',\
drawtext=fontfile=$FONT:text='$T0_SUB':fontcolor=0xBBDEFB:fontsize=$FS0S:x=(w-text_w)/2:y=580:alpha='clip((t-0.7)/0.5,0,1)',\
fade=t=out:st=2.95:d=0.25" $ENC "$VB/seg0.mp4"

# ---------- S1 5.2s：Excel 数据源特写 + 逐行高亮 ----------
ffmpeg -y -loglevel error -f lavfi -i "color=c=0x0A1226:s=1920x1080:d=5.2" -loop 1 -i "$XLS" \
 -filter_complex "[1:v]scale=1800:-1[img];\
[0:v]drawgrid=w=96:h=96:color=white@0.04:t=1[bg];\
[bg][img]overlay=60:330[v];\
[v]drawbox=x=60:y=330:w=1800:h=213:color=white@0.30:t=2,\
drawbox=x=109:y=433:w=1751:h=24:color=0x00E5FF@0.30:t=fill:enable='between(t,0.6,2.0)',\
drawbox=x=109:y=433:w=1751:h=24:color=0x00E5FF:t=3:enable='between(t,0.6,2.0)',\
drawbox=x=109:y=457:w=1751:h=24:color=0x00E5FF@0.30:t=fill:enable='between(t,2.0,3.4)',\
drawbox=x=109:y=457:w=1751:h=24:color=0x00E5FF:t=3:enable='between(t,2.0,3.4)',\
drawbox=x=109:y=481:w=1751:h=24:color=0x90A4AE@0.25:t=fill:enable='between(t,3.4,4.8)',\
drawbox=x=109:y=481:w=1751:h=24:color=0x90A4AE:t=3:enable='between(t,3.4,4.8)',\
drawbox=x='60+mod(t*450,1800)':y=330:w=3:h=213:color=0x00E5FF@0.7:t=fill:enable='between(t,0.3,4.9)',\
drawtext=fontfile=$FONT:text='$T1_TAG':fontcolor=0x80D8FF:fontsize=40:x=80:y=120:alpha='clip(t/0.3,0,1)',\
drawbox=x=$CAP1_X:y=880:w=$CAP1_W:h=76:color=0x0B1220@0.85:t=fill,\
drawbox=x=$CAP1_X:y=880:w=$CAP1_W:h=76:color=0x00E5FF@0.6:t=2,\
drawtext=fontfile=$FONT:text='$CAP1_T':fontcolor=white:fontsize=$CAP1_FS:x=(w-text_w)/2:y=902,\
fade=t=in:st=0:d=0.25,fade=t=out:st=4.95:d=0.25" -t 5.2 $ENC "$VB/seg1.mp4"

# ---------- S2 50s：录屏主体 1.6x + 步骤字幕 + 高亮闪烁 + 进度条 ----------
ffmpeg -y -loglevel error -i "$MOV" \
 -vf "setpts=PTS/1.6,scale=1920:1080:flags=lanczos,\
drawbox=x=$P2_X:y=24:w=$P2_W:h=64:color=0x0B1220@0.80:t=fill,\
drawbox=x=$P2_X:y=24:w=$P2_W:h=64:color=0x00E5FF@0.7:t=2,\
drawtext=fontfile=$FONT:text='$T_P1':fontcolor=white:fontsize=$P2_FS:x=(w-text_w)/2:y=38:enable='between(t,0,9)',\
drawtext=fontfile=$FONT:text='$T_P2':fontcolor=white:fontsize=$P2_FS:x=(w-text_w)/2:y=38:enable='between(t,9,22)',\
drawtext=fontfile=$FONT:text='$T_P3':fontcolor=white:fontsize=$P2_FS:x=(w-text_w)/2:y=38:enable='between(t,22,35)',\
drawtext=fontfile=$FONT:text='$T_P4':fontcolor=white:fontsize=$P2_FS:x=(w-text_w)/2:y=38:enable='between(t,35,45)',\
drawtext=fontfile=$FONT:text='$T_P5':fontcolor=white:fontsize=$P2_FS:x=(w-text_w)/2:y=38:enable='between(t,45,50)',\
drawbox=x=1072:y=165:w=815:h=870:color=0x00E5FF@0.12:t=10:enable='between(t,0,9)*lt(mod(t,1),0.6)',\
drawbox=x=1072:y=165:w=815:h=870:color=0x00E5FF:t=4:enable='between(t,0,9)*lt(mod(t,1),0.6)',\
drawbox=x=142:y=210:w=766:h=550:color=0x00E5FF@0.12:t=10:enable='between(t,9,35)*lt(mod(t,1),0.6)',\
drawbox=x=142:y=210:w=766:h=550:color=0x00E5FF:t=4:enable='between(t,9,35)*lt(mod(t,1),0.6)',\
drawbox=x=252:y=237:w=546:h=678:color=0x00E5FF@0.12:t=10:enable='between(t,35,45)*lt(mod(t,1),0.6)',\
drawbox=x=252:y=237:w=546:h=678:color=0x00E5FF:t=4:enable='between(t,35,45)*lt(mod(t,1),0.6)',\
drawbox=x=142:y=830:w=766:h=210:color=0x00E5FF@0.12:t=10:enable='between(t,45,50)*lt(mod(t,1),0.6)',\
drawbox=x=142:y=830:w=766:h=210:color=0x00E5FF:t=4:enable='between(t,45,50)*lt(mod(t,1),0.6)',\
drawbox=x=0:y=1072:w=1920:h=8:color=white@0.12:t=fill,\
drawbox=x=0:y=1072:w='1920*t/50':h=8:color=0x00E5FF:t=fill,\
fade=t=in:st=0:d=0.2" -an $ENC "$VB/seg2.mp4"

# ---------- S3 5s：成功定格 + 分屏对比 Excel 录入结果 ----------
ffmpeg -y -loglevel error -f lavfi -i "color=c=0x0A1226:s=1920x1080:d=5" -i "$VB/freeze.png" -loop 1 -i "$XLS" \
 -filter_complex "[1:v]scale=1150:-1[fr];[2:v]scale=650:-1[xl];\
[0:v]drawgrid=w=96:h=96:color=white@0.04:t=1[bg];\
[bg][fr]overlay=40:216[v1];\
[v1][xl]overlay=1230:240[v2];\
[v2]drawbox=x=40:y=216:w=1150:h=647:color=0x00E676@0.8:t=3,\
drawbox=x=40:y=150:w=$BADGE3_W:h=56:color=0x00E676@0.92:t=fill,\
drawtext=fontfile=$FONT:text='$T_BADGE3':fontcolor=white:fontsize=32:x=72:y=162,\
drawtext=fontfile=$FONT:text='$T_XL3':fontcolor=0x90A4AE:fontsize=28:x=1230:y=196,\
drawbox=x=1230:y=240:w=650:h=77:color=0x00E5FF:t=2:enable='lt(mod(t,1),0.6)',\
drawbox=x=1230:y=380:w=650:h=140:color=0x11203A@0.92:t=fill:enable='between(t,0.5,5)',\
drawbox=x=1230:y=380:w=650:h=140:color=white@0.15:t=2:enable='between(t,0.5,5)',\
drawtext=fontfile=$FONT:text='$T_N1':fontcolor=white:fontsize=$NAME_FS:x=1262:y=410:enable='between(t,0.5,5)',\
drawtext=fontfile=$FONT:text='SKU-EAR-001':fontcolor=0x90A4AE:fontsize=26:x=1262:y=462:enable='between(t,0.5,5)',\
drawbox=x=$PILL_X:y=428:w=$PILL_W:h=48:color=0x00C853@0.9:t=fill:enable='between(t,0.5,5)',\
drawtext=fontfile=$FONT:text='$T_DONE':fontcolor=white:fontsize=$PILL_FS:x=$X_DONE:y=438:enable='between(t,0.5,5)',\
drawbox=x=1230:y=545:w=650:h=140:color=0x11203A@0.92:t=fill:enable='between(t,1.0,5)',\
drawbox=x=1230:y=545:w=650:h=140:color=white@0.15:t=2:enable='between(t,1.0,5)',\
drawtext=fontfile=$FONT:text='$T_N2':fontcolor=white:fontsize=$NAME_FS:x=1262:y=575:enable='between(t,1.0,5)',\
drawtext=fontfile=$FONT:text='SKU-CLT-088':fontcolor=0x90A4AE:fontsize=26:x=1262:y=627:enable='between(t,1.0,5)',\
drawbox=x=$PILL_X:y=593:w=$PILL_W:h=48:color=0x00C853@0.9:t=fill:enable='between(t,1.0,5)',\
drawtext=fontfile=$FONT:text='$T_DONE':fontcolor=white:fontsize=$PILL_FS:x=$X_DONE:y=603:enable='between(t,1.0,5)',\
drawbox=x=1230:y=710:w=650:h=140:color=0x11203A@0.92:t=fill:enable='between(t,1.5,5)',\
drawbox=x=1230:y=710:w=650:h=140:color=white@0.15:t=2:enable='between(t,1.5,5)',\
drawtext=fontfile=$FONT:text='$T_N3':fontcolor=0x90A4AE:fontsize=$NAME_FS:x=1262:y=740:enable='between(t,1.5,5)',\
drawtext=fontfile=$FONT:text='SKU-FOD-203':fontcolor=0x607D8B:fontsize=26:x=1262:y=792:enable='between(t,1.5,5)',\
drawbox=x=$PILL_X:y=758:w=$PILL_W:h=48:color=0x607D8B@0.9:t=fill:enable='between(t,1.5,5)',\
drawtext=fontfile=$FONT:text='$T_SKIP':fontcolor=white:fontsize=$PILL_FS:x=$X_SKIP:y=768:enable='between(t,1.5,5)',\
drawbox=x=$CAP3_X:y=940:w=$CAP3_W:h=76:color=0x0B1220@0.85:t=fill,\
drawbox=x=$CAP3_X:y=940:w=$CAP3_W:h=76:color=0x00E676@0.6:t=2,\
drawtext=fontfile=$FONT:text='$CAP3_T':fontcolor=white:fontsize=$CAP3_FS:x=(w-text_w)/2:y=960,\
fade=t=in:st=0:d=0.25,fade=t=out:st=4.75:d=0.25" -t 5 $ENC "$VB/seg3.mp4"

# ---------- S4 3.5s：收尾 ----------
ffmpeg -y -loglevel error -f lavfi -i "gradients=s=1920x1080:d=3.5:speed=0.02:n=4:c0=0x071A33:c1=0x0D47A1:c2=0x1E88E5:c3=0x90CAF9" \
 -vf "drawgrid=w=96:h=96:color=white@0.05:t=1,\
drawtext=fontfile=$FONT:text='$T4_MAIN':fontcolor=white:fontsize=$FS4M:x=(w-text_w)/2:y=430:shadowcolor=0x0D47A1@0.7:shadowx=0:shadowy=5:alpha='clip(t/0.3,0,1)',\
drawtext=fontfile=$FONT:text='$T4_SUB':fontcolor=0xFFF176:fontsize=42:x=(w-text_w)/2:y='570-8*abs(sin(2*PI*t*1.2))':alpha='clip((t-0.8)/0.4,0,1)',\
drawtext=fontfile=$FONT:text='$T4_FOOT':fontcolor=0x90A4AE:fontsize=28:x=(w-text_w)/2:y=980:alpha='clip((t-1.2)/0.4,0,1)',\
fade=t=in:st=0:d=0.25,fade=t=out:st=3.1:d=0.4" $ENC "$VB/seg4.mp4"

# ---------- 拼接 + 混音 ----------
printf "file 'seg0.mp4'\nfile 'seg1.mp4'\nfile 'seg2.mp4'\nfile 'seg3.mp4'\nfile 'seg4.mp4'\n" > "$VB/list.txt"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$VB/list.txt" -c copy "$VB/video_silent.mp4"
ffmpeg -y -loglevel error -i "$VB/video_silent.mp4" -i "$ADIR/mix.wav" \
  -c:v copy -c:a aac -b:a 192k -shortest "$OUT"
# 封面图（片头标题帧 t=1.5s，用作 Pages/README 的 video poster）
ffmpeg -y -loglevel error -ss 1.5 -i "$OUT" -frames:v 1 -q:v 2 "$VDIR/cover-$LANG.jpg"
echo "DONE: $OUT"
