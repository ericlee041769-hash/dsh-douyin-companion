// Original code-drawn product film. No downloaded footage, screenshots or voiceover.
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

const W = 1920, H = 1080, FPS = 60, DURATION = 45;
const OUT = path.resolve(process.env.PROMO_OUT || path.join(__dirname, 'rendered'));
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
if (process.env.PROMO_FONT) GlobalFonts.registerFromPath(process.env.PROMO_FONT, 'Promo Sans');
const FONT = process.env.PROMO_FONT ? 'Promo Sans' : 'Microsoft YaHei, Noto Sans CJK SC, sans-serif';
const canvas = createCanvas(W, H), c = canvas.getContext('2d');
const clamp = n => Math.max(0, Math.min(1, n));
const ease = n => { n = clamp(n); return n * n * (3 - 2 * n); };
const out = n => 1 - Math.pow(1 - clamp(n), 4);
const lerp = (a, b, n) => a + (b - a) * n;
const INK = '#17191f', GRAY = '#787d89', BLUE = '#3164ff';

function box(x,y,w,h,r,fill,stroke) {
  c.beginPath(); c.roundRect(x,y,w,h,r);
  if (fill) { c.fillStyle=fill; c.fill(); }
  if (stroke) { c.strokeStyle=stroke; c.lineWidth=1; c.stroke(); }
}
function label(s,x,y,size=28,color=INK,weight=400,align='left') {
  c.font=`${weight} ${size}px ${FONT}`; c.textAlign=align; c.textBaseline='middle'; c.fillStyle=color; c.fillText(s,x,y);
}
function circle(x,y,r,fill) { c.beginPath(); c.arc(x,y,r,0,Math.PI*2); c.fillStyle=fill; c.fill(); }
function line(x1,y1,x2,y2,color,width=2) { c.beginPath(); c.moveTo(x1,y1); c.lineTo(x2,y2); c.strokeStyle=color; c.lineWidth=width; c.lineCap='round'; c.stroke(); }
function play(x,y,size,color='#fff') { c.beginPath(); c.moveTo(x-size*.32,y-size*.5); c.lineTo(x+size*.5,y); c.lineTo(x-size*.32,y+size*.5); c.closePath(); c.fillStyle=color; c.fill(); }
function pause(x,y,size,color='#fff') { box(x-size*.36,y-size*.48,size*.25,size*.96,4,color); box(x+size*.11,y-size*.48,size*.25,size*.96,4,color); }
function check(x,y,size,color='#20a271') { line(x-size*.4,y,x-size*.1,y+size*.3,color,4); line(x-size*.1,y+size*.3,x+size*.45,y-size*.32,color,4); }
function pill(s,x,y,w,color='#edf2ff',text=BLUE) { box(x,y,w,42,21,color); label(s,x+w/2,y+21,20,text,500,'center'); }
function fade(amount,fn) { c.save(); c.globalAlpha*=clamp(amount); fn(); c.restore(); }

// Static backgrounds are rasterized once; the foreground remains deterministic per frame.
function background(dark) {
  const b=createCanvas(W,H);
  const ctx=b.getContext('2d'); ctx.fillStyle=dark?'#080b14':'#f5f6f8'; ctx.fillRect(0,0,W,H);
  if(!dark){const g=ctx.createLinearGradient(0,0,W,H);g.addColorStop(0,'#ffffff');g.addColorStop(.55,'#f6f7fc');g.addColorStop(1,'#eaf0fb');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);return b;}
  for(const [x,y,r,col] of [[420,800,900,'#1b215c'],[1550,300,700,'#132949']]) {
    const g=ctx.createRadialGradient(x,y,0,x,y,r); g.addColorStop(0,col);g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  }
  return b;
}
const lightBG=background(false), darkBG=background(true);

