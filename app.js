const tg=window.Telegram?.WebApp;
if(tg){tg.ready();tg.expand();}
document.getElementById('menuBtn').onclick=()=>console.log('MENU');
document.getElementById('contactBtn').onclick=()=>console.log('KONTAKT');
