// Run with Playwright CLI from the repository root. Native audio; isolated synthetic microphone.
async (page) => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));

  page.on('request', request => { if (request.method() === 'POST') requests.push({url:request.url(), body:request.postData() ?? ''}); });
  await page.addInitScript(() => {
    window.__markerDialogs = []; window.__acceptMarkerConfirm = false;
    window.confirm = message => { window.__markerDialogs.push(message); return window.__acceptMarkerConfirm; };
    const test = window.__liveTest = { pcs: [], contexts: [], streams: [], micCalls: 0, mode: 'ok', gain: null };
    const NativeContext = AudioContext;
    window.AudioContext = new Proxy(NativeContext, { construct(target, args) {
      if (test.mode === 'context-failure') throw new Error('private initialization diagnostic');
      const context = Reflect.construct(target, args); test.contexts.push(context); return context;
    } });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      test.micCalls++;
      const context = new NativeContext(); test.sourceContext = context; await context.resume();
      const oscillator = context.createOscillator(), gain = context.createGain(), destination = context.createMediaStreamDestination();
      test.gain = gain; gain.gain.value = 0.1;
      oscillator.connect(gain); gain.connect(destination); oscillator.start();
      test.streams.push(destination.stream); return destination.stream;
    } });
    class FakePeer {
      connectionState = 'new';
      constructor() { test.pcs.push(this); }
      addTrack(track) {
        this.clone = track;
        return this.sender = { track, replaceTrack: async value => { this.sender.track = value; } };
      }
      createDataChannel(label) {
        if (label !== 'oai-events') throw new Error('Unexpected channel');
        return this.channel = { readyState: 'connecting', sent: [], send(data) { this.sent.push(JSON.parse(data)); }, close() { this.readyState = 'closed'; } };
      }
      async createOffer() { return { type: 'offer', sdp: 'fixture-sdp-offer' }; }
      async setLocalDescription() {}
      async setRemoteDescription() {
        if (test.mode === 'connect-hang') return;
        this.connectionState = 'connected'; this.channel.readyState = 'open'; this.channel.onopen?.();
      }
      close() { this.connectionState = 'closed'; }
    }
    window.RTCPeerConnection = FakePeer;
    test.emit = event => test.pcs.at(-1).channel.onmessage?.({ data: JSON.stringify(event) });
    test.drop = () => { const pc = test.pcs.at(-1); pc.connectionState = 'disconnected'; pc.onconnectionstatechange?.(); };
  });

  const key = 'lectureai:current-markers:v1';
  const headers = { 'access-control-allow-origin':'http://localhost:3000', 'access-control-allow-methods':'POST, OPTIONS', 'access-control-allow-headers':'authorization, content-type' };
  await page.route('**/api/realtime/session', route => route.fulfill({headers,json:{value:'ek_marker_fixture',expires_at:Date.now()/1000+60}}));
  await page.route('https://api.openai.com/v1/realtime/calls', route => route.fulfill({headers,body:'fixture-answer'}));
  const notesBodies = [];
  await page.route('**/api/notes', route => {
    if(route.request().method()==='OPTIONS') return route.fulfill({headers,status:204});
    notesBodies.push(route.request().postDataJSON());
    return route.fulfill({headers,json:{notes:'# Lecture Summary\nPaging maps memory.\n\n# Personal Review Priorities\nReview your marked moments.'}});
  });
  await page.route('**/api/transcribe', route => route.fulfill({headers,json:{transcript:route.request().postDataBuffer().toString('latin1').includes('lecture-recording-')?'Final recorded lecture about paging.':'Uploaded lecture about processes.'}}));
  const stored = () => page.evaluate(key => JSON.parse(sessionStorage.getItem(key)), key);
  const start = page.getByRole('button',{name:'Start Recording',exact:true});
  const stop = page.getByRole('button',{name:'Stop',exact:true});
  const important = page.getByRole('button',{name:'Important',exact:true});
  const markers = page.locator('.marker-item');
  const live = () => page.waitForFunction(()=>document.querySelector('.live-status')?.textContent==='Live');
  await page.goto('http://localhost:3000');
  await page.getByRole('button',{name:'Record Lecture',exact:true}).click();
  assert(await stored()===null,'No marker storage before a lecture');
  await start.click(); await live();
  await page.waitForTimeout(1100);
  await important.dblclick();
  assert((await stored()).markers.length===1,'Double-click creates one quick marker');
  assert((await stored()).markers[0].timestampSeconds>=1,'Marker uses elapsed recording time');
  await page.keyboard.press('Alt+2');
  await page.getByRole('button',{name:'Review Later',exact:true}).click();
  await page.getByRole('button',{name:'Add Note',exact:true}).click();
  const capturedLabel=await page.locator('.marker-editor label').innerText();
  const note=page.getByRole('textbox',{name:/Add note/});
  await note.fill('Personal only marker: compare paging with segmentation.');
  await page.keyboard.press('Alt+1');
  assert((await stored()).markers.length===3,'Shortcut ignored while typing a note');
  await page.waitForTimeout(1200);
  await page.getByRole('button',{name:'Save',exact:true}).click();
  const typed=(await stored()).markers.find(m=>m.type==='note');
  const timestamp=seconds=>{const parts=[Math.floor(seconds/60)%60,Math.floor(seconds)%60];if(seconds>=3600)parts.unshift(Math.floor(seconds/3600));return parts.map(n=>String(n).padStart(2,'0')).join(':');};
  assert(capturedLabel.includes(timestamp(typed.timestampSeconds)),'Note time remains anchored to opening editor');
  assert((await stored()).markers.length===4,'All four marker types saved');
  await page.evaluate(()=>{const field=document.createElement('div');field.contentEditable='true';field.id='test-editable';document.body.append(field);field.focus();});
  await page.keyboard.press('Alt+1');
  assert((await stored()).markers.length===4,'Shortcut ignored in contenteditable');
  await page.evaluate(()=>document.getElementById('test-editable').remove());
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  const pausedTime=await page.getByRole('timer').innerText();
  await page.waitForTimeout(2200);
  assert(await page.getByRole('timer').innerText()===pausedTime,'Paused wall time does not advance recording time');
  assert(await important.isDisabled(),'Quick markers disabled while paused');
  await page.keyboard.press('Alt+3');
  assert((await stored()).markers.length===4,'Paused shortcut cannot add markers');
  await page.getByRole('button',{name:'Resume',exact:true}).click(); await live();
  await page.waitForTimeout(5500);
  await important.click();
  assert((await stored()).markers.length===5,'Intentional later marker is retained');
  const postPause=(await stored()).markers.at(-1).timestampSeconds;
  const shown=await page.getByRole('timer').innerText();
  const shownSeconds=shown.split(':').reduce((a,x)=>a*60+Number(x),0);
  assert(Math.abs(postPause-shownSeconds)<1.5,'Timestamp follows pause-aware recording clock');
  await page.evaluate(()=>window.__liveTest.emit({type:'conversation.item.input_audio_transcription.completed',item_id:'phase4',transcript:'Live transcription continues while marking.'}));
  await page.getByText('Live transcription continues while marking.',{exact:true}).waitFor();
  assert(await page.locator('.recording-status').innerText()==='Recording','Markers never stop recording');
  // Saving an open note after Stop must preserve its original time.
  await page.getByRole('button',{name:'Add Note',exact:true}).click();
  await page.getByRole('textbox',{name:/Add note/}).fill('Note opened before stopping.');
  await page.waitForTimeout(1500);
  await stop.click();
  await page.getByRole('button',{name:'Finalize Transcript',exact:true}).waitFor();
  await page.getByRole('button',{name:'Save',exact:true}).click();
  assert((await stored()).markers.length===6,'Open note can be saved after Stop');
  assert(await page.getByRole('group',{name:'Lecture marker timeline'}).count()===1,'Timeline shown after Stop');
  const firstId=(await stored()).markers[0].id, firstTime=(await stored()).markers[0].timestampSeconds;
  await markers.first().getByRole('button',{name:/Edit/}).click();
  await page.getByRole('textbox',{name:/Edit marker note/}).fill('Personal only marker: professor may test this, verify in transcript.');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  assert((await stored()).markers.find(m=>m.id===firstId).timestampSeconds===firstTime,'Editing preserves timestamp');
  await markers.filter({hasText:'Review Later'}).getByRole('button',{name:/Delete/}).click();
  assert((await stored()).markers.length===5,'Delete updates markers and storage');
  const saved=await stored();
  assert(Object.keys(saved).sort().join(',')==='lectureId,markers,version','Storage contains only marker session data');
  assert(requests.every(r=>!r.body.includes('Personal only marker')),'No marker text leaves browser before Generate Notes');
  // Real encoded WebM preview; seek with lead-in and playback.
  await page.locator('audio').evaluate(async audio=>{audio.muted=true;await audio.play();audio.pause();});
  const last=saved.markers.reduce((a,b)=>a.timestampSeconds>b.timestampSeconds?a:b);
  const label={important:'Important',confusing:'Confusing',review:'Review Later',note:'Note'};
  await page.getByRole('button',{name:`Play ${label[last.type]} marker at ${timestamp(last.timestampSeconds)}`,exact:true}).click();
  await page.waitForTimeout(200);
  const actualTime=await page.locator('audio').evaluate(audio=>{audio.pause();return audio.currentTime;});
  assert(Math.abs(actualTime-Math.max(0,last.timestampSeconds-5))<1,'Native preview seeks with five-second lead-in');
  await markers.first().getByRole('button',{name:/Play/}).click();
  await page.locator('audio').evaluate(audio=>audio.pause());
  assert(await page.locator('audio').evaluate(audio=>audio.currentTime)<1,'Near-start marker does not seek negative');
  // A playback rejection must not undo the seek or expose an error.
  await page.locator('audio').evaluate(audio=>{audio.play=()=>Promise.reject(new DOMException('blocked','NotAllowedError'));});
  await page.getByRole('button',{name:`Play ${label[last.type]} marker at ${timestamp(last.timestampSeconds)}`,exact:true}).click();
  assert(Math.abs(await page.locator('audio').evaluate(audio=>audio.currentTime)-Math.max(0,last.timestampSeconds-5))<1,'Seek survives autoplay rejection');
  // Metadata takes precedence over timer; out-of-range positions and seeks clamp.
  await page.locator('audio').evaluate(audio=>{Object.defineProperty(audio,'duration',{configurable:true,value:2});audio.dispatchEvent(new Event('durationchange'));});
  await page.waitForFunction(()=>document.querySelector('.timeline-times').textContent==='00:0000:02');
  await page.getByRole('button',{name:`Play ${label[last.type]} marker at ${timestamp(last.timestampSeconds)}`,exact:true}).click();
  assert(await page.locator('audio').evaluate(audio=>audio.currentTime)<=2,'Seek clamps to encoded duration');
  await page.locator('audio').evaluate(audio=>{delete audio.duration;delete audio.play;audio.dispatchEvent(new Event('durationchange'));});
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Marker UI fits mobile');
  await page.locator('.marker-list').evaluate(list=>{list.scrollTop=0;});
  await page.locator('.lecture-markers').scrollIntoViewIfNeeded();
  await page.screenshot({path:'output/playwright/phase4/markers-mobile.png'});
  await page.getByRole('button',{name:'Finalize Transcript',exact:true}).click();
  await page.getByRole('heading',{name:'Final Transcript',exact:true}).waitFor();
  assert(JSON.stringify(await stored())===JSON.stringify(saved),'Finalization preserves markers');
  await page.getByRole('button',{name:'Generate Notes',exact:true}).click();
  await page.getByRole('heading',{name:'Lecture Notes',exact:true}).waitFor();
  assert(notesBodies[0].markers.length===5 && notesBodies[0].transcript==='Final recorded lecture about paging.','Notes include this recording’s markers');
  assert(notesBodies[0].markers.every(m=>!('id' in m)&&!('createdAt' in m)),'Only required marker metadata is transmitted');
  await page.getByRole('checkbox',{name:/Include 5 lecture markers/}).uncheck();
  await page.getByRole('button',{name:'Regenerate Notes',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.results [aria-busy="true"]'));
  await page.getByRole('button',{name:'Regenerate Notes',exact:true}).waitFor();
  assert(!('markers' in notesBodies[1]),'User can omit markers');
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);
  await page.getByRole('button',{name:'Copy Transcript',exact:true}).click();
  assert(await page.evaluate(()=>navigator.clipboard.readText())==='Final recorded lecture about paging.','Copy transcript unchanged');
  await page.getByRole('button',{name:'Copy Notes',exact:true}).click();
  assert((await page.evaluate(()=>navigator.clipboard.readText())).includes('Personal Review Priorities'),'Copy notes unchanged');
  assert((await stored()).markers.length===5,'Notes/copy preserve markers');
  await page.getByRole('button',{name:'Upload Audio',exact:true}).click();
  await page.getByRole('button',{name:'Choose a lecture recording',exact:true}).setInputFiles('output/playwright/lecture-test.wav');
  await page.getByRole('button',{name:'Transcribe Lecture',exact:true}).click();
  await page.getByRole('region',{name:'Full lecture transcript'}).filter({hasText:'Uploaded lecture about processes.'}).waitFor();
  assert(await page.getByRole('checkbox',{name:/Include .* lecture markers/}).count()===0,'Upload is not associated with recorded markers');
  await page.getByRole('button',{name:'Generate Notes',exact:true}).click();
  await page.getByRole('heading',{name:'Lecture Notes',exact:true}).waitFor();
  assert(!('markers' in notesBodies[2]),'Recorded markers never sent with unrelated uploaded transcript');
  await page.getByRole('button',{name:'Record Lecture',exact:true}).click();
  await page.getByRole('button',{name:'Record Again',exact:true}).click();
  assert((await page.evaluate(()=>window.__markerDialogs.at(-1))).includes('5 lecture markers'),'Record Again warns about existing markers');
  assert((await stored()).markers.length===5 && await page.locator('audio').count()===1,'Cancel preserves audio and markers');
  await page.evaluate(()=>{window.__acceptMarkerConfirm=true;});
  await page.getByRole('button',{name:'Record Again',exact:true}).click();
  assert(await stored()===null,'Confirmed new lecture removes recovery data');
  await start.click();await live();
  await important.click();
  assert((await stored()).lectureId!==saved.lectureId && (await stored()).markers.length===1,'New recording gets a fresh marker session');
  assert((await stored()).markers[0].timestampSeconds<2,'Old timestamps do not carry over');
  await stop.click();
  await page.getByRole('button',{name:'Finalize Transcript',exact:true}).waitFor();
  const recovery=await stored();
  await page.reload();
  await page.getByRole('button',{name:'View recovered markers',exact:true}).click();
  await page.getByText(/Recovered markers from a previous lecture/).waitFor();
  assert((await stored()).lectureId===recovery.lectureId,'Refresh restores marker association safely');
  assert(await page.locator('audio').count()===0 && await page.getByRole('button',{name:/Play Important marker/}).count()===0,'Recovered markers cannot seek missing audio');
  await page.evaluate(()=>{window.__acceptMarkerConfirm=false;});await start.click();
  assert(await page.getByRole('button',{name:'Start Recording',exact:true}).isVisible(),'Cancel replacement keeps recovery markers');
  await page.evaluate(()=>{window.__acceptMarkerConfirm=true;});
  await page.getByRole('button',{name:'Discard Markers',exact:true}).click();
  assert(await stored()===null,'Explicit discard clears recovery data');
  await page.evaluate(()=>sessionStorage.setItem('lectureai:current-markers:v1','{bad json'));
  await page.reload();
  await page.waitForFunction(()=>sessionStorage.getItem('lectureai:current-markers:v1')===null);
  assert(await stored()===null,'Malformed recovery data is removed safely');
  await page.getByRole('button',{name:'Record Lecture',exact:true}).click();
  await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError');};});
  await start.click();await live();await important.click();
  await page.getByText(/could not save recovery data/).waitFor();
  assert(await markers.count()===1,'Storage failure leaves in-memory markers usable');
  await stop.click();
  await page.waitForFunction(()=>window.__liveTest.pcs.every(pc=>pc.connectionState==='closed')&&window.__liveTest.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
  assert(errors.length===0,`Unexpected page errors: ${errors.join('; ')}`);
  return 'PASS: marker types/timestamps/dedup; shortcuts and typing; pause/resume; note capture/edit/delete; native seeking and lead-in/clamps; recovery/corruption/quota; cancel/confirm/new sessions; marker privacy and notes association; upload/copy regression; mobile and resource cleanup.';
}