function logo(x,y,size,t=0) {
  c.save(); c.translate(x,y); c.rotate(Math.sin(t*.5)*.035);
  c.shadowColor='#5070bc44'; c.shadowBlur=size*.19; c.shadowOffsetY=size*.07;
  const g=c.createLinearGradient(-size/2,-size/2,size/2,size/2);
  g.addColorStop(0,'#fff');g.addColorStop(.5,'#f6f8ff');g.addColorStop(1,'#d7e1f8');
  box(-size/2,-size/2,size,size,size*.24,g,'#ffffff'); c.shadowBlur=0;c.shadowOffsetY=0;
  const inner=c.createLinearGradient(-size*.3,-size*.4,size*.3,size*.4);
  inner.addColorStop(0,'#397df6');inner.addColorStop(.5,'#7256eb');inner.addColorStop(1,'#c661c5');
  box(-size*.34,-size*.34,size*.68,size*.68,size*.18,inner);
  play(size*.025,0,size*.34); box(size*.23,-size*.095,size*.042,size*.19,size*.02,'#ffffff66');
  c.restore();
}

function cursor(x,y,click=0) {
  if(click>0) { c.save();c.globalAlpha*=1-click;c.strokeStyle=BLUE;c.lineWidth=4;c.beginPath();c.arc(x,y,12+click*45,0,Math.PI*2);c.stroke();c.restore(); }
  c.save();c.translate(x,y);c.shadowColor='#0004';c.shadowBlur=9;c.shadowOffsetY=3;
  c.beginPath();c.moveTo(0,0);c.lineTo(0,32);c.lineTo(9,25);c.lineTo(16,40);c.lineTo(23,37);c.lineTo(15,22);c.lineTo(27,21);c.closePath();c.fillStyle='#10121a';c.fill();c.strokeStyle='#fff';c.lineWidth=2;c.stroke();c.restore();
}

// Synthetic moving scenery makes pause/resume visible without third-party video rights.
function scenery(x,y,w,h,t) {
  c.save();c.beginPath();c.rect(x,y,w,h);c.clip();c.translate(x,y);
  const g=c.createLinearGradient(0,0,w,h);g.addColorStop(0,'#251146');g.addColorStop(.47,'#4962a5');g.addColorStop(.72,'#e19ea1');g.addColorStop(1,'#253654');c.fillStyle=g;c.fillRect(0,0,w,h);
  const sunY=h*.28+Math.sin(t*.26)*h*.03, sunX=w*.52+Math.cos(t*.25)*w*.12;
  const sun=c.createRadialGradient(sunX,sunY,0,sunX,sunY,w*.32);sun.addColorStop(0,'#ffe7bfe8');sun.addColorStop(.42,'#ffc7b750');sun.addColorStop(1,'transparent');c.fillStyle=sun;c.fillRect(0,0,w,h);
  circle(sunX,sunY,w*.096,'#ffe0c0');
  for(let layer=0;layer<5;layer++) {
    c.beginPath();c.moveTo(-20,h);
    for(let px=-20;px<=w+20;px+=8) {
      const yy=h*(.45+layer*.094)+Math.sin(px/w*5+layer*.8+t*(.3+layer*.065))*h*.09+Math.sin(px/w*11+layer*.9)*h*.025;
      c.lineTo(px,yy);
    }
    c.lineTo(w+20,h);c.closePath();c.fillStyle=['#8780b6','#655e97','#414568','#293954','#152c40'][layer];c.fill();
  }
  for(let k=0;k<16;k++){const yy=h*.8+k*k*.6;line(0,yy,w,yy,'#91bfcd13',1);}
  for(let k=0;k<12;k++){const px=(k*83+t*(8+k%3*3))%(w+40)-20;circle(px,h*.18+(k*57)%Math.round(h*.48),1.2,'#fff7');}
  label('MOMENTS',32,h-100,18,'#ffffffa0',500);label('山河之间，慢一点。',32,h-65,25,'#fff',500);
  c.restore();
}

