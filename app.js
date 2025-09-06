//:root{
color - scheme: dark;
--bg:#0b0d10; --panel:#10141a; --muted: #a7b0bf;
--text: #e8edf4; --prim:#3b82f6; --prim - 700:#2e6bd0; --danger: #e5484d;
--border:#1b2430;
}

* { box- sizing: border - box}
html, body{ height: 100 %}
body{
    margin: 0; font - family: system - ui, -apple - system, Segoe UI, Roboto, Ubuntu, sans - serif;
    background: var(--bg); color: var(--text);
}

.topbar{
    max - width: 1200px; margin: 24px auto 8px; padding: 0 16px;
    display: flex; flex - wrap: wrap; gap: 12px; align - items: center; justify - content: space - between;
}
.topbar h1{ margin: 0; font - size: clamp(1.6rem, 2.2vw, 2.4rem); letter - spacing: .3px }
.toolbar{ display: flex; gap: 8px; align - items: center; flex - wrap: wrap }
.input{
    background: var(--panel); border: 1px solid var(--border); color: var(--text);
    padding: .55rem .7rem; border - radius: .6rem; outline: none; min - width: 220px;
}
.input:focus{ border - color:#2e3a52 }

.btn{
    border: 1px solid var(--border); background: var(--panel); color: var(--text);
    padding: .55rem .8rem; border - radius: .6rem; cursor: pointer; transition: .15s;
}
.btn:hover{ filter: brightness(1.05) }
.btn.primary{ background: var(--prim); border - color: var(--prim); color: white }
.btn.primary:hover{ background: var(--prim - 700) }
.btn.ghost{ background: transparent }
.btn.spinner{ margin - inline: .35rem }

.muted{ color: var(--muted) }
.center{ display: flex; justify - content: center; margin: 16px 0 }

.content{ max - width: 1200px; margin: 6px auto 32px; padding: 0 16px }
.hint{ background:#0f1320; border: 1px dashed #1e2c49; border - radius: 12px; padding: .8rem 1rem; margin: 4px 0 14px }

.grid{ display: grid; grid - template - columns: repeat(auto - fill, minmax(300px, 1fr)); gap: 16px }
.card{
    background: var(--panel); border: 1px solid var(--border); border - radius: 14px;
    overflow: hidden; display: flex; flex - direction: column
}
.card.media iframe,.card.media video{ width: 100 %; aspect - ratio: 16 / 9; border: 0; display: block; background:#0c0f14 }
.card.meta{ padding: 12px }
.card.title{ margin: .2rem 0; font - size: 1.05rem }
.card.date{ margin: 0 0 .35rem }
.card.desc{ margin: .3rem 0 }
.tags{ display: flex; flex - wrap: wrap; gap: .4rem }
.tag{ background:#0f1729; color:#93b2ff; border: 1px solid #17223a; padding: .15rem .5rem; font - size: .8rem; border - radius: 999px }

.cardActions{ display: flex; gap: 8px; padding: 10px 12px 12px }
.mini{ border: 1px solid var(--border); background:#0e1117; color: var(--text); border - radius: .45rem; padding: .35rem .6rem; cursor: pointer }
.mini.danger{ background:#2a0f10; color: #ffb3b5; border - color:#3a1a1b }
.mini:hover{ filter: brightness(1.1) }

.dialog{ border: 0; border - radius: 16px; padding: 0; background: var(--panel); color: var(--text); width: min(720px, 92vw) }
.dialog::backdrop{ background: rgba(0, 0, 0, .55) }
.dialogBody{ padding: 0; margin: 0 }
.dialogHeader{ padding: 14px 16px 6px; border - bottom: 1px solid var(--border) }
.dialogHeader h3{ margin: .1rem 0 .6rem }
.tabs{ display: flex; gap: 8px }
.tab{
    background:#0e1117; border: 1px solid var(--border); color: var(--text);
    padding: .35rem .6rem; border - radius: .45rem; cursor: pointer
}
.tab.active{ background:#182033; border - color:#22314e }

.dialog section{ padding: 14px 16px; display: block }
label{ display: block; margin: .6rem 0 }
label.input, label textarea{ width: 100 %}
.row{ display: grid; grid - template - columns: 1fr 1fr; gap: 10px }
.dialogFooter{ display: flex; gap: 10px; justify - content: flex - end; padding: 12px 16px; border - top: 1px solid var(--border) }

/* DropZone upload */
.dropZone{
    border: 2px dashed #2b2b2b; border - radius: 12px;
    background:#0e0e0e; color: #dcdcdc;
    padding: 1.2rem; text - align: center; cursor: pointer;
    transition:all .15s ease; outline: none;
}
.dropZone: hover,.dropZone.hover{ border - color:#3b82f6; background:#10141d; }
.dropZone.dzIcon{ font - size: 2rem; opacity: .85; }
.dropZone.dzText{ margin - top: .35rem; font - size: .95rem; opacity: .85; }

progress{ width: 100 %; height: 10px; margin - top: .6rem }
