// Real editor + generated app CSS, local data only. No account or database writes.
// node scripts/test-chapter-editor-ui.mjs <path-to-playwright-core/index.mjs>
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

if (!process.argv[2]) throw new Error("Pass the path to playwright-core/index.mjs");
const { chromium } = await import(pathToFileURL(path.resolve(process.argv[2])).href);
const entry = `
import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
import {ChapterEditor} from './src/components/author/chapter-editor';
function App() {
 const [title,setTitle]=useState('Chương kiểm thử');
 const [content,setContent]=useState(Array.from({length:100},(_,i)=>'Đoạn '+i+': '+ 'Nội dung bản thảo dùng để kiểm tra cuộn và định dạng. '.repeat(5)).join('\\n\\n'));
 return <div className="flex min-w-0 flex-1 flex-col lg:grid lg:h-dvh lg:flex-none lg:grid-cols-[264px_minmax(0,1fr)] lg:overflow-hidden">
 <aside className="hidden lg:block">Danh sách truyện</aside>
 <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:overflow-hidden">
 <ChapterEditor bookTitle={'Tên tác phẩm rất dài '.repeat(8)} title={title} onTitleChange={setTitle}
 content={content} onContentChange={setContent} onUndo={()=>null} onRedo={()=>null} canUndo={false} canRedo={false}
 onSaveShortcut={()=>{window.__saves=(window.__saves||0)+1;window.__savedTitle=title;}}
 saveStatus={{tone:'ok',label:'Đã lưu · 10:30'}} isLastChapter={false} onIsLastChapterToggle={()=>{}}
 isLastChapterLocked={false} bookSlug="test" bookPublished={true}/>
 <aside className="hidden lg:block">Xuất bản</aside></div></div>;
}
createRoot(document.getElementById('root')).render(<App/>);
`;
const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd(), sourcefile: "editor-test.tsx", loader: "tsx" },
 bundle: true, write: false, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' },
 plugins: [{ name: "test-link", setup(builder) {
  builder.onResolve({filter:/^next\/link$/},()=>({path:"link",namespace:"test"}));
  builder.onLoad({filter:/.*/,namespace:"test"},()=>({contents:'import React from "react"; export default function Link({href,children,...props}) {return <a href={href} {...props}>{children}</a>}',loader:"jsx",resolveDir:process.cwd()}));
 }}],
});
const css = (await postcss([tailwind()]).process(await readFile('src/app/globals.css','utf8'),{from:path.resolve('src/app/globals.css')})).css;
const server = createServer((req,res)=>{
 if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);}
 else if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css);}
 else {res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="vi"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><style>html,body{margin:0}#root{height:100dvh;display:flex;flex-direction:column}</style><div id="root"></div><script src="/bundle.js"></script></html>');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
const results=[];
try {
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await mkdir('.tmp/chapter-editor',{recursive:true});
 for(const width of [375,768,1024,1366,1920]) {
  console.log('Checking viewport',width);
  await page.setViewportSize({width,height:900}); await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(()=>localStorage.clear()); await page.reload();
  const content=page.getByPlaceholder('Bắt đầu viết…');await content.waitFor();
  const preview=page.getByTitle('Chia đôi: soạn bên trái, xem như độc giả bên phải',{exact:true});
  assert.equal(await preview.isVisible(),width>=1280,`preview breakpoint at ${width}`);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`horizontal overflow at ${width}`);
  const status=page.getByRole('status');
  const statusBox=await status.boundingBox();
  assert.ok(statusBox.y>=0 && statusBox.y+statusBox.height<=900,`status outside viewport at ${width}`);
  const title=page.getByPlaceholder('Tên chương');await title.fill('Tên chương vừa nhập');await title.press('Control+s');
  assert.equal(await page.evaluate(()=>window.__savedTitle),'Tên chương vừa nhập');
  if(width>=1280){
   await preview.click();const pane=page.getByRole('complementary',{name:'Xem trước như độc giả'});await pane.waitFor();
   await content.focus(); await content.press('Control+End'); await content.press('ArrowLeft');
   await page.waitForFunction(()=>document.querySelector('[aria-label="Xem trước như độc giả"]').scrollTop>0);
   await pane.evaluate(el=>new Promise(resolve=>{
    let previous=el.scrollTop,stable=0;
    function check(){const next=el.scrollTop;stable=next===previous?stable+1:0;previous=next;if(stable>=8)resolve();else requestAnimationFrame(check);}
    requestAnimationFrame(check);
   }));
   const before=await pane.evaluate(el=>el.scrollTop);
   await page.locator('[data-editor-scroll]').evaluate(el=>{el.scrollTop=400;});
   assert.equal(await pane.evaluate(el=>el.scrollTop),before,'independent preview scroll');
   await page.screenshot({path:`.tmp/chapter-editor/${width}-split.png`});
   await page.getByTitle('Tắt xem trước',{exact:true}).click();
   await page.getByTitle('Mở rộng trang viết hết khung',{exact:true}).click();
   assert.ok(await content.evaluate(el=>el.clientHeight>=el.scrollHeight-2),'wide content clipped');
  }
  await title.press('Control+Shift+f');
  const exit=page.getByTitle('Thoát chế độ tập trung (Esc)',{exact:true});await exit.waitFor();
  assert.equal(await preview.isVisible(),width>=1024,`focus preview breakpoint at ${width}`);
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');
  if(width>=1024){
   await preview.click();
   assert.equal(await page.getByRole('complementary',{name:'Xem trước như độc giả'}).isVisible(),true);
   await page.getByTitle('Tắt xem trước',{exact:true}).click();
  }
  const focusStatus=await status.boundingBox();
  assert.ok(focusStatus.y+focusStatus.height<=900,'focus status outside viewport');
  if(width===375){
   // Viewport shrink covers layout only; this does not emulate an OS keyboard.
   await page.setViewportSize({width,height:420});
   const resizedStatus=await status.boundingBox();
   assert.ok(resizedStatus.y>=0 && resizedStatus.y+resizedStatus.height<=420,'small focus viewport clips status');
   await page.setViewportSize({width,height:900});
  }
  await title.press('Escape');
  assert.equal(await exit.count(),0);assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
  await page.screenshot({path:`.tmp/chapter-editor/${width}.png`});
  results.push({width,status:'passed'});
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify(results,null,2));
 await writeFile('.tmp/chapter-editor/results.json',JSON.stringify(results,null,2));
} finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
