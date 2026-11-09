import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const origin = process.env.CP45_TEST_ORIGIN ?? "http://127.0.0.1:5173";
const profile = await mkdtemp(join(tmpdir(), "lumon-cp45-chrome-"));
const chrome = spawn(
  process.env.CHROME_BIN ?? "google-chrome",
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--no-first-run",
    "--disable-dev-shm-usage",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
  ],
  { stdio: "ignore" },
);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket;
try {
  let version;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const [port] = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n');
      version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      break;
    } catch {
      await delay(100);
    }
  }
  if (!version) throw new Error("Chrome DevTools did not start");
  socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  const browserErrors = [];
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown")
      browserErrors.push(message.params.exceptionDetails);
    if (message.id) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
      else entry.resolve(message.result);
    }
  };
  function send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const number = ++id;
      const timer = setTimeout(() => {pending.delete(number);reject(new Error(`CDP timed out: ${method}`));},20000);
      pending.set(number, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      socket.send(JSON.stringify({ id: number, method, params, sessionId }));
    });
  }
  async function page(query = "") {
    const target = await send("Target.createTarget", {
      url: `${origin}/tests/browser.html${query}`,
    });
    const { sessionId } = await send("Target.attachToTarget", {
      targetId: target.targetId,
      flatten: true,
    });
    await send("Runtime.enable", {}, sessionId);
    return sessionId;
  }
  async function evaluate(session, expression) {
    const result = await send(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true },
      session,
    );
    if (result.exceptionDetails)
      throw new Error(
        result.exceptionDetails.exception?.description ??
          JSON.stringify(result.exceptionDetails),
      );
    return result.result.value;
  }
  async function wait(session, expression) {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(session, `Boolean(${expression})`)) return;
      await delay(70);
    }
    throw new Error(`Timeout: ${expression}`);
  }
  const a = await page();
  await wait(a, "document.querySelector('article')");
  assert.equal(
    await evaluate(a, "document.querySelector('article img') === null"),
    true,
  );
  assert.equal(
    await evaluate(
      a,
      "document.querySelector('article').textContent.includes('<img src=x')",
    ),
    true,
  );
  await evaluate(
    a,
    `{const input=document.querySelector('input[type=search]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Irving');input.dispatchEvent(new Event('input',{bubbles:true}))}`,
  );
  await wait(
    a,
    "window.testHarness.calls.some(call=>call.path.includes('q=Irving'))",
  );
  await evaluate(
    a,
    `{const select=document.querySelector('select');select.value='3';select.dispatchEvent(new Event('change',{bubbles:true}))}`,
  );
  await wait(
    a,
    "window.testHarness.calls.some(call=>call.path.includes('departmentId=3'))",
  );
  await evaluate(
    a,
    "Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Siguiente').click()",
  );
  await wait(
    a,
    "window.testHarness.calls.some(call=>call.path.includes('page=1'))",
  );
  console.log(
    "PASS directory: safe text, debounced search, department filter and server pagination",
  );
  await evaluate(a, "document.querySelector('article a').click()");
  await wait(a, "document.querySelector('a[href$=\"/edit\"]')");
  assert.equal(
    await evaluate(
      a,
      "document.querySelector('a[href^=\"javascript:\"]') === null",
    ),
    true,
  );
  await evaluate(a, "document.querySelector('a[href$=\"/edit\"]').click()");
  await wait(a, "document.querySelector('form input')");
  await evaluate(
    a,
    `{const input=document.querySelector('form input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Mi cargo local');input.dispatchEvent(new Event('input',{bubbles:true}));window.testHarness.conflict=true}`,
  );
  await evaluate(
    a,
    "document.querySelector('form button[type=submit]').click()",
  );
  await wait(a, "document.querySelector('#conflict-title')");
  assert.equal(
    await evaluate(
      a,
      "document.querySelector('table').textContent.includes('Mi cargo local') && document.querySelector('table').textContent.includes('Supervisor del servidor')",
    ),
    true,
  );
  await evaluate(a, "document.querySelector('input[type=radio]').click()");
  await evaluate(
    a,
    "Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Guardar resolución').click()",
  );
  await wait(
    a,
    "document.querySelector('article')?.textContent.includes('Mi cargo local')",
  );
  assert.equal(
    await evaluate(
      a,
      "window.testHarness.calls.filter(call=>call.method==='PATCH').at(-1).headers['If-Match']",
    ),
    '"5"',
  );
  console.log(
    "PASS editor: 412 shows original/local/server; explicit resolution uses updated ETag",
  );
  const denied = await page("?denied=1");
  await wait(denied, "document.body.textContent.includes('Sin permiso')");
  assert.equal(await evaluate(denied, "window.testHarness.calls.length"), 0);
  console.log(
    "PASS permissions: denied route does not issue protected requests",
  );
  const b = await page();
  await wait(b, "document.querySelector('article')");
  await evaluate(
    a,
    "window.testHarness.emit({type:'contingency.activated',eventId:100,data:{id:9,userId:12,status:'ACTIVE',createdAt:'2026-11-09T20:00:00Z',message:'Horas extra requeridas'}})",
  );
  await wait(a, "document.querySelector('dialog').open");
  await wait(b, "document.querySelector('dialog').open");
  await send(
    "Input.dispatchKeyEvent",
    { type: "keyDown", key: "Escape", code: "Escape" },
    a,
  );
  await send(
    "Input.dispatchKeyEvent",
    { type: "keyUp", key: "Escape", code: "Escape" },
    a,
  );
  assert.equal(
    await evaluate(a, "document.querySelector('dialog').open"),
    true,
  );
  await send(
    "Input.dispatchKeyEvent",
    { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
    a,
  );
  await send(
    "Input.dispatchKeyEvent",
    { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
    a,
  );
  assert.equal(
    await evaluate(a, "document.activeElement.closest('dialog')!==null"),
    true,
  );
  await evaluate(a, "document.querySelector('dialog button').click()");
  await wait(a, "document.querySelector('dialog [role=alert]')");
  assert.equal(
    await evaluate(b, "document.querySelector('dialog').open"),
    true,
  );
  await evaluate(
    a,
    "window.testHarness.failAck=false;document.querySelector('dialog button').click()",
  );
  await wait(a, "!document.querySelector('dialog').open");
  await wait(b, "!document.querySelector('dialog').open");
  console.log(
    "PASS contingency: native modal focus, Escape blocked, failed ack retained, cross-tab accepted ack",
  );
  const incidentPage = await page("?uploads=1&route=/incidents/new");
  await wait(incidentPage, "document.querySelector('input[type=file]')");
  await evaluate(
    incidentPage,
    `(async()=>{
    const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=900;
    const context=canvas.getContext('2d');context.fillStyle='#0f766e';context.fillRect(0,0,1200,900);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    const transfer=new DataTransfer();transfer.items.add(new File([blob],'one.png',{type:'image/png'}));transfer.items.add(new File([blob],'two.png',{type:'image/png'}));
    const input=document.querySelector('input[type=file]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  })()`,
  );
  await wait(
    incidentPage,
    "Array.from(document.querySelectorAll('[role=status]')).filter(el=>el.textContent==='Imagen confirmada').length===2",
  );
  await evaluate(
    incidentPage,
    `{
    const input=document.querySelector('form input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Reporte de prueba');input.dispatchEvent(new Event('input',{bubbles:true}));
    const area=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(area,'Evidencia del piso');area.dispatchEvent(new Event('input',{bubbles:true}));
  }`,
  );
  await evaluate(
    incidentPage,
    "document.querySelector('button[type=submit]').click()",
  );
  await wait(
    incidentPage,
    "document.querySelector('[role=alert]')?.textContent.includes('Reporte no guardado')",
  );
  assert.equal(
    await evaluate(incidentPage, "document.querySelector('form input').value"),
    "Reporte de prueba",
  );
  assert.equal(
    await evaluate(
      incidentPage,
      "window.testHarness.calls.filter(call=>call.path==='/media/tickets').length",
    ),
    2,
  );
  await evaluate(
    incidentPage,
    "window.testHarness.failIncident=false;document.querySelector('button[type=submit]').click()",
  );
  await wait(
    incidentPage,
    "document.querySelector('h1')?.textContent==='Incidencias'",
  );
  assert.equal(
    await evaluate(
      incidentPage,
      "window.testHarness.calls.filter(call=>call.path==='/media/tickets').length",
    ),
    2,
  );
  console.log(
    "PASS incident form: two parallel uploads, confirmed IDs only, failed report preserves data and photos, retry succeeds (test transport)",
  );
  const badgePage = await page("?uploads=1&route=/refiners/7/badge");
  await wait(badgePage, "document.querySelector('input[type=file]')");
  await evaluate(
    badgePage,
    `(async()=>{
    const canvas=document.createElement('canvas');canvas.width=900;canvas.height=600;canvas.getContext('2d').fillRect(0,0,900,600);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    const transfer=new DataTransfer();transfer.items.add(new File([blob],'badge.png',{type:'image/png'}));
    const input=document.querySelector('input[type=file]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  })()`,
  );
  await wait(badgePage, "document.querySelector('canvas')");
  await wait(
    badgePage,
    "Array.from(document.querySelectorAll('button')).some(button=>button.textContent==='Confirmar recorte' && !button.disabled)",
  );
  await evaluate(badgePage, "document.querySelector('canvas').focus()");
  await send(
    "Input.dispatchKeyEvent",
    { type: "keyDown", key: "+", code: "Equal" },
    badgePage,
  );
  await evaluate(
    badgePage,
    "Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Confirmar recorte').click()",
  );
  await evaluate(
    badgePage,
    "Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Procesar y subir').click()",
  );
  await wait(
    badgePage,
    "Array.from(document.querySelectorAll('button')).some(button=>button.textContent==='Guardar fotocheck confirmado')",
  );
  await evaluate(
    badgePage,
    "Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Guardar fotocheck confirmado').click()",
  );
  await wait(badgePage, "document.querySelector('article')");
  assert.equal(
    await evaluate(
      badgePage,
      "JSON.parse(window.testHarness.calls.find(call=>call.method==='PATCH').body).badgeMediaId",
    ),
    1,
  );
  console.log(
    "PASS badge form: native selection, keyboard zoom, crop, WebP/ticket/confirmation before PATCH (test transport)",
  );
  const images = await evaluate(
    a,
    `(async()=>{
    const {processImage,verifyWebP}=await import('/src/features/media/imageProcessor.ts')
    const {sha256}=await import('/src/features/media/imageHasher.ts')
    const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=1200
    const context=canvas.getContext('2d');const pixels=context.createImageData(1800,1200)
    for(let i=0;i<pixels.data.length;i+=4){pixels.data[i]=(i*13)%256;pixels.data[i+1]=(i*31)%256;pixels.data[i+2]=(i*43)%256;pixels.data[i+3]=255}context.putImageData(pixels,0,0)
    const source=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'))
    const badge=await processImage(source,'BADGE',{x:300,y:0,size:1200})
    const incident=await processImage(source,'INCIDENT')
    await verifyWebP(badge.blob,122880);await verifyWebP(incident.blob,307200)
    return {badge:{width:badge.width,height:badge.height,size:badge.blob.size,type:badge.blob.type},incident:{width:incident.width,height:incident.height,size:incident.blob.size,type:incident.blob.type},hash:await sha256(badge.blob)}
  })()`,
  );
  assert.deepEqual(
    [images.badge.width, images.badge.height, images.badge.type],
    [512, 512, "image/webp"],
  );
  assert.ok(images.badge.size <= 122880 && images.incident.size <= 307200);
  assert.ok(
    Math.max(images.incident.width, images.incident.height) >= 800 &&
      Math.max(images.incident.width, images.incident.height) <= 1600,
  );
  assert.match(images.hash, /^[0-9a-f]{64}$/);
  console.log("PASS Chrome canvas: " + JSON.stringify(images));
  await send('Page.bringToFront',{},b);
  await send(
    "Emulation.setDeviceMetricsOverride",
    { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
    b,
  );
  assert.equal(
    await evaluate(b, "document.documentElement.scrollWidth <= innerWidth"),
    true,
  );
  const screenshot = await send("Page.captureScreenshot", { format: "png" }, b);
  await writeFile(
    "/tmp/lumon-cp45-mobile.png",
    Buffer.from(screenshot.data, "base64"),
  );
  console.log(
    "PASS responsive 390px: no horizontal overflow; screenshot /tmp/lumon-cp45-mobile.png",
  );
  assert.equal(browserErrors.length, 0, JSON.stringify(browserErrors));
  console.log("PASS no uncaught browser exceptions");
} finally {
  socket?.close();
  chrome.kill("SIGTERM");
  await delay(200);
  await rm(profile, { recursive: true, force: true });
}
