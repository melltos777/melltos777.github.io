(() => {
  'use strict';
  const tg = window.Telegram?.WebApp;
  if (tg) { try { tg.ready(); tg.expand(); } catch (_) {} }

  const STORAGE = 'quicklist_v2_state';
  const DAILY_LIMIT = 5;
  const state = loadState();
  let lastResult = null;

  const $ = id => document.getElementById(id);
  const els = {
    tabs: [...document.querySelectorAll('.tab')],
    panels: [...document.querySelectorAll('.tab-panel')],
    generate: $('generate'), topic: $('topic'), details: $('details'), mode: $('mode'), price: $('price'), currency: $('currency'), tone: $('tone'), audience: $('audience'),
    hint: $('hint'), result: $('result'), outTitle: $('outTitle'), outDescription: $('outDescription'), outTags: $('outTags'), copyAll: $('copyAll'), share: $('share'), saveAgain: $('saveAgain'),
    historyList: $('historyList'), emptyHistory: $('emptyHistory'), clearHistory: $('clearHistory'), freeCount: $('freeCount'), historyCount: $('historyCount'), proStatus: $('proStatus'), buyPro: $('buyPro'), paymentHint: $('paymentHint'),
    profileBtn: $('profileBtn'), profileAvatar: $('profileAvatar'), profileName: $('profileName'), profileUsername: $('profileUsername'), profilePlan: $('profilePlan'), profileUsed: $('profileUsed'), profileSaved: $('profileSaved'), profileRefs: $('profileRefs'),
    refLink: $('refLink'), shareRef: $('shareRef'), toast: $('toast')
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE);
      const s = raw ? JSON.parse(raw) : {};
      const today = new Date().toISOString().slice(0,10);
      return { date: today, used: s.date === today ? (s.used || 0) : 0, history: Array.isArray(s.history) ? s.history : [], refs: s.refs || 0, pro: !!s.pro };
    } catch (_) { return { date: new Date().toISOString().slice(0,10), used: 0, history: [], refs: 0, pro: false }; }
  }
  function persist(){ try{ localStorage.setItem(STORAGE, JSON.stringify(state)); }catch(_){} updateUI(); }
  function toast(msg){ els.toast.textContent = msg; els.toast.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(()=>els.toast.classList.remove('show'),1800); }
  function escapeHtml(v){ return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function updateUI(){
    const remaining = state.pro ? '∞' : Math.max(0, DAILY_LIMIT-state.used);
    els.freeCount.textContent = remaining; els.historyCount.textContent=state.history.length; els.proStatus.textContent=state.pro?'PRO':'FREE';
    els.profilePlan.textContent=state.pro?'PRO':'FREE'; els.profileUsed.textContent=state.pro?`${state.used} / ∞`:`${state.used} / ${DAILY_LIMIT}`; els.profileSaved.textContent=state.history.length; els.profileRefs.textContent=state.refs;
    renderUser(); renderHistory(); buildReferral();
  }
  function renderUser(){
    const u=tg?.initDataUnsafe?.user;
    if(!u) return;
    const name=(u.first_name||'Пользователь')+(u.last_name?` ${u.last_name}`:'');
    els.profileName.textContent=name; els.profileUsername.textContent=u.username?`@${u.username}`:'Telegram пользователь';
    const letter=(u.first_name||'Q').slice(0,1).toUpperCase(); els.profileAvatar.textContent=letter; els.profileBtn.textContent=letter;
  }
  function buildReferral(){
    const u=tg?.initDataUnsafe?.user; const id=u?.id || 'demo';
    const botUser = 'YOUR_BOT_USERNAME';
    const link = botUser !== 'YOUR_BOT_USERNAME' ? `https://t.me/${botUser}?startapp=ref_${id}` : 'После подключения username бота здесь будет твоя реферальная ссылка';
    els.refLink.textContent=link;
    els.shareRef.dataset.link = link;
  }
  function canGenerate(){ return state.pro || state.used < DAILY_LIMIT; }
  function makeTags(text, mode){
    const words=[...new Set(text.toLowerCase().replace(/[^a-zа-яё0-9\s]/gi,' ').split(/\s+/).filter(w=>w.length>3))].slice(0,7);
    const base=mode==='hook'?['#shorts','#reels','#content']:['#объявление','#товар','#продажа'];
    return [...base,...words.slice(0,4).map(w=>`#${w}`)].join(' ');
  }
  function generateContent(){
    const topic=els.topic.value.trim(); const details=els.details.value.trim(); const price=els.price.value.trim(); const cur=els.currency.value; const mode=els.mode.value; const tone=els.tone.value;
    if(!topic){ toast('Напиши тему или товар'); els.topic.focus(); return null; }
    const priceLine=price?` Цена: ${price} ${cur}.`:'';
    const cleanDetails=details || 'практичное решение с понятными преимуществами';
    let title='', body='';
    if(mode==='listing'){
      const toneWord={clear:'Чёткое',friendly:'Отличное',premium:'Премиальное',fast:'Срочное'}[tone];
      title=`${toneWord} предложение: ${topic}`;
      body=`${topic} — ${cleanDetails}.${priceLine}\n\nПочему стоит посмотреть: понятные характеристики, удобная подача и акцент на том, что действительно важно покупателю.\n\nПишите в Telegram, чтобы уточнить детали и договориться.`;
    } else if(mode==='social'){
      title=`🔥 ${topic}: коротко о главном`;
      body=`${topic} — ${cleanDetails}.${priceLine}\n\nВот что стоит знать: показываем пользу, убираем лишнее и даём человеку понятную причину попробовать/купить.\n\nСохрани пост и отправь тому, кому это пригодится.`;
    } else if(mode==='hook'){
      title=`3 hook-идеи для ${topic}`;
      body=`1) «Ты всё ещё тратишь время на ${topic.toLowerCase()}? Вот способ проще».\n2) «Я проверил ${topic.toLowerCase()} — вот что реально важно».\n3) «90% людей делают это неправильно: ${topic.toLowerCase()} можно быстрее».`;
    } else {
      title=`${topic} — главное за 10 секунд`;
      body=`${topic}: ${cleanDetails}.${priceLine}\n\nИдея проста: выделить 1 сильную пользу, убрать лишнее и дать человеку следующий шаг.`;
    }
    return { title, description: body, tags: makeTags(`${topic} ${details}`, mode), mode, topic, at: new Date().toISOString() };
  }
  function renderResult(r){ els.outTitle.textContent=r.title; els.outDescription.textContent=r.description; els.outTags.textContent=r.tags; els.result.classList.remove('hidden'); lastResult=r; }
  function addHistory(r){ state.history.unshift(r); state.history=state.history.slice(0,30); persist(); }
  function renderHistory(){
    els.emptyHistory.style.display=state.history.length?'none':'block';
    els.historyList.innerHTML=state.history.map((r,i)=>`<div class="history-item"><div class="meta"><span>${new Date(r.at).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span><span>${escapeHtml(r.mode)}</span></div><h3>${escapeHtml(r.title)}</h3><p>${escapeHtml(r.description)}</p><button class="mini-copy" data-history="${i}">Копировать</button></div>`).join('');
    els.historyList.querySelectorAll('[data-history]').forEach(b=>b.addEventListener('click',()=>{ const r=state.history[Number(b.dataset.history)]; copyText(`${r.title}\n\n${r.description}\n\n${r.tags}`,'Скопировано'); }));
  }
  async function copyText(text,msg='Готово'){ try{ await navigator.clipboard.writeText(text); toast(msg);}catch(_){toast('Скопируй текст вручную');} }
  function shareText(text){
    const url=`https://t.me/share/url?url=&text=${encodeURIComponent(text)}`;
    if(tg?.openTelegramLink){ tg.openTelegramLink(url); } else { window.open(url,'_blank'); }
  }
  function switchTab(name){ els.tabs.forEach(t=>t.classList.toggle('active',t.dataset.tab===name)); els.panels.forEach(p=>p.classList.toggle('active',p.id===`tab-${name}`)); }
  async function buyPro(){
    if(state.pro){toast('PRO уже включён на этом устройстве');return;}
    const base = localStorage.getItem('quicklist_backend') || '';
    if(!base){
      toast('Backend ещё не подключён');
      els.paymentHint.textContent='Для реальной оплаты: добавь URL Cloudflare Worker в настройках проекта. Сейчас это безопасная демо-кнопка.';
      return;
    }
    try{
      const res=await fetch(`${base.replace(/\/$/,'')}/create-invoice`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product:'pro_monthly'})});
      if(!res.ok) throw new Error('invoice');
      const data=await res.json();
      if(data.url && tg?.openInvoice) tg.openInvoice(data.url,(status)=>{ if(status==='paid'){ state.pro=true; persist(); toast('PRO активирован'); } });
      else if(data.url) window.open(data.url,'_blank'); else throw new Error('no url');
    }catch(e){ console.error(e); toast('Не удалось открыть оплату'); }
  }
  els.tabs.forEach(t=>t.addEventListener('click',()=>switchTab(t.dataset.tab)));
  els.generate.addEventListener('click',()=>{
    if(!canGenerate()){ toast('Лимит FREE исчерпан — подключи PRO'); switchTab('profile'); return; }
    const r=generateContent(); if(!r) return;
    if(!state.pro) state.used += 1; addHistory(r); renderResult(r); persist();
    els.hint.textContent=state.pro?'PRO: без лимита для этой демо-версии.':`Осталось ${DAILY_LIMIT-state.used} бесплатных генераций сегодня.`;
  });
  els.copyAll.addEventListener('click',()=> lastResult && copyText(`${lastResult.title}\n\n${lastResult.description}\n\n${lastResult.tags}`,'Всё скопировано'));
  document.querySelectorAll('.mini-copy[data-target]').forEach(b=>b.addEventListener('click',()=>copyText($(b.dataset.target).textContent,'Скопировано')));
  els.share.addEventListener('click',()=> lastResult && shareText(`${lastResult.title}\n\n${lastResult.description}\n\n${lastResult.tags}`));
  els.saveAgain.addEventListener('click',()=>{ if(lastResult) {addHistory(lastResult); toast('Сохранено в истории');} });
  els.clearHistory.addEventListener('click',()=>{state.history=[];persist();toast('История очищена');});
  els.profileBtn.addEventListener('click',()=>switchTab('profile'));
  els.buyPro.addEventListener('click',buyPro);
  els.shareRef.addEventListener('click',()=>shareText(`Приглашение в QuickList: ${els.refLink.textContent}`));
  updateUI();
})();