function app(t,scale=1,x=204,y=251) {
  c.save();c.translate(x,y);c.scale(scale,scale);
  c.shadowColor='#25305d25';c.shadowBlur=65;c.shadowOffsetY=30;box(0,0,1440,650,22,'#fff');c.shadowBlur=0;c.shadowOffsetY=0;
  c.save();c.beginPath();c.roundRect(0,0,1440,650,22);c.clip();
  box(0,0,1440,58,0,'#fbfcfd');line(0,58,1440,58,'#e7e9ed');
  [0,1,2].forEach((v)=>circle(28+v*19,29,5,['#f18988','#edc574','#8fceb0'][v]));
  label('DeepSeek Harness',105,30,22,INK,600);label('示例项目 / 开发任务',415,30,19,GRAY);
  pill('抖音 · 自动',1180,9,155);
  box(0,59,192,591,0,'#f6f7f9');label('工作区',24,104,20,GRAY);box(12,134,168,46,12,'#e8edfb');label('示例项目',27,158,20,BLUE,600);
  label('当前对话',25,230,20,GRAY);label('优化设置页面',25,275,19,INK,500);label('代码检查',25,320,18,'#9397a2');
  line(192,58,192,650,'#e7e9ed');
  const state=t<18?'running':t<24?'approval':t<31?'resumed':'done';
  const full=out((t-9.2)/1.2), right=900+540*(1-full);
  label('优化设置页面',230,106,29,INK,600);label('整理布局，并验证设置保存流程。',230,152,21,GRAY);
  box(230,198,610,62,15,'#f5f6f8');label('正在处理你的任务',254,229,22,INK,500);
  let done=state==='done';
  ['分析页面结构','调整界面布局','运行验证'].forEach((s,i)=>{
    const yy=303+i*55;
    if(done||i===0||(state==='resumed'&&i===1))check(247,yy,18);else {circle(247,yy,9,'#e6ecff');circle(247,yy,3+Math.sin(t*4+i)*1.5,BLUE);}
    label(s,272,yy,22,INK,500);label(done?'已完成':i===0?'已完成':i===1?'进行中':'待执行',752,yy,18,done?'#20a271':GRAY,400,'right');
  });
  if(state==='approval') {
    const e=out((t-18)/.45);fade(e,()=>{
      box(225,440+22*(1-e),632,142,17,'#fff9eb','#edc979');circle(251,470,8,'#d39325');label('需要你审核',272,471,23,'#875e16',600);
      label('允许执行本次验证命令？',251,514,20,INK);
      box(652,520,178,42,12,BLUE);label('批准并继续',741,541,19,'#fff',500,'center');
    });
    const p=ease((t-22.2)/1.1); if(t>21.8)cursor(lerp(590,758,p),lerp(597,544,p),clamp((t-23.5)/.48));
  } else if(done) {
    box(230,455,610,110,17,'#edf9f3');check(261,491,22);label('任务完成',290,490,26,'#16855a',600);label('更改已完成，验证通过。',254,535,20,'#5b7e6a');
  } else {
    box(230,455,610,118,15,'#111825');label('›  npm run verify',254,485,20,'#9cbbff',400);
    const chars=Math.floor((t*12)%36);label((state==='resumed'?'验证设置保存流程…':'正在更新设置页面…').slice(0,Math.min(20,chars+4)),254,527,20,'#b4c4d4');
    box(254,553,120+80*Math.sin(t),3,2,'#547eff');
  }
  box(230,600,610,42,14,'#fafbfc','#e6e8ee');label('向 Agent 发送消息…',250,621,18,'#a3a7af');
  c.save();c.beginPath();c.rect(right,58,540,592);c.clip();c.translate(right,0);
  box(0,58,540,592,0,'#fff');line(0,58,0,650,'#dfe3ed');label('抖音伴随',24,86,23,INK,600);label('×',509,86,22,GRAY);
  box(0,114,540,43,0,'#f5f7fb');
  const playing=state==='running'||state==='resumed';circle(21,135,4,playing?'#2cab84':'#d4a349');label(playing?'Agent 工作中':'视频已暂停',35,135,18,playing?'#23896b':'#927338',500);
  box(340,126,29,17,9,'#4476ed');circle(361,134.5,6,'#fff');label('自动联动',378,135,17,GRAY);label('刷新',481,135,17,GRAY);
  const mediaTime=Math.max(0,Math.min(t-10.2,7.8))+(t>=24?Math.min(t-24,7):0);
  scenery(12,168,516,470,mediaTime);
  pill('抖音  ·  精选',30,185,147,'#ffffff22','#fff');
  box(30,609,475,3,2,'#ffffff33');box(30,609,25+mediaTime*14,3,2,'#fff');
  if(!playing) {
    box(12,168,516,470,0,'#101626a6');
    circle(270,329,48,'#ffffff18');pause(270,329,35);
    label(state==='approval'?'需要你审核或回答':'等待 Agent 运行',270,413,28,'#fff',600,'center');
    label(state==='approval'?'请在对话区处理':'任务已完成，视频已暂停',270,456,20,'#ced5e1',400,'center');
    if(state==='approval')label('Agent 继续后自动续播',270,489,18,'#b0bed2',400,'center');
  } else if(t>24&&t<26)fade(1-ease((t-25)/1),()=>{circle(270,359,48,'#ffffff28');play(275,359,37);});
  c.restore();c.restore();
  box(0,0,1440,650,22,null,'#d9deea');c.restore();
}

