'use strict';
const $ = id => document.getElementById(id);
let mode = 'register', signedIn = false, launchBusy = false;
const API_ORIGIN = new URL(window.WindSlayerConfig?.apiOrigin || location.origin).origin;
const CROSS_ORIGIN = API_ORIGIN !== location.origin;
const SESSION_KEY = 'windslayer-session:' + API_ORIGIN;
let webSession = '';
try { if (CROSS_ORIGIN) webSession = sessionStorage.getItem(SESSION_KEY) || ''; } catch {}
function saveSession(token) {
  webSession = token;
  try { if (token) sessionStorage.setItem(SESSION_KEY, token); else sessionStorage.removeItem(SESSION_KEY); } catch {}
}
async function api(path, data) {
  const headers = {};
  if (CROSS_ORIGIN && webSession) headers.Authorization = 'Bearer ' + webSession;
  const options = {headers, cache:'no-store', credentials: CROSS_ORIGIN ? 'omit' : 'same-origin'};
  if (data !== undefined) {
    options.method = 'POST'; headers['Content-Type'] = 'application/json';
    headers['X-Requested-With'] = 'WindSlayer'; options.body = JSON.stringify(data);
  }
  const response = await fetch(API_ORIGIN + '/api/' + path, options);
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && CROSS_ORIGIN) saveSession('');
    const error = new Error(result.error || '요청에 실패했습니다.'); error.status = response.status; throw error;
  }
  if (path === 'login' && CROSS_ORIGIN) {
    if (!/^[a-f0-9]{64}$/.test(result.session || '')) throw new Error('로그인 응답을 확인하지 못했습니다.');
    saveSession(result.session);
  }
  if (path === 'logout' && CROSS_ORIGIN) saveSession('');
  return result;
}
function setMode(next) {
  mode = next;
  for (const name of ['register', 'login']) {
    $(name + '-tab').setAttribute('aria-selected', String(name === mode));
    $(name + '-tab').tabIndex = name === mode ? 0 : -1;
  }
  $('confirm-row').hidden = mode !== 'register'; $('confirm').required = mode === 'register';
  $('password').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
  $('form-title').textContent = mode === 'register' ? '모험의 첫 페이지' : '다시 만나 반갑습니다';
  $('form-desc').textContent = mode === 'register' ? '윈드슬레이어에서 새로운 이야기를 시작하세요.' : '당신이 남겨 둔 이야기를 이어가세요.';
  $('submit').textContent = mode === 'register' ? '계정 만들기 →' : '로그인 →'; $('status').textContent = '';
}
function setSignedIn(value) {
  signedIn = value; $('auth').hidden = value; $('dashboard').hidden = !value;
  $('header-login').hidden = value; $('header-register').hidden = value; $('my-account').hidden = !value;
  $('account-dialog').setAttribute('aria-labelledby', value ? 'dashboard-title' : 'form-title');
}
$('dashboard').querySelector('h2').id = 'dashboard-title';
function openAccount(next = 'login') {
  if (!signedIn) setMode(next);
  if (!$('account-dialog').open) $('account-dialog').showModal();
  if (!signedIn) $('username').focus();
}
async function refresh() {
  const me = await api('me'); setSignedIn(true); $('characters').replaceChildren();
  for (const c of me.characters) {
    const li = document.createElement('li'), level = document.createElement('span');
    li.append(document.createTextNode(c.name)); level.textContent = `Lv. ${c.level}`; li.append(level); $('characters').append(li);
  }
  if (!me.characters.length) { const li = document.createElement('li'); li.textContent = '아직 비어 있는 모험의 페이지. 게임에서 첫 캐릭터를 만들어 보세요.'; $('characters').append(li); }
}
document.querySelectorAll('[data-auth]').forEach(button => button.addEventListener('click', () => openAccount(button.dataset.auth)));
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
}
$('my-account').onclick = () => { openAccount(); refresh().catch(error => { $('status').textContent = error.message; if (error.status === 401) { setSignedIn(false); setMode('login'); } }); };
$('register-tab').onclick = () => setMode('register'); $('login-tab').onclick = () => setMode('login');
document.querySelector('.tabs').addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); setMode(mode === 'register' ? 'login' : 'register'); $(mode + '-tab').focus(); } });
$('account-form').onsubmit = async event => {
  event.preventDefault(); $('status').textContent = ''; $('submit').disabled = true;
  try {
    if (mode === 'register' && $('password').value !== $('confirm').value) throw new Error('비밀번호가 서로 다릅니다.');
    const data = {username: $('username').value, password: $('password').value, gender: Number($('gender').value)};
    if (mode === 'register') await api('register', data);
    await api('login', data); $('password').value = ''; $('confirm').value = ''; await refresh();
    $('status').textContent = '로그인했습니다. 게임 시작 버튼으로 모험을 시작하세요.';
  } catch (error) { $('status').textContent = error.message || '서버에 연결하지 못했습니다.'; }
  finally { $('submit').disabled = false; }
};
$('logout').onclick = async () => {
  try { await api('logout', {}); setSignedIn(false); setMode('login'); }
  catch(error) { $('status').textContent = error.message; }
};
function launchMessage(title, message) { $('launch-title').textContent = title; $('launch-message').textContent = message; }
async function launch() {
  if (!signedIn) { openAccount('login'); $('status').textContent = '게임을 시작하려면 먼저 로그인해 주세요.'; return; }
  if (launchBusy) return;
  launchBusy = true; document.querySelectorAll('[data-launch]').forEach(b => b.disabled = true);
  $('account-dialog').close(); $('open-launcher').hidden = true; $('open-launcher').removeAttribute('href');
  launchMessage('접속권을 준비하고 있습니다', '로그인한 계정으로 모험을 시작합니다.');
  if (!$('launch-dialog').open) $('launch-dialog').showModal();
  try {
    const result = await api('launch', {});
    if (!/^pyslayer:\/\/launch\?code=[a-f0-9]{64}$/.test(result.url)) throw new Error('올바르지 않은 실행 링크입니다.');
    $('open-launcher').href = result.url; $('open-launcher').hidden = false;
    launchMessage('당신의 PC에서 모험을 시작하세요', '아래 실행기 열기를 누르고 브라우저의 실행 요청을 허용해 주세요. 접속권은 3분 동안 한 번만 사용할 수 있습니다.');
  }
  catch(error) {
    launchMessage('게임을 실행하지 못했습니다', error.message || '서버 연결을 확인한 뒤 다시 시도해 주세요.');
    if (error.status === 401) setSignedIn(false);
  } finally { launchBusy = false; document.querySelectorAll('[data-launch]').forEach(b => b.disabled = false); }
}
document.querySelectorAll('[data-launch]').forEach(button => button.addEventListener('click', launch));
async function checkServer() {
  try { const result = await api('status'); $('server-status').textContent = result.launch_available ? '모험 준비 완료' : '계정 서비스 연결됨'; $('server-dot').classList.add('online'); }
  catch { $('server-status').textContent = '서버 연결 확인'; $('server-dot').classList.remove('online'); }
}
checkServer(); setInterval(checkServer, 30000); refresh().catch(() => setSignedIn(false));

async function openDownload() {
  $('launch-dialog').close(); $('account-dialog').close();
  if (!$('download-dialog').open) $('download-dialog').showModal();
  try {
    const info = await api('download');
    $('download-client').href = API_ORIGIN + '/downloads/WindSlayer-Client.zip';
    $('download-client').hidden = !info.available;
    $('download-info').textContent = info.available ? `Windows PC · ${(info.size / 1024 / 1024).toFixed(1)} MB · 게임 + 전용 실행기` : '클라이언트 패키지를 준비하고 있습니다. 잠시 후 다시 확인해 주세요.';
  } catch { $('download-client').hidden = true; $('download-info').textContent = '다운로드 서버에 연결하지 못했습니다.'; }
}
document.querySelectorAll('[data-download]').forEach(button => button.addEventListener('click', openDownload));