const captions=[
  [0.7,4,'Agent 在忙，你也可以轻松一点。'],
  [4.7,8,'DSH 抖音伴随，让等待有点意思。'],
  [9.3,17,'Agent 开始工作，抖音侧栏自动打开并播放。'],
  [18,23.8,'需要你审核时，视频暂停，提醒同步出现。'],
  [24.5,30.8,'审核完成，Agent 继续，视频自动续播。'],
  [31.5,35.8,'任务结束，视频也暂停。'],
  [36.5,40,'跟随当前会话，也关注它的子 Agent。'],
  [41,45,'现已开源，欢迎体验 DSH 抖音伴随。'],
];
function subtitle(t,dark=false) {
  const item=captions.find(([a,b])=>t>=a&&t<b);if(!item)return;
  const opacity=Math.min(out((t-item[0])/.35),out((item[1]-t)/.25));
  fade(opacity,()=>{label(item[2],960,1014,29,dark?'#dfe5f0':'#545d6e',400,'center');});
}
function header(kicker,title,t,start,color=INK) {
  const e=out((t-start)/.8);fade(e,()=>{label(kicker,960,92,21,color===INK?GRAY:'#8693b4',500,'center');label(title,960,166+25*(1-e),65,color,600,'center');});
}

function frame(t) {
  c.resetTransform();c.globalAlpha=1;c.clearRect(0,0,W,H);
  if(t<4) {
    c.drawImage(darkBG,0,0);const a=out(t/1.1);
    fade(a,()=>{label('AGENT IS WORKING',960,288,23,'#8998bc',500,'center');label('让 Agent 忙。',960,438+40*(1-a),98,'#f4f6ff',600,'center');});
    fade(out((t-1.2)/1),()=>label('让等待，轻松一点。',960,586+30*(1-out((t-1.2)/1)),88,'#a4b9ff',600,'center'));
    for(let i=0;i<5;i++)circle(904+i*28,745,4+2*Math.sin(t*4-i),i<3?'#7d98ff':'#424963');subtitle(t,true);
  } else if(t<8) {
    c.drawImage(lightBG,0,0);let e=out((t-4)/1.25);
    c.save();c.translate(960,407);c.scale(.6+.4*e,.6+.4*e);logo(0,0,230,t);c.restore();
    fade(out((t-4.5)/1),()=>{label('DSH 抖音伴随',960,640+30*(1-e),77,INK,600,'center');label('你的 Agent 工作伴侣',960,738,31,GRAY,400,'center');});
    subtitle(t);
  } else if(t<17) {
    c.drawImage(lightBG,0,0);header('01  /  自动开始','工作开始，好戏开场。',t,8);
    const e=out((t-8)/1.1), zoom=1.02+.05*ease((t-11)/5);fade(e,()=>app(t,zoom,960-720*zoom,252+80*(1-e)-15*ease((t-11)/5)));
    label('功能与播放内容均为代码演示',960,952,17,'#979ca7',400,'center');subtitle(t);
  } else if(t<24) {
    c.drawImage(darkBG,0,0);header('02  /  审核暂停','关键时刻，注意力归位。',t,17,'#f4f6ff');
    const zoom=1.07-.025*ease((t-21)/2);app(t,zoom,960-720*zoom,237+15*ease((t-21)/2));
    label('功能与播放内容均为代码演示',960,952,17,'#7c89a3',400,'center');subtitle(t,true);
  } else if(t<31) {
    c.drawImage(lightBG,0,0);header('03  /  自动续播','你点继续，它接着播。',t,24);
    const zoom=1.045+.025*ease((t-25)/4);app(t,zoom,960-720*zoom,252-15*ease((t-25)/4));
    label('功能与播放内容均为代码演示',960,952,17,'#979ca7',400,'center');subtitle(t);
  } else if(t<36) {
    c.drawImage(lightBG,0,0);header('04  /  结束暂停','任务收工，播放暂停。',t,31);
    const e=out((t-31)/1.15);app(t,lerp(1.07,.88,e),lerp(189.6,120,e),lerp(237,295,e));
    fade(e,()=>{circle(1620,513,68,'#dff4e8');check(1620,513,55);label('已完成',1620,640,40,'#20865f',600,'center');label('视频已暂停',1620,698,25,GRAY,400,'center');});
    label('功能与播放内容均为代码演示',960,952,17,'#979ca7',400,'center');subtitle(t);
  } else if(t<40.5) {
    c.drawImage(darkBG,0,0);header('DESIGNED FOR YOUR FLOW','刚刚好，跟上你的节奏。',t,36,'#f4f6ff');
    const cards=[['原生侧栏','工作与视频，同屏相伴'],['会话联动','关注当前会话与子 Agent'],['共享登录','新建对话，复用登录态']];
    cards.forEach(([title,desc],i)=>{const e=out((t-36.3-i*.25)/1);fade(e,()=>{const x=170+i*535,y=345+(1-e)*90;box(x,y,510,432,32,'#161d30','#2b354e');
      if(i===0){box(x+160,y+63,190,128,15,'#253248','#485976');box(x+269,y+71,70,112,9,'#668aff');line(x+178,y+101,x+245,y+101,'#7c91ac',5);line(x+178,y+124,x+230,y+124,'#7c91ac',5);}
      if(i===1){line(x+255,y+107,x+185,y+170,'#879add',3);line(x+255,y+107,x+325,y+170,'#879add',3);circle(x+255,y+105,26,'#6284f6');circle(x+185,y+171,19,'#a38bf4');circle(x+325,y+171,19,'#90acec');}
      if(i===2){for(let q=0;q<2;q++)box(x+151+q*72,y+70+q*30,140,100,16,q?'#7595ee':'#333f63','#a5bfff55');check(x+280,y+149,36,'#fff');}
      label(title,x+255,y+260,39,'#f5f6ff',600,'center');label(desc,x+255,y+325,24,'#a8b3ce',400,'center');
      if(i===2)label('同一次 DSH 运行期间',x+255,y+368,18,'#7786a5',400,'center');
    });});subtitle(t,true);
  } else {
    c.drawImage(lightBG,0,0);const e=out((t-40.5)/1);fade(e,()=>{
      logo(960,280,162,t);label('DSH 抖音伴随',960,465,75,INK,600,'center');
      label('让等待，有点意思。',960,564,45,'#67758e',500,'center');
      pill('MIT 开源',786,641,164,'#e5eaff','#5269af');pill('v0.2.3',970,641,164,'#e5eaff','#5269af');
      label('GitHub   leelox / dsh-douyin-companion',960,767,27,'#4f5b74',500,'center');
      label('Gitee   sensenlee / dsh-douyin-companion',960,816,27,'#4f5b74',500,'center');
      label('基于 zhangCzhe / dsh-slackoff · MIT',960,912,18,'#9299a8',400,'center');
    });subtitle(t);
  }
  // Soft, short cuts preserve time to read Chinese text.
  const cuts=[4,8,17,24,31,36,40.5];
  for(const cut of cuts){const d=Math.abs(t-cut);if(d<.14){c.fillStyle=`rgba(255,255,255,${(1-d/.14)*.16})`;c.fillRect(0,0,W,H);}}
  c.fillStyle='#7687af14';c.fillRect(0,1077,W,3);c.fillStyle='#718aed';c.fillRect(0,1077,W*t/DURATION,3);
}

function soundtrack() {
  const rate=48000, frames=rate*DURATION, bytes=Buffer.alloc(44+frames*4);
  bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(2,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*4,28);bytes.writeUInt16LE(4,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(frames*4,40);
  const chords=[[146.83,220,293.66,369.99],[130.81,196,261.63,329.63],[164.81,246.94,329.63,392],[110,164.81,220,277.18]];
  const beat=.5;
  for(let i=0;i<frames;i++) {
    const t=i/rate, ch=chords[Math.floor(t/4)%4], bt=t%beat;
    const note=ch[Math.floor(t/beat)%4]*2, strike=Math.exp(-bt*10)*(1-Math.exp(-bt*160));
    const pad=ch.reduce((n,f,j)=>n+Math.sin(2*Math.PI*f*t+Math.sin(t*.2+j)*.08),0)*.012;
    const bell=(Math.sin(2*Math.PI*note*t)+.22*Math.sin(2*Math.PI*note*2*t))*strike*.055;
    const kick=Math.sin(2*Math.PI*(54*bt+7*(1-Math.exp(-bt*35))))*Math.exp(-bt*17)*.037;
    const duck=t>=18&&t<24?.48:1, envelope=clamp(t/1.4)*clamp((DURATION-t)/1.5);
    const v=(pad+bell+kick)*envelope*duck;
    bytes.writeInt16LE(Math.round(Math.max(-1,Math.min(1,v))*32767),44+i*4);
    bytes.writeInt16LE(Math.round(Math.max(-1,Math.min(1,v*.94+pad*.06))*32767),46+i*4);
  }
  fs.writeFileSync(path.join(OUT,'soundtrack.wav'),bytes);
}

async function main() {
  fs.mkdirSync(OUT,{recursive:true});
  for(const t of [2.7,6.5,13,21,27,33,38.8,43]){frame(t);fs.writeFileSync(path.join(OUT,`frame-${t}.png`),canvas.toBuffer('image/png'));}
  frame(13);fs.writeFileSync(path.join(OUT,'poster.png'),canvas.toBuffer('image/png'));
  if(process.argv.includes('--preview'))return;
  soundtrack();
  const ff=spawn(FFMPEG,['-hide_banner','-loglevel','warning','-y','-f','rawvideo','-pix_fmt','rgba','-s',`${W}x${H}`,'-r',String(FPS),'-i','pipe:0','-i',path.join(OUT,'soundtrack.wav'),'-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','-t',String(DURATION),path.join(OUT,'dsh-douyin-companion-16x9.mp4')],{stdio:['pipe','inherit','inherit'],windowsHide:true});
  const finished=once(ff,'exit');
  ff.stdin.on('error',error=>{console.error(error);process.exitCode=1;});
  for(let i=0;i<DURATION*FPS;i++){frame(i/FPS);if(!ff.stdin.write(canvas.data()))await once(ff.stdin,'drain');if(i%(FPS*5)===0)console.log(`Rendered ${i/FPS}/${DURATION}s`);}
  ff.stdin.end();const [code]=await finished;if(code!==0)throw new Error(`FFmpeg exited ${code}`);
  console.log(`Saved ${OUT}`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
